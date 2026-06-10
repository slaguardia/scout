package web

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/slaguardia/scout/internal/outreach"
)

// The taste / playbook editor reads and writes ONLY the local instruction
// files. It never touches the brain — that separation is deliberate and
// enforced by construction: nothing in this file imports or references the
// brainbot client. Scout uses the brain read-only (criteria via profile,
// per-company context via recall); these editor routes don't go near it.

const maxEditorBytes = 1 << 20 // 1 MB cap on an instruction file

// handleTaste: GET returns taste.md content + folded version; PUT writes it.
func (s *Server) handleTaste(w http.ResponseWriter, r *http.Request) {
	s.handleEditorFile(w, r, s.TasteMDPath, "taste")
}

// handlePlaybook: GET returns playbook.md content; PUT writes it.
func (s *Server) handlePlaybook(w http.ResponseWriter, r *http.Request) {
	s.handleEditorFile(w, r, s.PlaybookPath, "playbook")
}

// handleOutreachTemplate edits the email template, stored in the DB (a singleton
// row) — a dashboard save can't clobber it and git never touches it. GET returns
// the saved template or the compiled-in default; the engine re-reads at draft
// time, so there is no reload and no taste_version.
func (s *Server) handleOutreachTemplate(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		content, err := s.DB.GetOutreachTemplate()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if content == "" {
			content = outreach.DefaultTemplate
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "outreach-template", "content": content})

	case http.MethodPut:
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.PutOutreachTemplate(body.Content); err != nil {
			http.Error(w, "save outreach template: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "outreach-template", "content": body.Content})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleEditorFile(w http.ResponseWriter, r *http.Request, path, kind string) {
	if path == "" {
		http.Error(w, kind+" path not configured", http.StatusServiceUnavailable)
		return
	}
	switch r.Method {
	case http.MethodGet:
		content := ""
		if b, err := os.ReadFile(path); err == nil {
			content = string(b)
		} else if !os.IsNotExist(err) {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, s.editorPayload(kind, path, content))

	case http.MethodPut:
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		// Write the local file only. No brain interaction.
		if err := os.WriteFile(path, []byte(body.Content), 0o644); err != nil {
			http.Error(w, "write "+kind+": "+err.Error(), http.StatusInternalServerError)
			return
		}
		// Recompute the server's taste block so new scores use the edited
		// criteria immediately. Existing verdicts are untouched (no auto re-score).
		s.ReloadTaste()
		writeJSON(w, http.StatusOK, s.editorPayload(kind, path, body.Content))

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// editorPayload reports the file content plus the *effective* version the
// verdict stage would use to tag new scores, so the UI can show it without a
// round-trip to /api/stats.
func (s *Server) editorPayload(kind, path, content string) map[string]any {
	out := map[string]any{
		"kind":    kind,
		"path":    path,
		"content": content,
	}
	if tb := s.currentTaste(); tb != nil {
		out["taste_version"] = tb.Version
		out["taste_source"] = tb.Source
	}
	return out
}
