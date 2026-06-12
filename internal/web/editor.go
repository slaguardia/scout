package web

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/slaguardia/scout/internal/outreach"
	"github.com/slaguardia/scout/internal/playbook"
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

// handlePlaybook edits the verdict playbook, stored in the DB (a singleton row)
// like the outreach template — a dashboard save can't clobber it and git never
// touches it. GET returns the saved playbook or the compiled-in default; PUT
// saves and re-folds the taste version (a playbook edit changes the provenance
// hash that stamps new verdicts, so we ReloadTaste before reporting it back).
func (s *Server) handlePlaybook(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		content, err := s.DB.GetPlaybook()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if content == "" {
			content = playbook.DefaultPlaybook
		}
		writeJSON(w, http.StatusOK, s.playbookPayload(content))

	case http.MethodPut:
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.PutPlaybook(body.Content); err != nil {
			http.Error(w, "save playbook: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// Recompute the folded taste version so new scores use the edited playbook
		// immediately. Existing verdicts are untouched (no auto re-score).
		s.ReloadTaste()
		writeJSON(w, http.StatusOK, s.playbookPayload(body.Content))

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// playbookPayload reports the playbook content plus the *effective* (playbook-
// folded) taste version the verdict stage would stamp new scores with, so the
// editor can show it without a round-trip to /api/stats.
func (s *Server) playbookPayload(content string) map[string]any {
	out := map[string]any{"kind": "playbook", "content": content}
	if tb := s.currentTaste(); tb != nil {
		out["taste_version"] = tb.Version
		out["taste_source"] = tb.Source
	}
	return out
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

// handleOutreachDoctrine edits the outreach writing doctrine, stored in the DB
// (a singleton row) — a dashboard save can't clobber it and git never touches
// it. GET returns the saved doctrine or the compiled-in default; the engine
// re-reads at draft time, so there is no reload and no taste_version.
func (s *Server) handleOutreachDoctrine(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		content, err := s.DB.GetOutreachDoctrine()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if content == "" {
			content = outreach.DefaultDoctrine
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "outreach-doctrine", "content": content})

	case http.MethodPut:
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.PutOutreachDoctrine(body.Content); err != nil {
			http.Error(w, "save outreach doctrine: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "outreach-doctrine", "content": body.Content})

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
