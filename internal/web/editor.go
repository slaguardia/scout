package web

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/slaguardia/scout/internal/filter"
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

// handleOutreachPromptsList lists the editable outreach pipeline stages (titles,
// one-line descriptions, on/off + override status) for the dashboard's Pipeline
// view. Content is fetched per-stage via handleOutreachPrompt.
func (s *Server) handleOutreachPromptsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	type item struct {
		Stage        string `json:"stage"`
		Title        string `json:"title"`
		Description  string `json:"description"`
		Enabled      bool   `json:"enabled"`
		Skippable    bool   `json:"skippable"`
		IsOverridden bool   `json:"is_overridden"`
	}
	out := []item{}
	for _, st := range outreach.Stages() {
		content, enabled, _ := s.DB.GetStage(st.Key)
		out = append(out, item{
			Stage: st.Key, Title: st.Title, Description: st.Desc,
			Enabled: enabled, Skippable: st.Key != "fill",
			IsOverridden: strings.TrimSpace(content) != "",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompts": out})
}

// handleOutreachPrompt is GET/PUT for one pipeline stage's editable system
// prompt, stored in the DB (a dashboard save can't clobber it; the engine
// re-reads at draft time). GET returns the effective prompt + flags; PUT
// {content} saves an override, PUT {enabled} toggles the stage on/off, PUT
// {reset:true} reverts to the compiled default. The Writer (fill) can't be
// disabled.
func (s *Server) handleOutreachPrompt(w http.ResponseWriter, r *http.Request) {
	stage := strings.TrimPrefix(r.URL.Path, "/api/outreach-prompts/")
	st, ok := outreach.StageByKey(stage)
	if !ok {
		http.Error(w, "unknown stage: "+stage, http.StatusNotFound)
		return
	}
	respond := func() {
		content, enabled, err := s.DB.GetStage(stage)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		overridden := strings.TrimSpace(content) != ""
		if !overridden {
			content = st.Default
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"kind": "outreach-prompts/" + stage, "content": content,
			"enabled": enabled, "skippable": stage != "fill", "is_overridden": overridden,
		})
	}
	switch r.Method {
	case http.MethodGet:
		respond()
	case http.MethodPut:
		var body struct {
			Content string `json:"content"`
			Enabled *bool  `json:"enabled"`
			Reset   bool   `json:"reset"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if body.Reset {
			if err := s.DB.ResetStageContent(stage); err != nil {
				http.Error(w, "reset prompt: "+err.Error(), http.StatusInternalServerError)
				return
			}
		} else if err := s.DB.PutPromptOverride(stage, body.Content); err != nil {
			http.Error(w, "save prompt: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// The Writer (fill) is never skippable; ignore an enable toggle for it.
		if body.Enabled != nil && stage != "fill" {
			if err := s.DB.SetStageEnabled(stage, *body.Enabled); err != nil {
				http.Error(w, "toggle stage: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		respond()

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTasteFilter edits the structured pre-filter rules (the old taste.toml),
// stored in the DB (a singleton row) — a dashboard save can't clobber it and
// git never touches it. The value is raw TOML. GET returns the saved rules or
// the compiled-in default; PUT validates the TOML parses before saving (a
// broken filter would silently drop every company from verdict runs) and
// rejects it 400 otherwise. The verdict job re-reads at run time, so there is
// no reload and no taste_version — the pre-filter is a mechanical gate, not a
// criterion the verdict provenance hash tracks. The `enabled` flag is the
// master on/off switch (disabled → a bulk run scores everything); the rules are
// preserved while it's off.
func (s *Server) handleTasteFilter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		content, enabled, err := s.DB.GetTasteFilter()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if content == "" {
			content = filter.DefaultTasteTOML
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "taste-filter", "content": content, "enabled": enabled})

	case http.MethodPut:
		var body struct {
			Content string `json:"content"`
			Enabled *bool  `json:"enabled"` // pointer: omitted means "preserve current"
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if _, err := filter.ParseTaste(body.Content); err != nil {
			http.Error(w, "invalid pre-filter TOML: "+err.Error(), http.StatusBadRequest)
			return
		}
		// Preserve the current enabled state when the client doesn't send one.
		enabled := true
		if _, cur, err := s.DB.GetTasteFilter(); err == nil {
			enabled = cur
		}
		if body.Enabled != nil {
			enabled = *body.Enabled
		}
		if err := s.DB.PutTasteFilter(body.Content, enabled); err != nil {
			http.Error(w, "save pre-filter: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"kind": "taste-filter", "content": body.Content, "enabled": enabled})

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
