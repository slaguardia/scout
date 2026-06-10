package distill

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
)

// brainStub serves /recall with a fixed chunks payload, counting hits and
// asserting the per-question k made it onto the wire.
func brainStub(t *testing.T, hits *int32, wantK string, chunksJSON string) *brainbot.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/recall" {
			http.NotFound(w, r)
			return
		}
		atomic.AddInt32(hits, 1)
		if wantK != "" {
			if got := r.URL.Query().Get("k"); got != wantK {
				t.Errorf("k = %q, want %q", got, wantK)
			}
		}
		io.WriteString(w, chunksJSON)
	}))
	t.Cleanup(srv.Close)
	return brainbot.New(srv.URL)
}

// anthropicStub records every request body (the distiller makes two calls:
// classify, then synthesize) and returns a canned text reply for each.
func anthropicStub(t *testing.T, bodies *[]string, reply string) *anthropic.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*bodies = append(*bodies, string(b))
		fmt.Fprintf(w, `{"content":[{"type":"text","text":%q}]}`, reply)
	}))
	t.Cleanup(srv.Close)
	c := anthropic.New("test-key")
	c.Endpoint = srv.URL
	return c
}

func TestDistillFanOutClassifyThenSynthesize(t *testing.T) {
	var hits int32
	var bodies []string
	// Every question gets the same two chunks back — coarse retrieval in the
	// real world. Dedup must collapse them so the classify prompt carries each once.
	chunks := `{"chunks":[
		{"heading":"Target company","text":"Wants zero-to-one product companies.","score":0.5,"path":"Job Hunting/Target company"},
		{"heading":"Job Hunting","text":"Avoids fintech and crypto.","score":0.4,"path":"Job Hunting"}
	]}`
	d := &Distiller{
		Brain:  brainStub(t, &hits, "7", chunks),
		Client: anthropicStub(t, &bodies, "## Hard dealbreakers\n- Avoids fintech and crypto."),
		K:      7,
	}

	res, err := d.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	// Fan-out: one recall per company question.
	if int(atomic.LoadInt32(&hits)) != len(companyQuestions) {
		t.Fatalf("recall hits = %d, want %d (one per question)", hits, len(companyQuestions))
	}
	// Dedup: two unique chunks despite 4× the duplicates.
	if len(res.Chunks) != 2 {
		t.Fatalf("deduped chunks = %d, want 2", len(res.Chunks))
	}
	// Two LLM calls: classify then synthesize.
	if len(bodies) != 2 {
		t.Fatalf("anthropic calls = %d, want 2 (classify + synthesize)", len(bodies))
	}
	// The classify call (first) carries each unique chunk's text exactly once.
	classify := bodies[0]
	if n := strings.Count(classify, "Wants zero-to-one product companies."); n != 1 {
		t.Fatalf("chunk text appears %d times in the classify prompt, want 1 (dedup):\n%s", n, classify)
	}
	if !strings.Contains(classify, "Avoids fintech and crypto.") {
		t.Fatalf("second chunk missing from classify prompt:\n%s", classify)
	}
	// Both calls pin temperature to 0.
	for i, b := range bodies {
		if !strings.Contains(b, `"temperature":0`) {
			t.Fatalf("call %d should pin temperature to 0:\n%s", i, b)
		}
	}
	// The brief is the (second) LLM reply; Items is the classify output.
	if !strings.Contains(res.Brief, "Hard dealbreakers") {
		t.Fatalf("brief = %q", res.Brief)
	}
	if res.Items == "" {
		t.Fatal("Result.Items (classification) should be populated")
	}
	// The stable version basis is derived and non-empty.
	if res.Basis == "" {
		t.Fatal("Result.Basis should be populated")
	}
}

