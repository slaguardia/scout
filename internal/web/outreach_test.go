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

// seedOutreachReady satisfies the block-health gate and creates a posting.
func seedOutreachReady(t *testing.T, s *Server, cid string) (postingID string) {
	t.Helper()
	for _, name := range []string{"P2_LOCKED", "HOOK_RULES", "CLOSER_RULES", "VOICE_RULES", "PAST_EXPERIENCE_FULL"} {
		if err := s.DB.PutOutreachBlock(name, "content of "+name, "v1"); err != nil {
			t.Fatalf("seed block %s: %v", name, err)
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

	// Start a draft: 202, runner fired, status researching.
	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}
	var d store.OutreachDraft
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
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

	// Pipeline finishes -> user edits -> lint runs (em dash + word count here).
	if err := s.DB.SetOutreachDraftResult(d.ID, store.DraftAwaitingReview, "{}", "{}", "draft text", "[]", "", ""); err != nil {
		t.Fatal(err)
	}
	idStr := strconv.FormatInt(d.ID, 10)
	rec = do(t, h, http.MethodPut, "/api/outreach/drafts/"+idStr, `{"edited":"short — edit"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("edit: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.Edited != "short — edit" || d.Lint == "[]" || d.Lint == "" {
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

	// Engine wired but blocks missing: 412 naming them.
	s.Outreach = &fakeOutreachRunner{}
	h = s.Handler()
	rec := do(t, h, http.MethodPost, "/api/postings/"+p.ID+"/outreach", "")
	if rec.Code != http.StatusPreconditionFailed {
		t.Fatalf("missing blocks: want 412, got %d (%s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Missing []string `json:"missing_blocks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || len(body.Missing) != 5 {
		t.Fatalf("missing_blocks = %v (%v)", body.Missing, err)
	}

	// Broken block also gates.
	seedOutreachReady(t, s, cid)
	if err := s.DB.MarkOutreachBlockBroken("VOICE_RULES", "drifted"); err != nil {
		t.Fatal(err)
	}
	rec = do(t, h, http.MethodPost, "/api/postings/"+p.ID+"/outreach", "")
	if rec.Code != http.StatusPreconditionFailed {
		t.Fatalf("broken block: want 412, got %d", rec.Code)
	}
}

func TestOutreachBlocksEndpoint(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()
	seedOutreachReady(t, s, cid)

	rec := do(t, h, http.MethodGet, "/api/outreach/blocks", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("blocks: want 200, got %d", rec.Code)
	}
	var body struct {
		Blocks []struct {
			Block string `json:"block"`
			State string `json:"state"`
		} `json:"blocks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Blocks) != 8 {
		t.Fatalf("want 8 slots, got %d", len(body.Blocks))
	}
	states := map[string]string{}
	for _, b := range body.Blocks {
		states[b.Block] = b.State
	}
	if states["P2_LOCKED"] != "ok" || states["HUMANIZER"] != "unpinned" || states["BANK_ROWS"] != "derived" {
		t.Fatalf("states = %v", states)
	}
}

// errRT fails every request instantly — keeps the engine's JD pre-fetch
// offline in tests (the fetch degrades gracefully by design).
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

// TestOutreachEndToEnd drives the REAL stack the way the panel does: POST
// start fires the async engine (scripted LLM), the test polls the queue until
// the draft lands in review, then edits and marks it sent.
func TestOutreachEndToEnd(t *testing.T) {
	s, cid := newTestServer(t)
	pid := seedOutreachReady(t, s, cid)
	// The engine derives EXPERIENCE_CARD unless it is fresh; seed it fresh
	// against the seeded PAST_EXPERIENCE_FULL version ("v1").
	if err := s.DB.PutOutreachBlock("EXPERIENCE_CARD", "5y forward-deployed; infra lead; agent tooling.", "derived:v1"); err != nil {
		t.Fatal(err)
	}

	p2 := "content of P2_LOCKED" // what seedOutreachReady stored
	p1 := strings.Repeat("true platform words ", 12)
	p3 := strings.Repeat("desire framed words ", 12) + "Open to a quick call about the role?"
	llm := fakeLLM(t, []string{
		`{"company":"Acme","what_they_do":"infra","customer":"enterprises","stage":"B","headcount_est":"80","role":{"title":"FDE","jd_quotes":["x"]},"hooks":[{"type":"jd","quote":"x","source_url":"https://a.invalid","context":"c"}],"disambiguation":"","confidence":"high"}`,
		`{"decision":"hook","hook":{"quote":"x","source_url":"https://a.invalid","thread":"like my work"},"closer_mode":"role_posted","reasoning":"honest"}`,
		`{"p1":"` + p1 + `","p3":"` + p3 + `"}`,
		`{"verdict":"pass","violations":[]}`,
	})
	defer llm.Close()

	ac := anthropic.New("test-key")
	ac.Endpoint = llm.URL
	s.Outreach = &outreach.Engine{DB: s.DB, Client: ac, HTTP: &http.Client{Transport: errRT{}}}
	h := s.Handler()

	rec := do(t, h, http.MethodPost, "/api/postings/"+pid+"/outreach", "")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: %d (%s)", rec.Code, rec.Body.String())
	}

	// Poll like the panel does.
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
	if !strings.Contains(d.Draft, p2) || !strings.Contains(d.Draft, "Subject: [Name] | Alex intro — FDE") || !strings.Contains(d.Draft, "Thanks,\nAlex") {
		t.Fatalf("assembled draft wrong:\n%s", d.Draft)
	}
	if d.Lint != "[]" {
		t.Errorf("lint = %s", d.Lint)
	}

	// Edit, then send.
	idStr := strconv.FormatInt(d.ID, 10)
	rec = do(t, h, http.MethodPut, "/api/outreach/drafts/"+idStr, `{"edited":"`+strings.TrimSpace(p1)+`"}`)
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
