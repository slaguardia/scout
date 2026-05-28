// Package web serves the triage UI on localhost.
//
// One embedded HTML page, several JSON endpoints, no auth. The page fetches
// /api/companies on load and renders a sortable/filterable table client-side.
// Detail pane and status write-back are wired through /api/companies/:id and
// /api/companies/:id/status. Brain context is proxied through
// /api/companies/:id/brain when a brainbot Client is configured.
package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	_ "embed"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

//go:embed index.html
var indexHTML []byte

// Server holds dependencies. Brainbot and Taste are optional — when unset,
// the brain proxy returns 404 and stats omit taste version/source.
type Server struct {
	DB       *store.DB
	Brainbot *brainbot.Client // optional
	Taste    *taste.Block     // optional; current taste (file or brainbot)
}

// Handler returns the http.Handler for the triage UI.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "ok") })
	mux.HandleFunc("/api/companies", s.handleCompanies)
	mux.HandleFunc("/api/companies/", s.handleCompany) // detail, status, brain
	mux.HandleFunc("/api/stats", s.handleStats)
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

// handleCompany routes /api/companies/<id>, /api/companies/<id>/status,
// /api/companies/<id>/brain.
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
	case len(parts) == 2 && parts[1] == "status":
		s.handleCompanyStatus(w, r, id)
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

func (s *Server) handleCompanyStatus(w http.ResponseWriter, r *http.Request, id int64) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		State string `json:"state"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	state, updatedAt, err := s.DB.SetStatus(id, body.State)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		// Validation errors come back as plain error strings; treat as 400.
		if strings.HasPrefix(err.Error(), "invalid state") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"company_id":        id,
		"state":             state,
		"status_updated_at": updatedAt,
	})
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

	nodes, err := s.Brainbot.SearchNodes(ctx, name, 5)
	if err != nil {
		// The brain is an enhancement — surface the error but with 200 + empty
		// nodes so the UI degrades gracefully.
		writeJSON(w, http.StatusOK, map[string]any{
			"nodes": []brainbot.Node{},
			"error": err.Error(),
			"query": name,
		})
		return
	}
	if nodes == nil {
		nodes = []brainbot.Node{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"nodes": nodes,
		"query": name,
	})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var version, source string
	if s.Taste != nil {
		version = s.Taste.Version
		source = s.Taste.Source
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
