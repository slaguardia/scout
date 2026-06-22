package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/outreach"
	"github.com/slaguardia/scout/internal/store"
)

// OutreachRunner runs the outreach draft pipeline for one created draft row,
// asynchronously: Draft returns immediately and the pipeline writes its
// progress/result to the draft row (the panel polls). The engine owns models,
// retries, and the no-send route; the web layer owns the queue discipline (one
// active draft per posting) and the inputs-present gate.
type OutreachRunner interface {
	Draft(draftID int64)
}

// handlePostingOutreach is the draft queue on one posting:
//
//	GET  /api/postings/{id}/outreach  -> {drafts: [...]} newest first
//	POST /api/postings/{id}/outreach  -> start a draft (202 + the new row)
//
// POST gates on the two required inputs being present — the scout-local email
// template and a discovered experience bundle (the honesty ground truth) — and
// on no other active draft for the posting; it fails 503 when no engine is wired.
func (s *Server) handlePostingOutreach(w http.ResponseWriter, r *http.Request, postingID string) {
	switch r.Method {
	case http.MethodGet:
		drafts, err := s.DB.ListOutreachDrafts(postingID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"drafts": drafts})

	case http.MethodPost:
		if s.Outreach == nil {
			http.Error(w, "outreach pipeline not wired (no engine in this build)", http.StatusServiceUnavailable)
			return
		}
		// GATE: a draft needs an experience bundle (the honesty ground truth).
		// The email template always exists (the DB row or the compiled-in
		// default), so it is never a gate.
		if exp, err := s.DB.OutreachKnowledge("experience"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		} else if strings.TrimSpace(exp) == "" {
			// Cold cache: sync from the brain once, then re-check before blocking —
			// a first-ever draft shouldn't be gated just because nothing's discovered yet.
			s.ensureOutreachKnowledge(r.Context())
			if exp2, _ := s.DB.OutreachKnowledge("experience"); strings.TrimSpace(exp2) == "" {
				writeJSON(w, http.StatusPreconditionFailed, map[string]any{
					"error": "no experience page found in your brain — add one; scout syncs it automatically",
					"need":  "experience",
				})
				return
			}
		}
		// Voice is soft: drafting proceeds without it (a less-voiced email).
		degraded := []string{}
		if v, _ := s.DB.OutreachKnowledge("voice"); strings.TrimSpace(v) == "" {
			degraded = append(degraded, "voice")
		}
		// ?regenerate=1 retires the current awaiting_review/needs_work/no_hook
		// draft and starts a fresh run (re-draft after backfilling info); the
		// default POST creates only when no draft is active (409 otherwise).
		create := s.DB.CreateOutreachDraft
		if r.URL.Query().Get("regenerate") == "1" {
			create = s.DB.RegenerateOutreachDraft
		}
		d, err := create(postingID)
		if err != nil {
			switch {
			case errors.Is(err, sql.ErrNoRows):
				http.NotFound(w, r)
			case strings.Contains(err.Error(), "active draft"):
				http.Error(w, err.Error(), http.StatusConflict)
			default:
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		s.Outreach.Draft(d.ID)
		writeJSON(w, http.StatusAccepted, map[string]any{"draft": d, "degraded": degraded})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleOutreach routes /api/outreach/*:
//
//	GET  /api/outreach/sources            -> the discovered knowledge sources (read-only)
//	PUT  /api/outreach/drafts/{id}        -> save the user's edit
//	POST /api/outreach/drafts/{id}/sent   -> mark sent (bumps posting tracking)
func (s *Server) handleOutreach(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/outreach/")
	switch {
	case rest == "sources" || strings.HasPrefix(rest, "sources/"):
		s.handleOutreachSources(w, r, strings.TrimPrefix(strings.TrimPrefix(rest, "sources"), "/"))
	case strings.HasPrefix(rest, "drafts/"):
		s.handleDraft(w, r, strings.TrimPrefix(rest, "drafts/"))
	default:
		http.NotFound(w, r)
	}
}

// handleOutreachSources serves the discovered knowledge sources, read-only — a
// diagnostic peek at what the brain resolved for each need. There is no refresh
// or add/remove: the bundle syncs from the brain automatically (see
// ensureOutreachKnowledge), so the dashboard never edits it.
func (s *Server) handleOutreachSources(w http.ResponseWriter, r *http.Request, action string) {
	if action != "" || r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, s.sourcesPayload())
}

// ensureOutreachKnowledge runs the change-aware brain sync for the outreach
// knowledge bundle (best-effort), resolving a dashboard-stored API key first so
// discovery can run. A no-op when the brain isn't configured; any failure leaves
// the last-good cache in place (the caller re-checks the cache before gating).
func (s *Server) ensureOutreachKnowledge(ctx context.Context) {
	if s.Brainbot == nil || !s.Brainbot.Enabled() {
		return
	}
	s.ensureAnthropicKey() // DB-over-env, so a dashboard-stored key lights up discovery
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	_ = outreach.EnsureKnowledge(ctx, s.Brainbot, s.Anthropic, s.DB, "", nil)
}

// sourcesPayload lists the cached sources without their (large) content — the
// per-need pointers the UI renders.
func (s *Server) sourcesPayload() map[string]any {
	srcs, err := s.DB.ListOutreachSources()
	if err != nil {
		return map[string]any{"sources": []any{}, "error": err.Error()}
	}
	type lite struct {
		Need       string `json:"need"`
		PageID     string `json:"page_id"`
		Title      string `json:"title"`
		Version    string `json:"version"`
		ResolvedAt string `json:"resolved_at"`
	}
	out := make([]lite, 0, len(srcs))
	for _, s := range srcs {
		out = append(out, lite{s.Need, s.PageID, s.Title, s.Version, s.ResolvedAt})
	}
	return map[string]any{"sources": out, "needs": outreach.KnowledgeNeeds}
}

// lintBody drops a leading "Subject:" line before the voice flag, since the
// subject's em dash ("Name — intro") is intentional and not a violation.
func lintBody(email string) string {
	if strings.HasPrefix(email, "Subject:") {
		if i := strings.IndexByte(email, '\n'); i >= 0 {
			return email[i+1:]
		}
	}
	return email
}

func (s *Server) handleDraft(w http.ResponseWriter, r *http.Request, rest string) {
	idStr, action, _ := strings.Cut(strings.Trim(rest, "/"), "/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	switch {
	case action == "" && r.Method == http.MethodGet:
		d, err := s.DB.GetOutreachDraft(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if d == nil {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, d)

	case action == "" && r.Method == http.MethodPut:
		var body struct {
			Edited string `json:"edited"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		// Edits are only meaningful pre-send: a sent draft is the record of what
		// was actually emailed, and a researching one is pipeline-owned. A
		// needs_work draft is finished and reviewable — just flagged by the judge.
		if cur, err := s.DB.GetOutreachDraft(id); err == nil && cur != nil &&
			cur.Status != store.DraftAwaitingReview && cur.Status != store.DraftNeedsWork && cur.Status != store.DraftNoHook {
			http.Error(w, "draft is "+cur.Status+" — only awaiting_review/needs_work/no_hook drafts are editable", http.StatusConflict)
			return
		}
		// Re-run the deterministic voice flag on the edit (body only — the subject
		// line's em dash is intentional), plus the word-count check. Non-blocking:
		// it just refreshes the chips.
		findings := outreach.VoiceFindings(lintBody(body.Edited))
		findings = append(findings, outreach.LengthFindings(body.Edited)...)
		if findings == nil {
			findings = []outreach.LintFinding{}
		}
		lintJSON, _ := json.Marshal(findings)
		if err := s.DB.SetOutreachDraftEdited(id, body.Edited, string(lintJSON)); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		d, err := s.DB.GetOutreachDraft(id)
		if err != nil || d == nil {
			http.Error(w, "draft vanished", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, d)

	case action == "sent" && r.Method == http.MethodPost:
		d, err := s.DB.MarkOutreachDraftSent(id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, d)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
