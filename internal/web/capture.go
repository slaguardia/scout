package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/capture"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/store"
)

// handleCapture runs the link-capture agent pass on one pasted URL: fetch the
// page, classify it (job posting vs company page) with one Haiku call, and
// upsert the company/posting. POST /api/capture {"url": "...", "kind"?: ...,
// "fields"?: {...}} — kind pins the page kind when the user toggled it in the
// Add dialog, fields carry typed values that win over extraction. Synchronous —
// a single fetch + at most a single LLM call — so it doesn't need the job
// Runner; the Anthropic key is required only for links the ATS resolver can't
// handle (ATS posting links capture keyless).
func (s *Server) handleCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		URL    string `json:"url"`
		Kind   string `json:"kind"`
		Fields struct {
			Name         string `json:"name"`
			Location     string `json:"location"`
			Headcount    string `json:"headcount"`
			FundingStage string `json:"funding_stage"`
			Vertical     string `json:"vertical"`
			Title        string `json:"title"`
		} `json:"fields"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	switch body.Kind {
	case "", capture.KindJob, capture.KindCompany:
	default:
		http.Error(w, "kind must be job_posting or company_page", http.StatusBadRequest)
		return
	}
	// The key precondition only guards the LLM path: an ATS-resolvable posting
	// link (not pinned as a company page) never touches the model, so it works
	// keyless. If its resolve fails at runtime, the fall-through to the LLM
	// path reports the missing key honestly instead.
	atsNoLLM := body.Kind != capture.KindCompany && capture.IsATSPosting(body.URL)
	// Resolve + re-key the shared client so a dashboard-stored key works here with
	// no restart; the gate only bites the LLM path (ATS posting links capture keyless).
	if s.ensureAnthropicKey() == "" && !atsNoLLM {
		http.Error(w, "capture needs an Anthropic API key (set one in Settings, or ANTHROPIC_API_KEY in the server environment)", http.StatusPreconditionFailed)
		return
	}

	// One fetch (≤12s) plus one LLM call (≤45s); the margin covers redirects.
	ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
	defer cancel()
	c := &capture.Capturer{DB: s.DB, Client: s.Anthropic}
	res, err := c.Run(ctx, capture.Request{
		URL:  body.URL,
		Kind: body.Kind,
		Fields: capture.Fields{
			Name:         body.Fields.Name,
			Location:     body.Fields.Location,
			Headcount:    body.Fields.Headcount,
			FundingStage: body.Fields.FundingStage,
			Vertical:     body.Fields.Vertical,
			Title:        body.Fields.Title,
		},
	})
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
// joined with the company's name/verdict/marks. GET /api/postings. POST adds
// one posting directly (no fetch, no LLM) — the Add dialog's "job" mode with
// the agent pass unticked.
func (s *Server) handlePostings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := s.DB.ListJobRows()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"rows": rows, "count": len(rows)})
	case http.MethodPost:
		s.handleAddPosting(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAddPosting adds one posting from just a link, with no agent pass: POST
// /api/postings {"url": "...", "title"?: "...", "company"?: "..."}. A posting
// link on a supported ATS (ashby/greenhouse/lever/rippling) resolves through the
// platform's public API first — keyless, no LLM — so the details auto-fill on a
// plain add exactly as they do on re-enrich; only a non-ATS link (or a failed
// resolve) takes the bare path. There the company is resolved without a fetch —
// the typed company name and/or the link's own host (a posting on
// acme.com/careers identifies acme.com; an ATS host identifies nothing) go
// through ingest.EnsureCompany, creating the company on first sight exactly like
// a capture would. When neither identifies a company, the add is rejected with
// guidance rather than guessed at.
func (s *Server) handleAddPosting(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL     string `json:"url"`
		Title   string `json:"title"`
		Company string `json:"company"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate the URL before any write — a bad link must not leave behind a
	// company row with no posting.
	rawURL := strings.TrimSpace(body.URL)
	if u, err := neturl.Parse(rawURL); rawURL == "" || err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		http.Error(w, "url must be http(s)", http.StatusBadRequest)
		return
	}

	// A posting link on a supported ATS (ashby/greenhouse/lever/rippling)
	// resolves through the platform's public API with no LLM and no key — the
	// same keyless path the job panel's re-enrich button uses. Do it on the plain
	// add too, so pasting an ATS job link auto-fills the title, location, comp,
	// and description instead of landing a bare row that needs a manual
	// re-enrich. A resolve miss returns nil and falls through to the plain insert
	// below, so the link still tracks either way.
	if capture.IsATSPosting(rawURL) {
		ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
		defer cancel()
		c := &capture.Capturer{DB: s.DB, Client: s.Anthropic}
		if res := c.CaptureATSPosting(ctx, capture.Request{
			URL:  rawURL,
			Kind: capture.KindJob,
			Fields: capture.Fields{
				Name:  strings.TrimSpace(body.Company),
				Title: body.Title,
			},
		}); res != nil && res.Posting != nil {
			writeJSON(w, http.StatusOK, res)
			return
		}
	}

	name := strings.TrimSpace(body.Company)
	domain := capture.CompanyDomainFromURL(rawURL)
	if name == "" && domain == "" {
		http.Error(w, "can't tell the company from this link — type a company name, or let scout read the page", http.StatusBadRequest)
		return
	}
	companyID, created, err := ingest.EnsureCompany(s.DB, ingest.CapturedCompany{
		Name:      name,
		Domain:    domain,
		SourceURL: rawURL,
	})
	if err != nil {
		if strings.HasPrefix(err.Error(), "company ") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	p, err := s.DB.AddPosting(companyID, rawURL, body.Title)
	if err != nil {
		if strings.HasPrefix(err.Error(), "url ") { // url required / url must be http(s)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cname, _, _ := s.DB.GetCompanyName(p.CompanyID)
	writeJSON(w, http.StatusOK, map[string]any{
		"posting": p, "company_id": p.CompanyID,
		"company_name": cname, "company_created": created,
	})
}

// handlePosting updates one posting's application-lifecycle fields — the
// tracker half of the jobs view. PUT /api/postings/{id} with the full
// tracking state {stage_history, outreach_count, last_outreach_at, outreach_status, contacts, notes};
// returns the refreshed posting. Like the company marks, a direct write with
// no Runner involved.
func (s *Server) handlePosting(w http.ResponseWriter, r *http.Request) {
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/postings/"), "/")
	// {id}/outreach is the posting's draft queue (see outreach.go).
	if pid, ok := strings.CutSuffix(id, "/outreach"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingOutreach(w, r, pid)
		return
	}
	// {id}/next-up toggles the "next up for outreach" queue mark.
	if pid, ok := strings.CutSuffix(id, "/next-up"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingNextUp(w, r, pid)
		return
	}
	// {id}/details edits the posting's hand-editable content (title, location…).
	if pid, ok := strings.CutSuffix(id, "/details"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingDetails(w, r, pid)
		return
	}
	// {id}/url changes the posting's link (its identity — own path, validated).
	if pid, ok := strings.CutSuffix(id, "/url"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingURL(w, r, pid)
		return
	}
	// {id}/company re-links the posting to a different existing company.
	if pid, ok := strings.CutSuffix(id, "/company"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingCompany(w, r, pid)
		return
	}
	// {id}/recapture re-runs the capture/enrich pass on the posting's stored
	// link — refreshes details and fills blanks in place, so a posting added by
	// hand needn't have its fields re-typed.
	if pid, ok := strings.CutSuffix(id, "/recapture"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingRecapture(w, r, pid)
		return
	}
	// {id}/answers/redetect forces a fresh question-detection run.
	if pid, ok := strings.CutSuffix(id, "/answers/redetect"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingAnswersRedetect(w, r, pid)
		return
	}
	// {id}/answers is the application-questions queue (see answers.go).
	if pid, ok := strings.CutSuffix(id, "/answers"); ok && pid != "" && !strings.Contains(pid, "/") {
		s.handlePostingAnswers(w, r, pid)
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
		case strings.HasPrefix(err.Error(), "last_outreach_at "),
			strings.HasPrefix(err.Error(), "outreach_status "),
			strings.HasPrefix(err.Error(), "outreach_count "):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// handlePostingDetails edits a posting's hand-editable content: PUT
// /api/postings/{id}/details with the full PostingEdit (title, location,
// summary, employment/workplace type, department, comp_range, description).
// Returns the refreshed posting. A direct write — no capture/LLM involved; this
// is how the user fixes a wrong role name or a blank field.
func (s *Server) handlePostingDetails(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var e store.PostingEdit
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&e); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p, err := s.DB.UpdatePostingDetails(id, e)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// handlePostingURL changes a posting's link: PUT /api/postings/{id}/url
// {"url": "https://…"}; returns the refreshed posting. The URL is the posting's
// identity, so it gets its own validated path rather than riding in the
// full-state details edit. A bad/empty url is a 400.
func (s *Server) handlePostingURL(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p, err := s.DB.UpdatePostingURL(id, body.URL)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			http.NotFound(w, r)
		case strings.Contains(err.Error(), "url "):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// handlePostingCompany re-links a posting to a different existing company: PUT
// /api/postings/{id}/company {"company_id": "…"}; returns the refreshed posting
// plus the new company's name. The fix for a posting captured under the wrong
// company twin — the target must already exist (an unknown/blank id is a 400,
// not a silent create). Mirrors handlePostingURL: the company is a relinkable
// identity, not editable content.
func (s *Server) handlePostingCompany(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p, err := s.DB.UpdatePostingCompany(id, body.CompanyID)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			http.NotFound(w, r)
		case errors.Is(err, store.ErrUnknownCompany):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	cname, _, _ := s.DB.GetCompanyName(p.CompanyID)
	writeJSON(w, http.StatusOK, map[string]any{
		"posting": p, "company_id": p.CompanyID, "company_name": cname,
	})
}

// handlePostingNextUp queues or unqueues one posting as "next up for
// outreach": PUT /api/postings/{id}/next-up {"next_up": bool}; returns the
// refreshed posting. The mark also clears on its own when the outreach goes
// out (see UpdatePostingTracking / MarkOutreachDraftSent). A direct write
// like the company flag — no Runner involved.
func (s *Server) handlePostingNextUp(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		NextUp bool `json:"next_up"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	p, err := s.DB.SetPostingNextUp(id, body.NextUp)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// handlePostingRecapture re-runs the capture/enrich pass on a posting already
// on file: POST /api/postings/{id}/recapture (no body). It re-resolves the
// posting's stored link through the same pipeline as the Add dialog — the ATS
// API when supported, else the one-shot LLM pass — and folds the fresh fields
// back into the existing row. The point is to fill the blanks for a posting the
// user added by hand without re-typing the details.
//
// Two things are pinned so a re-run can't drift. The kind: it's a known job, so
// it's never reclassified as a company page. The company: the existing name is
// passed as the typed field, so EnsureCompany matches the current company
// instead of minting a twin (and the URL-keyed upsert keeps the posting's
// company regardless). The capture upsert COALESCEs blanks, so a thin re-fetch
// never erases stored detail; the title rides along too, since it's the one
// editable column the upsert overwrites unconditionally.
func (s *Server) handlePostingRecapture(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p, err := s.DB.GetPosting(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if p == nil {
		http.NotFound(w, r)
		return
	}
	// The key gate only bites the LLM path; an ATS-resolvable link re-captures
	// keyless, exactly like the Add dialog.
	if s.ensureAnthropicKey() == "" && !capture.IsATSPosting(p.URL) {
		http.Error(w, "re-enrich needs an Anthropic API key for this link (set one in Settings, or ANTHROPIC_API_KEY in the server environment)", http.StatusPreconditionFailed)
		return
	}
	name, _, _ := s.DB.GetCompanyName(p.CompanyID)

	// One fetch (≤12s) plus at most one LLM call (≤45s); the margin covers redirects.
	ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
	defer cancel()
	c := &capture.Capturer{DB: s.DB, Client: s.Anthropic}
	res, err := c.Run(ctx, capture.Request{
		URL:    p.URL,
		Kind:   capture.KindJob,
		Fields: capture.Fields{Name: name, Title: p.Title},
	})
	if err != nil {
		var fe capture.FetchError
		switch {
		case strings.HasPrefix(err.Error(), "url "):
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
	// A pinned-job run writes the posting on any clean fetch; a nil posting means
	// the link no longer identifies a company, so report that rather than echo a
	// stale row.
	if res.Posting == nil {
		msg := res.Note
		if msg == "" {
			msg = "nothing to re-enrich from that link"
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error": msg, "fetch_status": res.FetchStatus,
		})
		return
	}
	writeJSON(w, http.StatusOK, res.Posting)
}
