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
// retries, and the no-hook route; the web layer owns the queue discipline
// (one active draft per posting) and the block-health gate.
type OutreachRunner interface {
	Draft(draftID int64)
}

// handlePostingOutreach is the draft queue on one posting:
//
//	GET  /api/postings/{id}/outreach  -> {drafts: [...]} newest first
//	POST /api/postings/{id}/outreach  -> start a draft (202 + the new row)
//
// POST gates on the required context blocks being healthy in the cache and on
// no other active draft for the posting; it fails 503 when no engine is wired.
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
		missing, err := outreach.MissingBlocks(s.DB)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(missing) > 0 {
			writeJSON(w, http.StatusPreconditionFailed, map[string]any{
				"error":          "required context blocks are missing or broken — pin and sync them first",
				"missing_blocks": missing,
			})
			return
		}
		d, err := s.DB.CreateOutreachDraft(postingID)
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
		writeJSON(w, http.StatusAccepted, d)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleOutreach routes /api/outreach/*:
//
//	GET  /api/outreach/blocks            -> cached block statuses (no brain call)
//	POST /api/outreach/sync              -> refresh blocks from the brain
//	PUT  /api/outreach/drafts/{id}       -> save the user's edit (re-lints)
//	POST /api/outreach/drafts/{id}/sent  -> mark sent (bumps posting tracking)
func (s *Server) handleOutreach(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/outreach/")
	switch {
	case rest == "blocks":
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		statuses, err := outreach.CachedStatuses(s.DB)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"blocks": statuses})

	case rest == "sync":
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if s.Brainbot == nil || !s.Brainbot.Enabled() {
			http.Error(w, "brain not configured", http.StatusPreconditionFailed)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		statuses, err := outreach.Sync(ctx, s.Brainbot, s.DB)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"blocks": statuses})

	case strings.HasPrefix(rest, "drafts/"):
		s.handleDraft(w, r, strings.TrimPrefix(rest, "drafts/"))

	default:
		http.NotFound(w, r)
	}
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
		// Edits are only meaningful pre-send: a sent draft is the record of
		// what was actually emailed, and a researching one is pipeline-owned.
		if cur, err := s.DB.GetOutreachDraft(id); err == nil && cur != nil &&
			cur.Status != store.DraftAwaitingReview && cur.Status != store.DraftNoHook {
			http.Error(w, "draft is "+cur.Status+" — only awaiting_review/no_hook drafts are editable", http.StatusConflict)
			return
		}
		findings := s.lintDraft(body.Edited)
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

// lintDraft lints email text against the cached locked paragraph (when
// healthy); a missing P2 block just skips the verbatim-presence rule.
func (s *Server) lintDraft(text string) []outreach.LintFinding {
	p2 := ""
	if b, err := s.DB.GetOutreachBlock("P2_LOCKED"); err == nil && b != nil && b.Broken == "" {
		p2 = b.Content
	}
	findings := outreach.Lint(text, p2)
	if findings == nil {
		findings = []outreach.LintFinding{}
	}
	return findings
}
