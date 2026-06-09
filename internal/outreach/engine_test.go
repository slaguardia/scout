package outreach

import (
	"context"
	"database/sql"
	"encoding/json"
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
// call pops the next text and returns it as a single text content block. This
// lets a test drive the whole pipeline deterministically without a live API.
type fakeAnthropic struct {
	mu      sync.Mutex
	replies []string
	calls   int
}

func (f *fakeAnthropic) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.calls >= len(f.replies) {
			t.Errorf("unexpected anthropic call #%d (only %d scripted)", f.calls+1, len(f.replies))
			http.Error(w, "no scripted reply", http.StatusInternalServerError)
			return
		}
		reply := f.replies[f.calls]
		f.calls++
		w.Header().Set("Content-Type", "application/json")
		out := map[string]any{
			"id":          "msg",
			"model":       "test",
			"stop_reason": "end_turn",
			"content":     []map[string]any{{"type": "text", "text": reply}},
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// newEngine wires an engine onto the fake Anthropic server and a fresh DB.
func newEngine(t *testing.T, fake *fakeAnthropic) (*Engine, *store.DB) {
	t.Helper()
	srv := fake.server(t)
	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	eng := &Engine{
		DB:     db,
		Client: &anthropic.Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()},
		Model:  "test-model",
		// Pin the identity so assertions don't depend on DefaultSender (now
		// neutral) or on a stored row (the temp DB has none).
		Who: Sender{
			SubjectName: "Alex", Signature: "Thanks,\nAlex",
			Lens: "test lens", HookPrefs: "test prefs", Arc: "test arc",
		},
		// HTTP is left nil → FetchJD does a plain GET against the (bogus) posting
		// URL, which fails fast and the engine tolerates it.
	}
	return eng, db
}

// seedRequiredBlocks pins the five required blocks plus the derived experience
// card (so the engine doesn't try to derive it). Optional blocks are seeded by
// individual tests as needed.
func seedRequiredBlocks(t *testing.T, db *store.DB, p2 string) {
	t.Helper()
	must := func(name, content, version string) {
		if err := db.PutOutreachBlock(name, content, version); err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
	}
	must("P2_LOCKED", p2, "v7.1")
	must("HOOK_RULES", "effort ladder; earned vs performed; drop 'I applied'", "h1")
	must("CLOSER_RULES", "role_posted / no_role / unsure", "c1")
	must("VOICE_RULES", "tight sentences; no em dashes; no AI-isms", "v1")
	must("PAST_EXPERIENCE_FULL", "5y Globex FDE, Secret-level, led an infra team ~2y.", "pe1")
	// Card version must match what ensureExperienceCard expects, so it is fresh.
	must("EXPERIENCE_CARD", "5y Globex, FDE-like, Secret-level, led infra team ~2y.", "derived:pe1")
}

// seedPostingDraft creates a company + posting + draft and returns the draft id.
func seedPostingDraft(t *testing.T, db *store.DB) int64 {
	t.Helper()
	cid, err := db.UpsertCompany(store.Company{
		Source:  "test",
		Name:    "Acme",
		Domain:  sql.NullString{String: "acme.com", Valid: true},
		RawJSON: "{}",
	})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	// A non-ATS, non-resolvable URL: FetchJD's plain GET fails, engine tolerates.
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

// --- canned stage outputs ------------------------------------------------

const researchJSON = `{"company":"Acme","what_they_do":"infra","customer":"enterprises","stage":"Series B","headcount_est":"80","role":{"title":"Backend Engineer","jd_quotes":["deploy into customer environments"]},"hooks":[{"type":"jd","quote":"deploy into customer environments","source_url":"https://acme.invalid","context":"the role is customer-embedded"}],"disambiguation":"the infra Acme","confidence":"high"}`

const hookJSONReply = `{"decision":"hook","hook":{"quote":"deploy into customer environments","source_url":"https://acme.invalid","thread":"like my forward-deployed work at Globex"},"closer_mode":"role_posted","reasoning":"Specific and honest."}`

const noHookReply = `{"decision":"no_honest_hook","hook":{"quote":"","source_url":"","thread":""},"closer_mode":"no_role","reasoning":"Nothing specific connects."}`

// drafterReply builds a {p1,p3} that, when assembled with the P2 below, lands in
// the 75-125 word lint window.
func drafterReply(p1, p3 string) string {
	b, _ := json.Marshal(map[string]string{"p1": p1, "p3": p3})
	return string(b)
}

const honestyPass = `{"verdict":"pass","violations":[]}`
const honestyFail = `{"verdict":"fail","violations":[{"claim":"led the program","why":"doc says led a team"}]}`

// p2Block is sized so the assembled email reaches the 75-125 word window.
const p2Block = "I spent five years at Globex Systems in a forward-deployed engineering role, embedded with customer teams to ship enterprise deployments into operational environments and feed the lessons back to engineering. For about two years I led a small infrastructure team. I hold a Secret-level clearance. On the side I build agent tooling and small products that real people use. — Alex"

const longP1 = "You mentioned the role is about deploying into customer environments, which is exactly the forward-deployed work I did at Globex for five years, embedded with the teams who actually run the systems."
const longP3 = "Building reliable infrastructure for customer-embedded teams is the work I want to be doing every day. Open to a quick call in the next week or two about the Backend Engineer role?"

// --- tests ---------------------------------------------------------------

// (a) Happy hook path lands awaiting_review with the P2 verbatim in the email.
func TestRunHappyHookPath(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,                 // researcher
		hookJSONReply,                // hook selector
		drafterReply(longP1, longP3), // drafter
		honestyPass,                  // honesty checker
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review (fail_reason=%q)", d.Status, d.FailReason)
	}
	if !strings.Contains(d.Draft, p2Block) {
		t.Errorf("assembled email missing P2 verbatim:\n%s", d.Draft)
	}
	if !strings.HasPrefix(d.Draft, "Subject: [Name] | Alex intro — Backend Engineer") {
		t.Errorf("subject line wrong:\n%s", d.Draft)
	}
	if !strings.Contains(d.Draft, "Hi [Name],") {
		t.Errorf("greeting missing:\n%s", d.Draft)
	}
}

// (b) no_honest_hook fills the mass template and lands no_hook.
func TestRunNoHookMeansNoEmail(t *testing.T) {
	// "If you can't write even one true sentence for a company, don't email
	// them" — no_honest_hook produces NO draft (and no mass template); the
	// hook selector's reasoning is preserved for the panel. A success path.
	fake := &fakeAnthropic{replies: []string{
		researchJSON, // researcher
		noHookReply,  // hook selector
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftNoHook {
		t.Fatalf("status = %q, want no_hook", d.Status)
	}
	if d.Draft != "" {
		t.Errorf("draft should be empty (recommend not emailing), got %q", d.Draft)
	}
	if d.FailReason != "" {
		t.Errorf("no_hook is a success path; fail_reason = %q", d.FailReason)
	}
	if !strings.Contains(d.Hook, "no_honest_hook") {
		t.Errorf("hook output not preserved: %q", d.Hook)
	}
}

// (c) Honesty fail → drafter retry → pass lands awaiting_review.
func TestRunHonestyFailThenRetryPasses(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,                 // researcher
		hookJSONReply,                // hook selector
		drafterReply(longP1, longP3), // drafter (attempt 1)
		honestyFail,                  // honesty (attempt 1) → fail
		drafterReply(longP1, longP3), // drafter (attempt 2, with violations)
		honestyPass,                  // honesty (attempt 2) → pass
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review", d.Status)
	}
	if fake.calls != 6 {
		t.Errorf("anthropic calls = %d, want 6 (research, hook, draft, honesty, draft, honesty)", fake.calls)
	}
}

// (d) Honesty fail twice → failed, with the violations saved.
func TestRunHonestyFailTwiceFails(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,
		hookJSONReply,
		drafterReply(longP1, longP3),
		honestyFail,
		drafterReply(longP1, longP3),
		honestyFail,
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed", d.Status)
	}
	if !strings.Contains(d.FailReason, "honesty check failed twice") {
		t.Errorf("fail_reason = %q", d.FailReason)
	}
	if !strings.Contains(d.Violations, "led the program") {
		t.Errorf("violations not saved: %q", d.Violations)
	}
}

// (e) Humanizer mangles P2 → its revision is discarded, pre-humanizer text kept.
func TestRunHumanizerManglingP2Discarded(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,                 // researcher
		hookJSONReply,                // hook selector
		drafterReply(longP1, longP3), // drafter
		"This rewrite dropped the locked paragraph entirely.", // humanizer (mangles P2)
		honestyPass, // honesty checker
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	if err := db.PutOutreachBlock("HUMANIZER", "You de-AI emails.", "hum1"); err != nil {
		t.Fatalf("seed humanizer: %v", err)
	}
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review", d.Status)
	}
	// The mangled revision was discarded → P2 verbatim survives.
	if !strings.Contains(d.Draft, p2Block) {
		t.Errorf("pre-humanizer text not kept (P2 missing):\n%s", d.Draft)
	}
	if strings.Contains(d.Draft, "dropped the locked paragraph") {
		t.Errorf("humanizer's mangled output was kept:\n%s", d.Draft)
	}
}

