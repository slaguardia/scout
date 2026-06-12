package outreach

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

// fakeAnthropic serves scripted responses from a FIFO queue: each /v1/messages
// call pops the next text and records the raw request body (so tests can
// assert on prompts). This drives the whole pipeline deterministically.
type fakeAnthropic struct {
	mu      sync.Mutex
	replies []string
	calls   int
	reqs    []string // raw request body per call, in order
}

func (f *fakeAnthropic) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		body, _ := io.ReadAll(r.Body)
		f.reqs = append(f.reqs, string(body))
		if f.calls >= len(f.replies) {
			t.Errorf("unexpected anthropic call #%d (only %d scripted)", f.calls+1, len(f.replies))
			http.Error(w, "no scripted reply", http.StatusInternalServerError)
			return
		}
		reply := f.replies[f.calls]
		f.calls++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "msg", "model": "test", "stop_reason": "end_turn",
			"content": []map[string]any{{"type": "text", "text": reply}},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

const verbatimLine = "I spent five years at Globex Systems in a forward-deployed role."

const testTemplate = "Subject: [Name] | intro — {{role}}\n\nHi [Name],\n\n" +
	"{{hook: one true thing about {{company}} tied to my work}}\n\n" +
	verbatimLine + "\n\n" +
	"{{closer: ask about the {{role}} role}}\n\nThanks,\nAlex"

// newEngine wires an engine onto the fake Anthropic server, a fresh DB, and a
// temp template file.
func newEngine(t *testing.T, fake *fakeAnthropic) (*Engine, *store.DB) {
	t.Helper()
	srv := fake.server(t)
	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.PutOutreachTemplate(testTemplate); err != nil {
		t.Fatalf("seed template: %v", err)
	}
	eng := &Engine{
		DB:     db,
		Client: &anthropic.Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()},
		Model:  "test-model",
	}
	return eng, db
}

// seedExperience caches one experience source so the draft gate + honesty check
// have ground truth.
func seedExperience(t *testing.T, db *store.DB) {
	t.Helper()
	if err := db.UpsertOutreachSource(store.OutreachSource{
		Need: "experience", PageID: "exp1", Title: "Past Experience",
		Content: "Five years at Globex Systems, forward-deployed, led a small infra team ~2y, Secret clearance.",
		Version: "v1",
	}); err != nil {
		t.Fatalf("seed experience: %v", err)
	}
}

// seedPostingDraft creates a company + posting + draft and returns the draft id.
func seedPostingDraft(t *testing.T, db *store.DB) int64 {
	t.Helper()
	cid, err := db.UpsertCompany(store.Company{
		Source: "test", Name: "Acme",
		Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}",
	})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.invalid/careers/backend", "Backend Engineer")
	if err != nil {
		t.Fatalf("add posting: %v", err)
	}
	d, err := db.CreateOutreachDraft(p.ID)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	return d.ID
}

const researchJSON = `{"company":"Acme","what_they_do":"infra","customer":"enterprises","stage":"Series B","headcount_est":"80","role":{"title":"Backend Engineer","jd_quotes":["deploy into customer environments"]},"hooks":[{"type":"jd","quote":"deploy into customer environments","source_url":"https://acme.invalid","context":"customer-embedded"}],"disambiguation":"the infra Acme","confidence":"high"}`

const (
	hookText   = "You ship into customer environments, the forward-deployed work I did at Globex."
	closerText = "Open to a quick call about the Backend Engineer role?"
)

func fillReply(hook, closer string) string {
	b, _ := json.Marshal(map[string]any{"fills": map[string]string{"hook": hook, "closer": closer}})
	return string(b)
}

// humanizeReply is the humanizer's cleaned-holes JSON. Tests return the holes
// unchanged so downstream assertions on the assembled email still hold.
func humanizeReply(hook, closer string) string {
	b, _ := json.Marshal(map[string]string{"hook": hook, "closer": closer})
	return string(b)
}

const (
	noSendReply = `{"no_send": true, "reason": "nothing specific connects to my work"}`
	honestyPass = `{"verdict":"pass","violations":[]}`
	honestyFail = `{"verdict":"fail","violations":[{"claim":"led the program","why":"doc says led a team"}]}`

	judgeDeep    = `{"depth":"deep","proof_tier":"direct","weaknesses":[],"experience_gaps":"","feedback":""}`
	judgeMedium  = `{"depth":"medium","proof_tier":"adjacent","weaknesses":["hook interprets one signal"],"experience_gaps":"Quota-carrying AE work would have let the proof go direct.","feedback":"Engage the bet: state what their wager makes obsolete."}`
	judgeShallow = `{"depth":"shallow","proof_tier":"none","weaknesses":["hook restates the headline"],"experience_gaps":"","feedback":"Make an interpretation, not a restatement."}`
)

