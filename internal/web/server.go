// Package web serves the read-only triage UI on localhost.
//
// One HTML page (embedded), one JSON endpoint, no auth, no write-back. The page
// fetches /api/companies on load and renders a sortable/filterable table client-side.
package web

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/stevenlaguardia/scout/internal/store"
)

//go:embed index.html
var indexHTML []byte

// Server holds dependencies.
type Server struct {
	DB *store.DB
}

// Handler returns the http.Handler for the triage UI.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/companies", s.handleCompanies)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "ok") })
	return mux
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(indexHTML)
}

func (s *Server) handleCompanies(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.TriageRows()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"rows": rows, "count": len(rows)})
}