// (f) A stage returning malformed JSON → one retry then failed (never stuck in
// researching). The hook selector returns junk twice.
func TestRunMalformedJSONRetriesThenFails(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,            // researcher (ok)
		"sorry, no JSON here",   // hook selector (bad)
		"still no json for you", // hook selector retry (bad)
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	id := seedPostingDraft(t, db)

	err := eng.Run(context.Background(), id)
	if err == nil {
		t.Fatalf("Run should have errored on malformed hook JSON")
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed (never stuck researching)", d.Status)
	}
	if d.FailReason == "" {
		t.Errorf("expected a fail_reason on the failed draft")
	}
}

func TestRunFailsLoudWhenBlockBreaksMidRun(t *testing.T) {
	// The web gate checks blocks at draft START, but the pipeline runs async —
	// a concurrent sync can break a block mid-run. The stage must fail loud,
	// never assemble an email with a missing credential paragraph.
	fake := &fakeAnthropic{replies: []string{
		researchJSON,  // researcher
		hookJSONReply, // hook selector picks a hook
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	if err := db.MarkOutreachBlockBroken("P2_LOCKED", "upstream version changed"); err != nil {
		t.Fatal(err)
	}
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err == nil {
		t.Fatal("Run: want error when P2_LOCKED is broken mid-run")
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftFailed {
		t.Fatalf("status = %q, want failed", d.Status)
	}
	if !strings.Contains(d.FailReason, "P2_LOCKED") {
		t.Fatalf("fail_reason = %q", d.FailReason)
	}
	if d.Draft != "" {
		t.Fatalf("an email was assembled without P2: %q", d.Draft)
	}
}

// (g2) The HARD GUARDRAIL under a non-default structure: a structure with NO
// locked slot drops P2 from the email, but the honesty checker STILL runs over
// the whole assembled email. Honesty is never a casualty of a thinner/reordered
// structure.
func TestRunCustomStructureStillHonestyChecks(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,                 // researcher
		hookJSONReply,                // hook selector
		drafterReply(longP1, longP3), // drafter
		honestyPass,                  // honesty checker — MUST be consumed
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	// A structure of two model paragraphs only — no locked slot. P2_LOCKED is
	// therefore not hard-required and must not appear.
	if err := SaveConfig(db, Config{
		WordMin: 1, WordMax: 1000, SubjectFormat: DefaultSubjectFormat,
		Structure: []StructureSlot{{Kind: SlotModel, Source: "P1"}, {Kind: SlotModel, Source: "P3"}},
	}); err != nil {
		t.Fatalf("save config: %v", err)
	}
	id := seedPostingDraft(t, db)

	if err := eng.Run(context.Background(), id); err != nil {
		t.Fatalf("Run: %v", err)
	}
	d, _ := db.GetOutreachDraft(id)
	if d.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review (honesty must still gate)", d.Status)
	}
	if strings.Contains(d.Draft, p2Block) {
		t.Errorf("structure has no locked slot, yet P2 appeared:\n%s", d.Draft)
	}
	// The honesty checker ran: exactly 4 calls (research, hook, draft, honesty).
	if fake.calls != 4 {
		t.Errorf("anthropic calls = %d, want 4 — the honesty checker must run regardless of structure", fake.calls)
	}
}

// (h) A posting captured with a stored description never goes to the network
// for the JD — the stored text is used directly, so drafts keep working after
// the posting is taken down. The posting URL here is unreachable: a fallback
// fetch would log a fetch failure instead of the stored-JD status.
func TestRunUsesStoredDescription(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		researchJSON,                 // researcher
		hookJSONReply,                // hook selector
		drafterReply(longP1, longP3), // drafter
		honestyPass,                  // honesty checker
	}}
	eng, db := newEngine(t, fake)
	seedRequiredBlocks(t, db, p2Block)
	id := seedPostingDraft(t, db)

	// Re-capture the seeded posting with a description, as the ATS resolver
	// would have stored it.
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
	got, _ := db.GetOutreachDraft(id)
	if got.Status != store.DraftAwaitingReview {
		t.Fatalf("status = %q, want awaiting_review (fail_reason=%q)", got.Status, got.FailReason)
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