// (a) Happy path: research → fill → honesty pass → judge deep → awaiting_review,
// with the filled holes + the verbatim prose present, the subject/greeting
// assembled, and the judge's critique stored.
func TestRunHappyPath(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeDeep}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review (fail=%q)", d.Status, d.FailReason)
	}
	for _, want := range []string{
		"Subject: [Name] | intro — Backend Engineer", "Hi [Name],",
		hookText, verbatimLine, closerText,
	} {
		if !strings.Contains(d.Draft, want) {
			t.Errorf("assembled email missing %q:\n%s", want, d.Draft)
		}
	}
	for _, want := range []string{`"depth":"deep"`, `"proof_tier":"direct"`, `"attempts":1`} {
		if !strings.Contains(d.Critique, want) {
			t.Errorf("critique missing %s: %q", want, d.Critique)
		}
	}
	if strings.Contains(d.Critique, `"feedback"`) {
		t.Errorf("stored critique should omit the retry feedback: %q", d.Critique)
	}
	if fake.calls != 5 {
		t.Errorf("anthropic calls = %d, want 5 (research, fill, humanize, honesty, judge)", fake.calls)
	}
}

// (b) No-send: the fill declines → no_hook, no draft, no fail.
func TestRunNoSendMeansNoEmail(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{researchJSON, noSendReply}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftNoHook {
		t.Fatalf("status = %q, want no_hook", d.Status)
	}
	if d.Draft != "" {
		t.Errorf("draft should be empty, got %q", d.Draft)
	}
	if d.FailReason != "" {
		t.Errorf("no_hook is a success path; fail_reason = %q", d.FailReason)
	}
}

// (c) Honesty fail → fill retry (with the violations in the feedback) → pass.
func TestRunHonestyRetryPasses(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyFail, judgeDeep,
		fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeDeep,
	}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review", d.Status)
	}
	if fake.calls != 9 {
		t.Errorf("calls = %d, want 9 (research, then fill, humanize, honesty, judge ×2 attempts)", fake.calls)
	}
	// The retry fill saw the honesty violations, labeled.
	retryFill := fake.reqs[5]
	if !strings.Contains(retryFill, "A reviewer flagged these claims") || !strings.Contains(retryFill, "led the program") {
		t.Errorf("retry fill input missing the labeled honesty violations:\n%s", retryFill)
	}
}

// (d) Honesty fail twice → failed, violations + critique saved.
func TestRunHonestyTwiceFails(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyFail, judgeDeep,
		fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyFail, judgeDeep,
	}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed", d.Status)
	}
	if d.FailReason != "honesty check failed twice" {
		t.Errorf("fail_reason = %q", d.FailReason)
	}
	if !strings.Contains(d.Violations, "led the program") {
		t.Errorf("violations not saved: %q", d.Violations)
	}
	if !strings.Contains(d.Critique, `"attempts":2`) {
		t.Errorf("critique not saved on the honesty-failed draft: %q", d.Critique)
	}
}

// Judge medium twice (honesty clean) → needs_work: the draft IS stored and
// reviewable, with the judge's critique on the row.
func TestRunMediumTwiceNeedsWork(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeMedium,
		fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeMedium,
	}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftNeedsWork {
		t.Fatalf("status = %q, want needs_work (fail=%q)", d.Status, d.FailReason)
	}
	if d.FailReason != "" {
		t.Errorf("needs_work is reviewable, not failed; fail_reason = %q", d.FailReason)
	}
	if !strings.Contains(d.Draft, hookText) {
		t.Errorf("needs_work draft body not stored:\n%s", d.Draft)
	}
	if d.Lint == "" {
		t.Errorf("needs_work draft lint not stored")
	}
	for _, want := range []string{`"depth":"medium"`, `"proof_tier":"adjacent"`, "hook interprets one signal", "Quota-carrying AE work", `"attempts":2`} {
		if !strings.Contains(d.Critique, want) {
			t.Errorf("critique missing %s: %q", want, d.Critique)
		}
	}
	// The retry fill saw the judge's rewrite instructions, labeled.
	retryFill := fake.reqs[5]
	if !strings.Contains(retryFill, "A quality reviewer wants these changes") ||
		!strings.Contains(retryFill, "Engage the bet: state what their wager makes obsolete.") {
		t.Errorf("retry fill input missing the labeled judge feedback:\n%s", retryFill)
	}
}

