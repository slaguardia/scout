package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/outreach"
	"github.com/slaguardia/scout/internal/store"
)

// fakeOutreachRunner records draft ids without running anything.
type fakeOutreachRunner struct{ started []int64 }

func (f *fakeOutreachRunner) Draft(id int64) { f.started = append(f.started, id) }

const seedTemplate = "Subject: [Name] | intro — {{role}}\n\nHi [Name],\n\n" +
	"{{hook: one true thing about {{company}}}}\n\nI spent five years at Globex.\n\nThanks,\nAlex"

// seedOutreachReady satisfies the draft gate (a DB template + a discovered
// experience + voice bundle) and creates a posting.
func seedOutreachReady(t *testing.T, s *Server, cid string) (postingID string) {
	t.Helper()
	if err := s.DB.PutOutreachTemplate(seedTemplate); err != nil {
		t.Fatalf("seed template: %v", err)
	}
	for _, src := range []store.OutreachSource{
		{Need: "experience", PageID: "exp1", Title: "Past Experience", Content: "Five years at Globex, forward-deployed.", Version: "v1"},
		{Need: "voice", PageID: "voice1", Title: "Voice & Style", Content: "Plain, tight sentences.", Version: "v1"},
	} {
		if err := s.DB.UpsertOutreachSource(src); err != nil {
			t.Fatalf("seed source: %v", err)
		}
	}
	p, err := s.DB.AddPosting(cid, "https://acme.com/jobs/fde", "FDE")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}
	return p.ID
}

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestOutreachDraftQueue(t *testing.T) {
	s, cid := newTestServer(t)
	runner := &fakeOutreachRunner{}
	s.Outreach = runner
	h := s.Handler()
	pid := seedOutreachReady(t, s, cid)

	// Start a draft: 202, runner fired, status researching, nothing degraded.
	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	var started struct {
		Draft    store.OutreachDraft `json:"draft"`
		Degraded []string            `json:"degraded"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &started); err != nil {
		t.Fatal(err)
	}
	if len(started.Degraded) != 0 {
		t.Fatalf("experience + voice seeded, but degraded = %v", started.Degraded)
	}
	d := started.Draft
	if d.Status != store.DraftResearching || len(runner.started) != 1 || runner.started[0] != d.ID {
		t.Fatalf("draft %+v, runner %+v", d, runner.started)
	}

	// Second start while active: 409.
	if rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", ""); rec.Code != http.StatusConflict {
		t.Errorf("double start: want 409, got %d", rec.Code)
	}
	// Unknown posting: 404.
	if rec := do(t, h, http.MethodPost, "/api/postings/nope/outreach", ""); rec.Code != http.StatusNotFound {
		t.Errorf("bad posting: want 404, got %d", rec.Code)
	}

	// List shows the draft.
	rec = do(t, h, http.MethodGet, "/api/postings/"+pid+"/outreach", "")
	var list struct {
		Drafts []store.OutreachDraft `json:"drafts"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list.Drafts) != 1 {
		t.Fatalf("list: %v %s", err, rec.Body.String())
	}

	// Pipeline finishes -> user edits (no lint in the template model).
	if err := s.DB.SetOutreachDraftResult(d.ID, store.DraftAwaitingReview, "{}", "", "draft text", "[]", "", ""); err != nil {
		t.Fatal(err)
	}
	idStr := strconv.FormatInt(d.ID, 10)
	rec = do(t, h, http.MethodPut, "/api/outreach/drafts/"+idStr, `{"edited":"my edited email"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("edit: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.Edited != "my edited email" || d.Lint != "[]" {
		t.Fatalf("edited draft: %+v", d)
	}

	// Mark sent: draft flips, posting tracking bumps.
	rec = do(t, h, http.MethodPost, "/api/outreach/drafts/"+idStr+"/sent", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("sent: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.Status != store.DraftSent || d.SentAt == "" {
		t.Fatalf("sent draft: %+v", d)
	}
	rows, err := s.DB.ListJobRows()
	if err != nil || len(rows) != 1 {
		t.Fatalf("job rows: %v", err)
	}
	if rows[0].OutreachCount != 1 || rows[0].LastOutreachAt == "" {
		t.Fatalf("posting tracking not bumped: %+v", rows[0])
	}
	// After terminal status a new draft may start.
	if rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", ""); rec.Code != http.StatusAccepted {
		t.Errorf("restart after sent: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestOutreachStartGates(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()
	p, err := s.DB.AddPosting(cid, "https://acme.com/jobs/x", "X")
	if err != nil {
		t.Fatal(err)
	}

	// No engine wired: 503.
	if rec := do(t, h, http.MethodPost, "/api/postings/"+p.ID+"/outreach", ""); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("no engine: want 503, got %d", rec.Code)
	}
	s.Outreach = &fakeOutreachRunner{}
	h = s.Handler()

	// The template always exists (DB row or compiled-in default), so it is never
	// a gate. With no experience cached: 412 need=experience.
	rec := do(t, h, http.MethodPost, "/api/postings/"+p.ID+"/outreach", "")
	if rec.Code != http.StatusPreconditionFailed {
		t.Fatalf("no experience: want 412, got %d (%s)", rec.Code, rec.Body.String())
	}
	if need := gateNeed(t, rec); need != "experience" {
		t.Errorf("need = %q, want experience", need)
	}

	// Experience present, no voice: 202 with voice degraded.
	if err := s.DB.UpsertOutreachSource(store.OutreachSource{Need: "experience", PageID: "exp1", Title: "Exp", Content: "5y Globex", Version: "v1"}); err != nil {
		t.Fatal(err)
	}
	rec = do(t, h, http.MethodPost, "/api/postings/"+p.ID+"/outreach", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("ready: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Degraded []string `json:"degraded"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !hasString(body.Degraded, "voice") {
		t.Errorf("degraded = %v, want voice", body.Degraded)
	}
}

func gateNeed(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Need string `json:"need"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode gate: %v (%s)", err, rec.Body.String())
	}
	return body.Need
}

// hasString reports whether xs contains s.
func hasString(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

func TestOutreachSourcesEndpoint(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()
	for _, src := range []store.OutreachSource{
		{Need: "experience", PageID: "exp1", Title: "Past Experience", Content: "x", Version: "v1"},
		{Need: "voice", PageID: "voice1", Title: "Voice", Content: "y", Version: "v1"},
	} {
		if err := s.DB.UpsertOutreachSource(src); err != nil {
			t.Fatal(err)
		}
	}
	rec := do(t, h, http.MethodGet, "/api/outreach/sources", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("sources: want 200, got %d", rec.Code)
	}
	var body struct {
		Sources []struct {
			Need  string `json:"need"`
			Title string `json:"title"`
		} `json:"sources"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Sources) != 2 {
		t.Fatalf("want 2 sources, got %d", len(body.Sources))
	}
}

