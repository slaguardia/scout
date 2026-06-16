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

	"github.com/slaguardia/scout/internal/capture"
)

// AnswersRunner generates application-question answers for a posting,
// asynchronously: Generate returns immediately and the engine writes each
// answer's progress/result to its posting_answers row (the panel polls). The
// engine owns models, the honesty gate, and per-question status; the web layer
// owns the block gate and detect-if-missing.
type AnswersRunner interface {
	Generate(postingID string)
}

// handlePostingAnswers is the application-questions queue on one posting:
//
//	GET  /api/postings/{id}/answers  -> {answers: [...], questions_status}
//	POST /api/postings/{id}/answers  -> detect-if-missing, then generate all
//	                                    unanswered questions (202 + rows)
//
// POST gates on the answer context block being healthy and 503s when no engine
// is wired. Detection (cheap, no key needed for ATS links) runs synchronously
// when the posting has never been detected; generation (the LLM spend) fires
// async, exactly like outreach drafts.
func (s *Server) handlePostingAnswers(w http.ResponseWriter, r *http.Request, postingID string) {
	switch r.Method {
	case http.MethodGet:
		p, err := s.DB.GetPosting(postingID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if p == nil {
			http.NotFound(w, r)
			return
		}
		s.writeAnswers(w, http.StatusOK, postingID, p.QuestionsStatus)

	case http.MethodPost:
		if s.Answers == nil {
			http.Error(w, "answer generation not wired (no engine in this build)", http.StatusServiceUnavailable)
			return
		}
		p, err := s.DB.GetPosting(postingID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if p == nil {
			http.NotFound(w, r)
			return
		}
		// The honesty gate needs the experience bundle discovered — fail loud and
		// early (mirrors the outreach draft gate) rather than drafting answers
		// that can't be checked.
		if exp, err := s.DB.OutreachKnowledge("experience"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		} else if strings.TrimSpace(exp) == "" {
			writeJSON(w, http.StatusPreconditionFailed, map[string]any{
				"error": "no experience knowledge — refresh outreach sources so the brain's experience is discovered",
				"need":  "experience",
			})
			return
		}
		// Detect-if-missing: a posting never detected (predates the feature, or a
		// manual add) gets its questions resolved now, before generation.
		status := p.QuestionsStatus
		if status == "" {
			ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
			c := &capture.Capturer{DB: s.DB, Client: s.Anthropic}
			scan, derr := c.DetectAndStoreQuestions(ctx, postingID, p.URL)
			cancel()
			if derr != nil {
				http.Error(w, "detect questions: "+derr.Error(), http.StatusInternalServerError)
				return
			}
			status = scan.Status
		}
		s.Answers.Generate(postingID)
		s.writeAnswers(w, http.StatusAccepted, postingID, status)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handlePostingAnswersRedetect forces a fresh detection run:
//
//	POST /api/postings/{id}/answers/redetect -> {answers, questions_status}
//
// The idempotent upsert adds newly-found questions and never clobbers existing
// answers — the manual re-run hook for existing jobs (e.g. after the Ashby
// query is updated post-drift). No key needed for ATS links.
func (s *Server) handlePostingAnswersRedetect(w http.ResponseWriter, r *http.Request, postingID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p, err := s.DB.GetPosting(postingID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if p == nil {
		http.NotFound(w, r)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
	defer cancel()
	c := &capture.Capturer{DB: s.DB, Client: s.Anthropic}
	scan, err := c.DetectAndStoreQuestions(ctx, postingID, p.URL)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.writeAnswers(w, http.StatusOK, postingID, scan.Status)
}

// handleAnswer edits, regenerates, or removes one answer:
//
//	PUT    /api/answers/{id}  {"edited": "..."}     -> inline save (200 + row)
//	PUT    /api/answers/{id}  {"regenerate": true}  -> re-draft this one (202 + row)
//	DELETE /api/answers/{id}                        -> dismiss the question (204)
func (s *Server) handleAnswer(w http.ResponseWriter, r *http.Request) {
	idStr := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/answers/"), "/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || strings.Contains(idStr, "/") {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodDelete:
		if err := s.DB.DismissAnswer(id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	case http.MethodPut:
		// handled below
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Edited     string `json:"edited"`
		Regenerate bool   `json:"regenerate"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if body.Regenerate {
		if s.Answers == nil {
			http.Error(w, "answer generation not wired (no engine in this build)", http.StatusServiceUnavailable)
			return
		}
		// Same honesty-gate as the bulk POST: a single-question draft also needs the
		// experience bundle, so block early with the friendly 412 the panel turns
		// into a "discover sources" prompt rather than letting the row fail.
		if exp, err := s.DB.OutreachKnowledge("experience"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		} else if strings.TrimSpace(exp) == "" {
			writeJSON(w, http.StatusPreconditionFailed, map[string]any{
				"error": "no experience knowledge — refresh outreach sources so the brain's experience is discovered",
				"need":  "experience",
			})
			return
		}
		a, err := s.DB.RegenerateAnswer(id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// RegenerateAnswer flipped just this row to `generating`; Generate
		// (re)drafts every generating row for the posting — only this one, since
		// ready/edited rows aren't re-grabbed.
		s.Answers.Generate(a.PostingID)
		writeJSON(w, http.StatusAccepted, a)
		return
	}

	a, err := s.DB.EditAnswer(id, body.Edited)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// writeAnswers lists a posting's answers and writes the standard payload.
func (s *Server) writeAnswers(w http.ResponseWriter, code int, postingID, questionsStatus string) {
	answers, err := s.DB.ListAnswers(postingID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, code, map[string]any{
		"answers":          answers,
		"questions_status": questionsStatus,
	})
}