// Judge shallow twice → failed with the depth-bar fail reason (a shallow email
// is not worth the user's review time).
func TestRunShallowTwiceFails(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeShallow,
		fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeShallow,
	}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed", d.Status)
	}
	if d.FailReason != "below the depth bar — judged shallow twice" {
		t.Errorf("fail_reason = %q", d.FailReason)
	}
	if !strings.Contains(d.Critique, `"depth":"shallow"`) {
		t.Errorf("critique not saved: %q", d.Critique)
	}
}

// A judge verdict outside the schema is a pipeline error: Run fails and the
// catch-all flips the draft to failed (never stranded in researching).
func TestRunJudgeBadVerdict(t *testing.T) {
	bad := `{"depth":"profound","proof_tier":"direct","weaknesses":[],"experience_gaps":"","feedback":""}`
	fake := &fakeAnthropic{replies: []string{
		researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, bad,
	}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	err := eng.Run(context.Background(), id)
	if err == nil || !strings.Contains(err.Error(), `unknown depth "profound"`) {
		t.Fatalf("Run err = %v, want unknown-depth judge error", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed (the catch-all must not strand the row)", d.Status)
	}
}

// The fill and judge prompts carry the DB-saved doctrine (the editable method
// reaches the model without a restart).
func TestRunUsesSavedDoctrine(t *testing.T) {
	const marker = "DOCTRINE-MARKER-XYZZY: only ship deep observations."
	fake := &fakeAnthropic{replies: []string{researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeDeep}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)
	if err := db.PutOutreachDoctrine(marker); err != nil {
		t.Fatalf("save doctrine: %v", err)
	}

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(fake.reqs[1], marker) {
		t.Errorf("fill request (system prompt) missing the saved doctrine:\n%s", fake.reqs[1])
	}
	if !strings.Contains(fake.reqs[4], marker) {
		t.Errorf("judge request missing the saved doctrine:\n%s", fake.reqs[4])
	}
}

// A fully-static template (no holes) short-circuits fill/honesty/judge: the
// prose is the user's own, true by construction — one research call only.
func TestRunNoHolesShortCircuit(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{researchJSON}}
	eng, db := newEngine(t, fake)
	if err := db.PutOutreachTemplate("Hi [Name],\n\n" + verbatimLine + "\n\nThanks,\nAlex"); err != nil {
		t.Fatalf("seed template: %v", err)
	}
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review (fail=%q)", d.Status, d.FailReason)
	}
	if !strings.Contains(d.Draft, verbatimLine) {
		t.Errorf("rendered email missing the verbatim prose:\n%s", d.Draft)
	}
	if d.Critique != "" {
		t.Errorf("no judge ran; critique = %q", d.Critique)
	}
	if d.Lint != "[]" {
		t.Errorf("lint = %q, want [] (short body, nothing flagged)", d.Lint)
	}
	if fake.calls != 1 {
		t.Errorf("calls = %d, want 1 (research only)", fake.calls)
	}
}

// (e) No experience cached → drafting fails loud BEFORE any LLM call (the
// honesty checker would have no ground truth).
func TestRunFailsWithoutExperience(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{}} // no call should be made
	eng, db := newEngine(t, fake)
	id := seedPostingDraft(t, db) // no seedExperience

	if err := eng.Run(context.Background(), id); err == nil {
		t.Fatal("Run: want error when no experience is cached")
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed", d.Status)
	}
	if fake.calls != 0 {
		t.Errorf("made %d LLM calls; the gate must fail before any call", fake.calls)
	}
}

// (g) A stored description is used for the JD (no network fetch).
func TestRunUsesStoredDescription(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{researchJSON, fillReply(hookText, closerText), humanizeReply(hookText, closerText), honestyPass, judgeDeep}}
	eng, db := newEngine(t, fake)
	seedExperience(t, db)
	id := seedPostingDraft(t, db)

	d, _ := db.GetOutreachDraft(id)
	p, _ := db.GetPosting(d.PostingID)
	if _, _, err := db.UpsertCapturedPosting(store.CapturedPosting{
		CompanyID: p.CompanyID, URL: p.URL, Title: p.Title,
		Description: "Backend Engineer. Deploy into customer environments. Go, Postgres.",
		FetchStatus: "ok",
	}); err != nil {
		t.Fatalf("store description: %v", err)
	}

	var logs []string
	eng.Log = func(s string) { logs = append(logs, s) }
	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got, _ := db.GetOutreachDraft(id); got.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review (fail=%q)", got.Status, got.FailReason)
	}
	stored := false
	for _, l := range logs {
		if strings.Contains(l, "stored at capture") {
			stored = true
		}
	}
	if !stored {
		t.Errorf("JD did not come from the stored description; logs:\n%s", strings.Join(logs, "\n"))
	}
}