// TestGatherThenSynthesizeEqualsDistill proves the two-phase split is behavior-
// preserving: Gather → Synthesize yields the same brief AND the same basis as the
// one-shot Distill, and the split does not add a second recall fan-out.
func TestGatherThenSynthesizeEqualsDistill(t *testing.T) {
	chunks := `{"chunks":[
		{"heading":"Target company","text":"Wants zero-to-one product companies.","score":0.5,"path":"Job Hunting/Target company"},
		{"heading":"Job Hunting","text":"Avoids fintech and crypto.","score":0.4,"path":"Job Hunting"}
	]}`
	const reply = "## Hard dealbreakers\n- Avoids fintech and crypto."

	// Two-phase: Gather (recall only) then Synthesize (classify+synthesize).
	var gHits int32
	var gBodies []string
	dg := &Distiller{Brain: brainStub(t, &gHits, "", chunks), Client: anthropicStub(t, &gBodies, reply)}
	gathered, gatherBasis, err := dg.Gather(context.Background())
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	if len(gBodies) != 0 {
		t.Fatalf("Gather must not call the LLM; saw %d calls", len(gBodies))
	}
	gatherRecalls := atomic.LoadInt32(&gHits)
	if int(gatherRecalls) != len(companyQuestions) {
		t.Fatalf("Gather recalls = %d, want %d (one fan-out)", gatherRecalls, len(companyQuestions))
	}
	twoPhaseBrief, err := dg.Synthesize(context.Background(), gathered)
	if err != nil {
		t.Fatalf("Synthesize: %v", err)
	}
	// No SECOND recall fan-out: Synthesize must not re-hit /recall.
	if after := atomic.LoadInt32(&gHits); after != gatherRecalls {
		t.Fatalf("Synthesize re-ran recall (%d → %d); want zero extra fan-out", gatherRecalls, after)
	}

	// One-shot: Distill (gather+classify+synthesize in one call).
	var dHits int32
	var dBodies []string
	dd := &Distiller{Brain: brainStub(t, &dHits, "", chunks), Client: anthropicStub(t, &dBodies, reply)}
	oneShotBrief, oneShotBasis, err := dd.Distill(context.Background())
	if err != nil {
		t.Fatalf("Distill: %v", err)
	}

	if twoPhaseBrief != oneShotBrief {
		t.Fatalf("brief differs: two-phase %q vs one-shot %q", twoPhaseBrief, oneShotBrief)
	}
	if gatherBasis != oneShotBasis {
		t.Fatalf("basis differs: Gather %q vs Distill %q — the split changed the hash", gatherBasis, oneShotBasis)
	}
}

// basisOf is the version key — it must be independent of hybrid-search score and
// input order (both jitter run-to-run) but change when chunk content changes.
func TestBasisIgnoresScoreAndOrder(t *testing.T) {
	a := []brainbot.Chunk{
		{Path: "P/A", Heading: "A", Text: "alpha", Score: 0.9},
		{Path: "P/B", Heading: "B", Text: "beta", Score: 0.1},
	}
	reorderedDifferentScores := []brainbot.Chunk{
		{Path: "P/B", Heading: "B", Text: "beta", Score: 0.5},
		{Path: "P/A", Heading: "A", Text: "alpha", Score: 0.0},
	}
	if basisOf(a) != basisOf(reorderedDifferentScores) {
		t.Fatal("basis must be independent of score and input order")
	}
	changedText := []brainbot.Chunk{
		{Path: "P/A", Heading: "A", Text: "ALPHA CHANGED", Score: 0.9},
		{Path: "P/B", Heading: "B", Text: "beta", Score: 0.1},
	}
	if basisOf(a) == basisOf(changedText) {
		t.Fatal("basis must change when chunk text changes")
	}
}

func TestDistillEmptyBrainErrors(t *testing.T) {
	var hits int32
	var bodies []string
	d := &Distiller{
		Brain:  brainStub(t, &hits, "", `{"chunks":[]}`),
		Client: anthropicStub(t, &bodies, "should not be reached"),
	}
	if _, err := d.Run(context.Background()); err == nil {
		t.Fatal("want an error when the brain returns no chunks")
	}
	// Neither classify nor synthesize should run when there's nothing to distill.
	if len(bodies) != 0 {
		t.Fatalf("LLM was called with no chunks to distill: %v", bodies)
	}
}

// The company distiller is scoped to companies only — no role/title questions
// should creep in (that's a separate future concern).
func TestCompanyQuestionsExcludeRoles(t *testing.T) {
	for _, q := range companyQuestions {
		lower := strings.ToLower(q)
		for _, banned := range []string{"role", "title", "seniority"} {
			if strings.Contains(lower, banned) {
				t.Errorf("company question %q mentions %q — roles are out of scope", q, banned)
			}
		}
	}
}
