package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

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
	if len(body.Blocks) != 9 {
		t.Fatalf("want 9 slots, got %d", len(body.Blocks))
	}
	states := map[string]string{}
	for _, b := range body.Blocks {
		states[b.Block] = b.State
	}
	if states["P2_LOCKED"] != "ok" || states["HUMANIZER"] != "unpinned" || states["BANK_ROWS"] != "derived" {
		t.Fatalf("states = %v", states)
	}
}
