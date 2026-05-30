package web

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/slaguardia/scout/internal/enrich"
	"github.com/slaguardia/scout/internal/filter"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/jobs"
	"github.com/slaguardia/scout/internal/verdict"
)

// runOptions is the optional JSON body for POST /api/run/{stage}.
type runOptions struct {
	Force bool `json:"force"`
}

// handleRun starts a pipeline stage as a job. POST /api/run/{stage}.
func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	if s.Runner == nil {
		http.Error(w, "control surface disabled", http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stage := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/run/"), "/")

	var opts runOptions
	if r.Body != nil {
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&opts) // body optional
	}

	var fn jobs.Func
	switch stage {
	case "enrich":
		fn = s.enrichJob(opts)
	case "verdict":
		if s.Anthropic == nil || s.Anthropic.APIKey == "" {
			http.Error(w, "verdict needs ANTHROPIC_API_KEY in the server environment", http.StatusPreconditionFailed)
			return
		}
		fn = s.verdictJob(opts)
	default:
		http.Error(w, "unknown stage: "+stage, http.StatusBadRequest)
		return
	}

	job, err := s.Runner.Start(stage, fn)
	if err != nil {
		var busy jobs.ErrBusy
		if errors.As(err, &busy) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"job_id": job.ID, "stage": stage})
}

func (s *Server) enrichJob(opts runOptions) jobs.Func {
	return func(ctx context.Context, _ string, emit func(string)) (map[string]any, error) {
		e := &enrich.Enricher{DB: s.DB, Progress: emit}
		res, err := e.Run(ctx, opts.Force)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"considered": res.Considered, "fetched": res.Fetched,
			"ok": res.OK, "failed": res.Failed,
		}, nil
	}
}

func (s *Server) verdictJob(opts runOptions) jobs.Func {
	return func(ctx context.Context, id string, emit func(string)) (map[string]any, error) {
		ft, err := filter.LoadTaste(s.TasteTOMLPath)
		if err != nil {
			return nil, err
		}
		tb := s.currentTaste()
		if tb == nil {
			return nil, fmt.Errorf("no taste loaded (check %s)", s.TasteMDPath)
		}
		sc := &verdict.Scorer{
			DB:       s.DB,
			Taste:    tb,
			Filter:   ft,
			Client:   s.Anthropic,
			Playbook: s.currentPlaybook(),
			RunID:    id, // tags decision-trail rows with this run
			Force:    opts.Force,
			Workers:  4,
			Progress: emit,
		}
		res, err := sc.Run(ctx)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"considered": res.Considered, "scored": res.Scored,
			"skipped": res.Skipped, "failed": res.Failed,
			"by_verdict": res.ByVerdict,
		}, nil
	}
}

// handleJob streams or cancels a job. /api/jobs/{id}/stream (GET SSE),
// /api/jobs/{id}/cancel (POST).
func (s *Server) handleJob(w http.ResponseWriter, r *http.Request) {
	if s.Runner == nil {
		http.Error(w, "control surface disabled", http.StatusServiceUnavailable)
		return
	}
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/jobs/"), "/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 {
		http.NotFound(w, r)
		return
	}
	id, action := parts[0], parts[1]
	switch action {
	case "stream":
		s.handleJobStream(w, r, id)
	case "cancel":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if s.Runner.Cancel(id) {
			writeJSON(w, http.StatusOK, map[string]any{"canceled": true})
		} else {
			writeJSON(w, http.StatusOK, map[string]any{"canceled": false})
		}
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleJobStream(w http.ResponseWriter, r *http.Request, id string) {
	job := s.Runner.Get(id)
	if job == nil {
		http.NotFound(w, r)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	backlog, ch, _ := job.Subscribe()
	for _, line := range backlog {
		writeSSE(w, "line", line)
	}
	flusher.Flush()

	for {
		select {
		case line, open := <-ch:
			if !open {
				writeSSE(w, "end", job.CurrentStatus())
				flusher.Flush()
				return
			}
			writeSSE(w, "line", line)
			flusher.Flush()
		case <-r.Context().Done():
			return // client disconnected
		}
	}
}

func writeSSE(w http.ResponseWriter, event, data string) {
	// One data line per SSE message; data is single-line (our lines never
	// contain newlines, but guard anyway).
	data = strings.ReplaceAll(data, "\n", " ")
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
}

// handleMeta reports capabilities so the UI can gate buttons. GET /api/meta.
func (s *Server) handleMeta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"control": s.Runner != nil,
		"brain":   s.brainHealthy(r.Context()),
		"verdict": s.Anthropic != nil && s.Anthropic.APIKey != "",
		"source":  s.IngestSource,
	})
}

// handleRuns returns durable run history. GET /api/runs.
func (s *Server) handleRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	runs, err := s.DB.ListRuns(30)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	busy := ""
	if s.Runner != nil {
		busy = s.Runner.Busy()
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "busy_stage": busy})
}

// handleIngest accepts a multipart CSV upload, saves it to a temp file, and
// runs ingest as a job. POST /api/ingest (field name: "csv").
func (s *Server) handleIngest(w http.ResponseWriter, r *http.Request) {
	if s.Runner == nil {
		http.Error(w, "control surface disabled", http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil { // 32 MB in-memory cap
		http.Error(w, "bad multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, hdr, err := r.FormFile("csv")
	if err != nil {
		http.Error(w, "missing 'csv' file field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	tmp, err := os.CreateTemp("", "scout-upload-*.csv")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tmpPath := tmp.Name()
	if _, err := io.Copy(tmp, file); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		http.Error(w, "write temp: "+err.Error(), http.StatusInternalServerError)
		return
	}
	tmp.Close()

	source := s.IngestSource
	if source == "" {
		source = "crunchbase"
	}
	filename := hdr.Filename

	fn := func(ctx context.Context, _ string, emit func(string)) (map[string]any, error) {
		defer os.Remove(tmpPath)
		emit(fmt.Sprintf("ingesting %s (source=%s)…", filename, source))
		c := &ingest.CSV{Source: source, DB: s.DB}
		res, err := c.Run(tmpPath)
		if err != nil {
			return nil, err
		}
		emit(fmt.Sprintf("read=%d upserted=%d (%d new, %d merged) skipped=%d errors=%d",
			res.Read, res.Upserted, res.Upserted-res.Merged, res.Merged, res.Skipped, len(res.Errors)))
		return map[string]any{
			"read": res.Read, "upserted": res.Upserted,
			"inserted": res.Upserted - res.Merged, "merged": res.Merged,
			"skipped": res.Skipped, "errors": len(res.Errors),
			"filename": filename,
		}, nil
	}

	job, err := s.Runner.Start("ingest", fn)
	if err != nil {
		os.Remove(tmpPath)
		var busy jobs.ErrBusy
		if errors.As(err, &busy) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"job_id": job.ID, "stage": "ingest"})
}
