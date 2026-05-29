package verdict

import (
	"reflect"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
)

func candidateFixture() store.VerdictCandidate {
	return store.VerdictCandidate{
		CompanyID: 1, Name: "Acme", Domain: "acme.com",
		Vertical: "dev tools", Location: "SF", Headcount: 80, Stage: "Series A",
		WebsiteSummary: "Acme builds developer tools.",
	}
}

func TestFactsAboveFloor(t *testing.T) {
	facts := []brainbot.Fact{
		{Fact: "Acme builds developer tools.", Score: 0.81},
		{Fact: "Acme is loosely related to SF.", Score: 0.39},      // just under
		{Fact: "The user dismissed Acme last cycle.", Score: 0.40}, // exactly at floor
		{Fact: "   ", Score: 0.95},                                 // blank, dropped
		{Fact: "Noise.", Score: 0.05},
	}
	got := factsAboveFloor(facts, brainScoreFloor)
	want := []string{
		"Acme builds developer tools.",
		"The user dismissed Acme last cycle.",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("factsAboveFloor = %#v, want %#v", got, want)
	}
}

func TestFactsAboveFloorEmpty(t *testing.T) {
	// A fresh company: all scores low → nothing injected.
	facts := []brainbot.Fact{{Fact: "weak", Score: 0.1}, {Fact: "weaker", Score: 0.0}}
	if got := factsAboveFloor(facts, brainScoreFloor); len(got) != 0 {
		t.Fatalf("expected no facts above floor, got %#v", got)
	}
}

func TestBuildUserPromptIncludesBrainFacts(t *testing.T) {
	p := buildUserPrompt(candidateFixture(), []string{"The user dismissed Acme last cycle."})
	if !strings.Contains(p, "What the brain already knows about this company:") {
		t.Fatal("prompt missing brain section header")
	}
	if !strings.Contains(p, "The user dismissed Acme last cycle.") {
		t.Fatal("prompt missing recalled fact")
	}
}

func TestBuildUserPromptNoBrainFacts(t *testing.T) {
	p := buildUserPrompt(candidateFixture(), nil)
	if strings.Contains(p, "What the brain already knows") {
		t.Fatal("prompt should omit brain section when no facts")
	}
}
