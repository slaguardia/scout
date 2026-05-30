// Package web serves the triage UI on localhost.
//
// An embedded HTML page plus JSON endpoints. Beyond the read/triage surface
// (companies, detail, stats, brain proxy) it also drives the pipeline:
// /api/run/* and /api/ingest start jobs via an in-process runner, /api/jobs/*
// stream and cancel them, /api/runs lists durable history, and /api/taste &
// /api/playbook read/write the local instruction files.
//
// Concurrency note: taste/playbook are guarded by mu because /api/stats reads
// them while a taste/playbook PUT can reload them.
package web

import (
	"context"
	"database/sql"
	"encoding/json"
	_ "embed"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/jobs"
	"github.com/slaguardia/scout/internal/playbook"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

//go:embed index.html
var indexHTML []byte

// Server holds dependencies. Brainbot is optional. The Runner + paths power
// the control surface; when Runner is nil the run/ingest/editor routes 503.
type Server struct {
	DB       *store.DB
	Brainbot *brainbot.Client // optional
	Runner   *jobs.Runner     // optional; nil disables the control surface

	// Stage construction inputs (used by the run handlers).
	Anthropic     *anthropic.Client
	TasteMDPath   string
	TasteTOMLPath string
	PlaybookPath  string
	IngestSource  string

	mu           sync.RWMutex
	taste        *taste.Block // current; recomputed by ReloadTaste
	playbookText string       // current playbook text
}

// ReloadTaste resolves the criteria block (brain-primary, taste.md fallback)
// and folds the playbook into the version (matching `scout verdict`). Safe to
// call concurrently with reads. When neither source yields criteria, taste is
// left nil. Called at startup and after every editor PUT.
func (s *Server) ReloadTaste() {
	var tb *taste.Block
	if s.Brainbot != nil && s.Brainbot.Enabled() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := s.Brainbot.Health(ctx); err == nil {
			if text, err := s.Brainbot.Criteria(ctx); err == nil && strings.TrimSpace(text) != "" {
				tb = taste.FromBrain(text, "brain:profile@"+s.Brainbot.BaseURL)
			}
		}
		cancel()
	}
	if tb == nil { // brain unreachable, or healthy-but-empty → local fallback
		if t, err := taste.LoadFile(s.TasteMDPath); err == nil {
			tb = t
		}
	}
	pb, _ := playbook.Load(s.PlaybookPath)
	if tb != nil && pb != "" {
		tb.Version = taste.Hash(pb + "\n---taste---\n" + tb.Text)
		tb.Source = tb.Source + " + " + s.PlaybookPath
	}
	s.mu.Lock()
	s.taste = tb
	s.playbookText = pb
	s.mu.Unlock()
}

func (s *Server) currentTaste() *taste.Block {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.taste
}

func (s *Server) currentPlaybook() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.playbookText
}

// CurrentTasteVersion returns the effective (playbook-folded) taste version,
// or "" if no taste is loaded. Exported for the run-history hook.
func (s *Server) CurrentTasteVersion() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.taste == nil {
		return ""
	}
	return s.taste.Version
}

// Handler returns the http.Handler for the UI.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "ok") })

	// read / triage
	mux.HandleFunc("/api/companies", s.handleCompanies)
	mux.HandleFunc("/api/companies/", s.handleCompany)
	mux.HandleFunc("/api/stats", s.handleStats)

	// control surface
	mux.HandleFunc("/api/run/", s.handleRun)      // POST /api/run/{stage}
	mux.HandleFunc("/api/jobs/", s.handleJob)     // GET {id}/stream, POST {id}/cancel
	mux.HandleFunc("/api/runs", s.handleRuns)     // GET history
	mux.HandleFunc("/api/meta", s.handleMeta)     // GET capabilities
	mux.HandleFunc("/api/ingest", s.handleIngest) // POST multipart CSV

	// editor (local files only — never the brain)
	mux.HandleFunc("/api/taste", s.handleTaste)
	mux.HandleFunc("/api/playbook", s.handlePlaybook)

	return mux
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(indexHTML)
}

func (s *Server) handleCompanies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.DB.TriageRows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rows": rows, "count": len(rows)})
}

func (s *Server) handleCompany(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/companies/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	switch {
	case len(parts) == 1:
		s.handleCompanyDetail(w, r, id)
	case len(parts) == 2 && parts[1] == "brain":
		s.handleCompanyBrain(w, r, id)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleCompanyDetail(w http.ResponseWriter, r *http.Request, id int64) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	d, err := s.DB.GetCompanyDetail(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (s *Server) handleCompanyBrain(w http.ResponseWriter, r *http.Request, id int64) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.Brainbot == nil || !s.Brainbot.Enabled() {
		http.Error(w, "brain not configured", http.StatusNotFound)
		return
	}
	name, _, err := s.DB.GetCompanyName(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	res, err := s.Brainbot.Recall(ctx, name, 5)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"facts": []brainFact{}, "error": err.Error(), "query": name})
		return
	}
	facts := make([]brainFact, 0, len(res.Facts))
	for _, f := range res.Facts {
		facts = append(facts, brainFact{Fact: f.Fact, Score: f.Score})
	}
	writeJSON(w, http.StatusOK, map[string]any{"facts": facts, "query": name})
}

// brainFact is the per-company recall shape rendered in the detail pane.
type brainFact struct {
	Fact  string  `json:"fact"`
	Score float64 `json:"score"`
}

// brainHealthy reports whether the brain is configured AND currently reachable.
// Used to gate UI controls; /api/meta loads once per page load, so the probe
// cost is negligible.
func (s *Server) brainHealthy(parent context.Context) bool {
	if s.Brainbot == nil || !s.Brainbot.Enabled() {
		return false
	}
	ctx, cancel := context.WithTimeout(parent, 3*time.Second)
	defer cancel()
	return s.Brainbot.Health(ctx) == nil
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var version, source string
	if tb := s.currentTaste(); tb != nil {
		version = tb.Version
		source = tb.Source
	}
	stats, err := s.DB.GetStats(version, source)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
