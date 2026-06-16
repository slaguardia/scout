package outreach

import (
	"context"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// A discovered logistics/profile bundle must reach BOTH the answer drafter's
// prompt (so it can answer a biographical question truthfully) and the honesty
// checker's ground truth (so a true location answer is not falsely flagged).
// This is the wiring that stops the engine confabulating a location.
func TestAnswerUsesLogisticsBundle(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		"I'm currently based in Brooklyn, NY.", // answerCall draft
		`{"verdict":"pass","violations":[]}`,   // honestyCheckText
	}}
	eng, db := newEngine(t, fake)

	for _, s := range []store.OutreachSource{
		{Need: "experience", PageID: "e1", Title: "Exp", Content: "Five years at Globex.", Version: "v1"},
		{Need: "logistics", PageID: "l1", Title: "Profile", Content: "Based in Brooklyn, NY. US citizen.", Version: "v1"},
	} {
		if err := db.UpsertOutreachSource(s); err != nil {
			t.Fatalf("seed %s: %v", s.Need, err)
		}
	}

	posting := &store.Posting{Title: "Engineer", Description: "Build things."}
	ac := eng.answerContext(context.Background(), posting, eng.knowledge("experience"))
	if !strings.Contains(ac.logistics, "Brooklyn") {
		t.Fatalf("logistics bundle not loaded into answerContext: %q", ac.logistics)
	}

	q := store.PostingAnswer{Prompt: "Where are you currently located?"}
	_, status, reason := eng.draftAnswer(context.Background(), ac, q)
	if status != store.AnswerReady {
		t.Fatalf("status = %s (reason: %s), want ready", status, reason)
	}

	if len(fake.reqs) != 2 {
		t.Fatalf("got %d anthropic calls, want 2", len(fake.reqs))
	}
	if !strings.Contains(fake.reqs[0], "Brooklyn") {
		t.Errorf("drafter prompt missing the logistics card:\n%s", fake.reqs[0])
	}
	if !strings.Contains(fake.reqs[1], "Brooklyn") || !strings.Contains(fake.reqs[1], "Applicant profile") {
		t.Errorf("honesty ground truth missing the logistics document:\n%s", fake.reqs[1])
	}
}

// With no logistics bundle discovered, the honesty checker receives only the
// experience document — no empty "Applicant profile" section is appended.
func TestAnswerHonestyOmitsEmptyLogistics(t *testing.T) {
	fake := &fakeAnthropic{replies: []string{
		"[current location]",                 // drafter leaves a placeholder
		`{"verdict":"pass","violations":[]}`, // honesty pass on a placeholder
	}}
	eng, db := newEngine(t, fake)
	if err := db.UpsertOutreachSource(store.OutreachSource{Need: "experience", PageID: "e1", Title: "Exp", Content: "Five years at Globex.", Version: "v1"}); err != nil {
		t.Fatalf("seed experience: %v", err)
	}

	posting := &store.Posting{Title: "Engineer", Description: "Build things."}
	ac := eng.answerContext(context.Background(), posting, eng.knowledge("experience"))
	if ac.logistics != "" {
		t.Fatalf("expected empty logistics, got %q", ac.logistics)
	}

	q := store.PostingAnswer{Prompt: "Where are you currently located?"}
	if _, status, reason := eng.draftAnswer(context.Background(), ac, q); status != store.AnswerReady {
		t.Fatalf("status = %s (reason: %s), want ready", status, reason)
	}
	if strings.Contains(fake.reqs[1], "Applicant profile") {
		t.Errorf("honesty doc should not append an empty profile section:\n%s", fake.reqs[1])
	}
}
