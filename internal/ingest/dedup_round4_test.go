package ingest

import (
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// An unterminated quote opening the LAST column swallows the rest of the file
// but PRESERVES the field count, so the field-count guard alone misses it. The
// quote-parity scan (odd " count) marks the file suspect so the blob row is
// still skipped with a surfaced error — the file is not silently truncated.
func TestLastColumnUnterminatedQuoteSkipped(t *testing.T) {
	db, dir := freshDB(t)
	csv := "Organization Name,Website\nAcme,\"acme.com\nGlobex,globex.com\nInitech,initech.com\n"
	res := runIngest(t, db, dir, "crunchbase", csv)
	if len(res.Errors) == 0 {
		t.Errorf("want a surfaced error for the last-column unterminated quote; res=%+v", res)
	}
	// The swallowed blob must not become a company.
	rows, _ := db.TriageRows()
	for _, r := range rows {
		if strings.ContainsAny(r.Name, "\n\r") || strings.Contains(r.Name, "Globex") {
			t.Errorf("swallowed blob ingested as company %q", r.Name)
		}
	}
}

// A correctly-quoted multi-line cell in a quote-BALANCED file is still ingested
// (the parity scan doesn't false-positive on balanced quotes).
func TestBalancedMultilineStillIngests(t *testing.T) {
	db, dir := freshDB(t)
	csv := "Organization Name,Website,Description\nAcme,acme.com,\"Line one.\nLine two.\"\n"
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (balanced multi-line cell must ingest); res=%+v", n, res)
	}
}

// REGRESSION: the unified fold targets a domain row that ALREADY has a 1:1 child
// (enrichment/verdict). foldChildren must drop the twin's duplicate child rather
// than hit the company_id primary key, rollback, and strand a permanent dup.
func TestFoldIntoEnrichedTargetNoPKConflict(t *testing.T) {
	db, dir := freshDB(t)
	// Domain row "Other,acme.com" with its own enrichment.
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nOther,acme.com\n")
	dk := store.CompanyID("acme.com", "Other")
	if err := db.UpsertEnrichment(store.Enrichment{CompanyID: dk, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed DK enrichment: %v", err)
	}
	// A name-keyed twin "Acme" with its own enrichment.
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,\n")
	nk := store.CompanyID("", "Acme")
	if err := db.UpsertEnrichment(store.Enrichment{CompanyID: nk, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed NK enrichment: %v", err)
	}
	// Now "Acme,acme.com" overwrites+renames the domain row to "Acme" and must
	// fold in the name twin — both carry enrichment, so the fold hits the 1:1 case.
	res := runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,acme.com\n")
	if len(res.Errors) != 0 {
		t.Fatalf("fold errored (PK conflict?): %v", res.Errors)
	}
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (twin must fold, not strand)", n)
	}
	d := getDetailByName(t, db, "Acme")
	if d == nil || !d.HasEnrichment || d.Domain != "acme.com" {
		t.Errorf("fold lost data: %+v", d)
	}
	// Re-ingesting the same row is idempotent (no resurrected duplicate).
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,acme.com\n")
	if n, _ := db.CountCompanies(); n != 1 {
		t.Errorf("re-ingest changed count to %d, want 1 (not idempotent)", n)
	}
}

// [6] A raw IPv4-literal website is not a company identity — distinct companies
// sharing a hosting IP must not collapse onto it.
func TestIPv4LiteralNotAnIdentity(t *testing.T) {
	if looksLikeDomain("203.0.113.7") {
		t.Errorf("looksLikeDomain(203.0.113.7)=true, want false (IPv4 literal)")
	}
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,http://203.0.113.7/
Globex,https://203.0.113.7:8080/path
`
	runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Errorf("companies=%d, want 2 (shared IP must not collapse distinct companies)", n)
	}
}

// [7] Headcount values that round to exactly float64(MaxInt64)=2^63 must be
// rejected as overflow, not wrap to a negative/huge int64.
func TestHeadcountOverflowBoundary(t *testing.T) {
	for _, in := range []string{"9223372036854775808", "9223372036854775807", "99999999999999999999"} {
		if got := nullHeadcount(in); got.Valid {
			t.Errorf("nullHeadcount(%q)=%d valid, want NULL (overflow)", in, got.Int64)
		}
	}
	// Just below the boundary still parses.
	if got := nullHeadcount("9000000000000000000"); !got.Valid || got.Int64 != 9000000000000000000 {
		t.Errorf("nullHeadcount(9e18)=(%v,%d), want valid 9e18", got.Valid, got.Int64)
	}
}

// A domain-less twin of an ambiguous name is absorbed by the existing domain
// rows (not added), so the set holds just the two domains.
func TestAmbiguousDomainlessAbsorbed(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,acme.io
Acme,acme.com
Acme,
Acme,acme.com
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (ambiguous domain-less twin absorbed); res=%+v", n, res)
	}
}

// [4] Re-ingesting the same file must be idempotent even when a domain-less twin
// sits between two same-name domain rows (the case that previously folded in
// pass 1 but spawned a spurious bare row in pass 2).
func TestReingestIdempotentWithAmbiguousName(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,acme.io
Acme,
Acme,acme.com
`
	r1 := runIngest(t, db, dir, "crunchbase", csv)
	n1, _ := db.CountCompanies()
	r2 := runIngest(t, db, dir, "crunchbase", csv)
	n2, _ := db.CountCompanies()
	if n1 != n2 {
		t.Fatalf("re-ingest not idempotent: %d -> %d (r1=%+v r2=%+v)", n1, n2, r1, r2)
	}
	if n1 != 2 {
		t.Errorf("companies=%d, want 2", n1)
	}
}
