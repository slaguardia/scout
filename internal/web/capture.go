package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/capture"
	"github.com/slaguardia/scout/internal/store"
)

// handleCapture runs the link-capture agent pass on one pasted URL: fetch the
// page, classify it (job posting vs company page) with one Haiku call, and
// upsert the company/posting. POST /api/capture {"url": "..."}. Synchronous —
// a single fetch + a single LLM call — so it doesn't need the job Runner; like
// verdict it needs only the Anthropic key.
func (s *Server) handleCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.Anthropic == nil || s.Anthropic.APIKey == "" {
		http.Error(w, "capture needs ANTHROPIC_API_KEY in the server environment", http.StatusPreconditionFailed)
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// One fetch (≤12s) plus one LLM call (≤45s); the margin covers redirects.
	ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
	defer cancel()
	c := &capture.Capturer{DB: s.DB, Client: s.Anthropic}
	res, err := c.Run(ctx, body.URL)
	if err != nil {
		var fe capture.FetchError
		switch {
		case strings.HasPrefix(err.Error(), "url "): // url required / url must be http(s)
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.As(err, &fe): // page unfetchable — honest status for the UI
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error": err.Error(), "fetch_status": fe.Status,
			})
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handlePostings serves the jobs view: every posting across all companies,
// joined with the company's name/verdict/marks. GET /api/postings.
func (s *Server) handlePostings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.DB.ListJobRows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rows": rows, "count": len(rows)})
}

// handlePosting updates one posting's application-lifecycle fields — the
// tracker half of the jobs view. PUT /api/postings/{id} with the full
// tracking state {applied_at, response, outreach_count, last_outreach_at};
// returns the refreshed posting. Like the company marks, a direct write with
// no Runner involved.
func (s *Server) handlePosting(w http.ResponseWriter, r *http.Request) {
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/postings/"), "/")
	// {id}/outreach is the posting's draft queue (see outreach.go).
	if pid, ok := strings.CutSuffix(id, "/outreach"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingOutreach(w, r, pid)
		return
	}
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var t store.PostingTracking
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&t); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p, err := s.DB.UpdatePostingTracking(id, t)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			http.NotFound(w, r)
		case strings.HasPrefix(err.Error(), "applied_at "),
			strings.HasPrefix(err.Error(), "last_outreach_at "),
			strings.HasPrefix(err.Error(), "response "),
			strings.HasPrefix(err.Error(), "outreach_count "):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	writeJSON(w, http.StatusOK, p)
}
