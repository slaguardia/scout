package store

import (
	"path/filepath"
	"testing"
)

// TestVerdictTraceRoundTrip verifies the verdict_trace migration applies and a
// company's decision trail inserts append-only and reads back oldest-first with
// the criteria provenance intact.
func TestVerdictTraceRoundTrip(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "trace.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	id, err := db.UpsertCompany(Company{Source: "test", Name: "Acme Corp", RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}

	v1 := VerdictTrace{
		CompanyID:      id,
		RunID:          "run-1",
		Model:          "claude-haiku-4-5",
		TasteVersion:   "v1",
		CriteriaSource: "brain:profile@http://127.0.0.1:8100 + playbook.md",
		Verdict:        "maybe",
		Reason:         "adjacent ML infra",
	}
	if err := db.InsertVerdictTrace(v1); err != nil {
		t.Fatalf("insert v1: %v", err)
	}
	// A later re-score (new criteria version) appends a second row rather than
	// overwriting — that's the whole point of the trail.
	v2 := v1
	v2.RunID = "run-2"
	v2.TasteVersion = "v2"
	v2.Verdict = "no"
	v2.Reason = "fintech-leaning (excluded)"
	if err := db.InsertVerdictTrace(v2); err != nil {
		t.Fatalf("insert v2: %v", err)
	}

	events, err := db.CompanyTrace(id)
	if err != nil {
		t.Fatalf("company trace: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("got %d events, want 2 (append-only, not upsert)", len(events))
	}
	if events[0].TasteVersion != "v1" || events[1].TasteVersion != "v2" {
		t.Fatalf("wrong order: %s then %s, want v1 then v2", events[0].TasteVersion, events[1].TasteVersion)
	}

	e0 := events[0]
	if e0.RunID != "run-1" || e0.Model != "claude-haiku-4-5" || e0.Verdict != "maybe" {
		t.Errorf("scalar fields wrong: %+v", e0)
	}
	if e0.CriteriaSource != v1.CriteriaSource || e0.Reason != "adjacent ML infra" {
		t.Errorf("provenance not round-tripped: %+v", e0)
	}

	// A company with no trail returns an empty (non-nil) slice.
	other, err := db.UpsertCompany(Company{Source: "test", Name: "Nobody", RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert other: %v", err)
	}
	empty, err := db.CompanyTrace(other)
	if err != nil {
		t.Fatalf("trace empty: %v", err)
	}
	if empty == nil || len(empty) != 0 {
		t.Errorf("want empty non-nil slice, got %#v", empty)
	}
}
