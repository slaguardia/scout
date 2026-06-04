package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

// TestEnrichmentTargetsOnlyBlanks pins the only-blanks semantics: a company
// whose cache is merely stale (re-ingested since last fetch) is a target on a
// normal run but NOT on a blanks-only run; force always wins.
func TestEnrichmentTargetsOnlyBlanks(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	idA, err := db.UpsertCompany(Company{Source: "test", Name: "A", Domain: sql.NullString{String: "a.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("seed A: %v", err)
	}
	if _, err := db.UpsertCompany(Company{Source: "test", Name: "B", Domain: sql.NullString{String: "b.com", Valid: true}, RawJSON: "{}"}); err != nil {
		t.Fatalf("seed B: %v", err)
	}
	// A is enriched, then "re-ingested" later — its cache is stale.
	if err := db.UpsertEnrichment(Enrichment{CompanyID: idA, FetchStatus: "ok"}); err != nil {
		t.Fatalf("enrich A: %v", err)
	}
	if _, err := db.Exec(`UPDATE companies SET ingested_at = datetime('now', '+1 hour') WHERE id = ?`, idA); err != nil {
		t.Fatalf("bump A: %v", err)
	}

	names := func(force, onlyBlanks bool) map[string]bool {
		t.Helper()
		ts, err := db.EnrichmentTargets(force, onlyBlanks)
		if err != nil {
			t.Fatalf("targets(%v,%v): %v", force, onlyBlanks, err)
		}
		out := map[string]bool{}
		for _, x := range ts {
			out[x.Name] = true
		}
		return out
	}

	if got := names(false, false); !got["A"] || !got["B"] {
		t.Errorf("normal run should target stale A and blank B, got %v", got)
	}
	if got := names(false, true); got["A"] || !got["B"] {
		t.Errorf("blanks-only run should target only blank B, got %v", got)
	}
	if got := names(true, true); !got["A"] || !got["B"] {
		t.Errorf("force should win over only-blanks, got %v", got)
	}
}