// errRT fails every request instantly — keeps the engine's JD pre-fetch offline
// in tests (the fetch degrades gracefully by design).
type errRT struct{}

func (errRT) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("offline test")
}

// fakeLLM serves Anthropic-shaped responses from a scripted queue.
func fakeLLM(t *testing.T, replies []string) *httptest.Server {
	t.Helper()
	i := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if i >= len(replies) {
			t.Errorf("fake LLM: unexpected call %d", i+1)
			http.Error(w, "out of replies", 500)
			return
		}
		b, _ := json.Marshal(map[string]any{
			"content":     []map[string]string{{"type": "text", "text": replies[i]}},
			"stop_reason": "end_turn",
		})
		i++
		w.Write(b)
	}))
}

// TestOutreachEndToEnd drives the REAL stack the way the panel does: POST start
// fires the async engine (scripted LLM: research → fill → honesty), the test
// polls the queue until the draft lands in review, then edits and sends it.
func TestOutreachEndToEnd(t *testing.T) {
	s, cid := newTestServer(t)
	pid := seedOutreachReady(t, s, cid)

	llm := fakeLLM(t, []string{
		`{"company":"Acme","what_they_do":"infra","customer":"enterprises","stage":"B","headcount_est":"80","role":{"title":"FDE","jd_quotes":["x"]},"hooks":[{"type":"jd","quote":"x","source_url":"https://a.invalid","context":"c"}],"disambiguation":"","confidence":"high"}`,
		`{"fills":{"hook":"You ship into customer environments, like my forward-deployed work."}}`,
		`{"hook":"You ship into customer environments, like my forward-deployed work."}`,
		`{"verdict":"pass","violations":[]}`,
	})
	defer llm.Close()

	ac := anthropic.New("test-key")
	ac.Endpoint = llm.URL
	s.Outreach = &outreach.Engine{
		DB: s.DB, Client: ac, HTTP: &http.Client{Transport: errRT{}},
	}
	h := s.Handler()

	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: %d (%s)", rec.Code, rec.Body.String())
	}

	var d store.OutreachDraft
	deadline := time.Now().Add(10 * time.Second)
	for {
		rec = do(t, h, http.MethodGet, "/api/postings/"+pid+"/outreach", "")
		var list struct {
			Drafts []store.OutreachDraft `json:"drafts"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list.Drafts) == 0 {
			t.Fatalf("list: %v %s", err, rec.Body.String())
		}
		d = list.Drafts[0]
		if d.Status != store.DraftResearching {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("draft stuck researching")
		}
		time.Sleep(50 * time.Millisecond)
	}
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q (fail_reason=%q)", d.Status, d.FailReason)
	}
	for _, want := range []string{
		"You ship into customer environments", // filled hole
		"I spent five years at Globex.",       // verbatim prose
		"Subject: [Name] | intro — FDE",       // {{role}} resolved
		"Thanks,\nAlex",
	} {
		if !strings.Contains(d.Draft, want) {
			t.Fatalf("assembled draft missing %q:\n%s", want, d.Draft)
		}
	}

	// Edit, then send.
	idStr := strconv.FormatInt(d.ID, 10)
	rec = do(t, h, http.MethodPut, "/api/outreach/drafts/"+idStr, `{"edited":"my edited email"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("edit: %d", rec.Code)
	}
	rec = do(t, h, http.MethodPost, "/api/outreach/drafts/"+idStr+"/sent", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("sent: %d", rec.Code)
	}
	rows, _ := s.DB.ListJobRows()
	if rows[0].OutreachDraftStatus != store.DraftSent {
		t.Fatalf("row badge status = %q", rows[0].OutreachDraftStatus)
	}
}

// TestOutreachRegenerate covers ?regenerate=1: it retires the current
// awaiting_review draft (kept in history) and starts a fresh researching one,
// where a plain re-POST would 409.
func TestOutreachRegenerate(t *testing.T) {
	s, cid := newTestServer(t)
	runner := &fakeOutreachRunner{}
	s.Outreach = runner
	h := s.Handler()
	pid := seedOutreachReady(t, s, cid)

	// First draft, drive it to awaiting_review.
	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	var first struct {
		Draft store.OutreachDraft `json:"draft"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.SetOutreachDraftResult(first.Draft.ID, store.DraftAwaitingReview, "{}", "", "draft text", "[]", "", ""); err != nil {
		t.Fatal(err)
	}

	// Plain re-POST conflicts; regenerate succeeds with a new researching draft.
	if rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", ""); rec.Code != http.StatusConflict {
		t.Fatalf("plain re-post: want 409, got %d", rec.Code)
	}
	rec = do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach?regenerate=1", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("regenerate: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	var regen struct {
		Draft store.OutreachDraft `json:"draft"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &regen); err != nil {
		t.Fatal(err)
	}
	if regen.Draft.ID == first.Draft.ID || regen.Draft.Status != store.DraftResearching {
		t.Fatalf("regenerate draft = %+v, want a new researching draft", regen.Draft)
	}
	if len(runner.started) != 2 || runner.started[1] != regen.Draft.ID {
		t.Fatalf("runner not fired for regenerated draft: %+v", runner.started)
	}

	// History: the original is superseded, the new one is researching.
	rec = do(t, h, http.MethodGet, "/api/postings/"+pid+"/outreach", "")
	var list struct {
		Drafts []store.OutreachDraft `json:"drafts"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Drafts) != 2 {
		t.Fatalf("want 2 drafts, got %d", len(list.Drafts))
	}
	if list.Drafts[0].ID != regen.Draft.ID || list.Drafts[0].Status != store.DraftResearching {
		t.Errorf("newest draft = %+v, want new researching", list.Drafts[0])
	}
	if list.Drafts[1].ID != first.Draft.ID || list.Drafts[1].Status != store.DraftSuperseded {
		t.Errorf("oldest draft = %+v, want superseded original", list.Drafts[1])
	}
	if list.Drafts[1].Draft != "draft text" {
		t.Errorf("superseded draft lost its body: %q", list.Drafts[1].Draft)
	}
}
