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

// anthropicStub captures the request body and returns a canned text reply.
func anthropicStub(t *testing.T, captured *string, reply string) *anthropic.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*captured = string(b)
		fmt.Fprintf(w, `{"content":[{"type":"text","text":%q}]}`, reply)
	}))
	t.Cleanup(srv.Close)
	c := anthropic.New("test-key")
	c.Endpoint = srv.URL
	return c
}

func TestDistillFanOutAndDedup(t *testing.T) {
	var hits int32
	var body string
	// Every question gets the same two chunks back — coarse retrieval in the
	// real world. Dedup must collapse them so the prompt carries each once.
	chunks := `{"chunks":[
		{"heading":"Target company","text":"Wants zero-to-one product companies.","score":0.5,"path":"Job Hunting/Target company"},
		{"heading":"Job Hunting","text":"Avoids fintech and crypto.","score":0.4,"path":"Job Hunting"}
	]}`
	d := &Distiller{
		Brain:  brainStub(t, &hits, "7", chunks),
		Client: anthropicStub(t, &body, "## Hard dealbreakers\n- Avoids fintech and crypto."),
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
	// The brief is the LLM's text verbatim.
	if !strings.Contains(res.Brief, "Hard dealbreakers") {
		t.Fatalf("brief = %q", res.Brief)
	}
	// The synthesis prompt carried each unique chunk's text exactly once.
	if n := strings.Count(body, "Wants zero-to-one product companies."); n != 1 {
		t.Fatalf("chunk text appears %d times in the prompt, want 1 (dedup):\n%s", n, body)
	}
	if !strings.Contains(body, "Avoids fintech and crypto.") {
		t.Fatalf("second chunk missing from prompt:\n%s", body)
	}
	// Temperature is pinned to 0 for a stable brief.
	if !strings.Contains(body, `"temperature":0`) {
		t.Fatalf("synthesis request should pin temperature to 0:\n%s", body)
	}
	// The stable version basis is derived and non-empty.
	if res.Basis == "" {
		t.Fatal("Result.Basis should be populated")
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
	var body string
	d := &Distiller{
		Brain:  brainStub(t, &hits, "", `{"chunks":[]}`),
		Client: anthropicStub(t, &body, "should not be reached"),
	}
	if _, err := d.Run(context.Background()); err == nil {
		t.Fatal("want an error when the brain returns no chunks")
	}
	// Synthesis must not run when there's nothing to distill.
	if body != "" {
		t.Fatalf("LLM was called with no chunks to distill: %s", body)
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
