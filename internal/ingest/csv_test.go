package ingest

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// A Crunchbase-style export header (the common column names per the brain-first
// plan's Phase C). This regression-tests that the documented headers map to
// scout's canonical fields. When the REAL export lands, confirm its header row
// matches these aliases (or extend columnAliases) — see csv.go.
const crunchbaseCSV = "\xef\xbb\xbf" + // UTF-8 BOM (real exports include it)
	`Organization Name,Industries,Headquarters Location,Number of Employees,Last Funding Type,Website,Organization Name URL
Acme AI,Artificial Intelligence,"San Francisco, California, United States",11-50,Series A,https://acme.ai/,https://www.crunchbase.com/organization/acme-ai
Globex,Fintech,"New York, New York, United States",1001-5000,Series C,www.globex.com,https://www.crunchbase.com/organization/globex
NoSite,Developer Tools,Remote,,Seed,,https://www.crunchbase.com/organization/nosite
`

func ingestString(t *testing.T, content string) *store.DB {
	t.Helper()
	dir := t.TempDir()
	csvPath := filepath.Join(dir, "in.csv")
	if err := os.WriteFile(csvPath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(filepath.Join(dir, "scout.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	c := &CSV{Source: "crunchbase", DB: db}
	res, err := c.Run(csvPath)
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}
	if res.Read != 3 || res.Upserted != 3 {
		t.Fatalf("read=%d upserted=%d, want 3/3 (errors=%v)", res.Read, res.Upserted, res.Errors)
	}
	return db
}

func TestCrunchbaseHeaderMapping(t *testing.T) {
	db := ingestString(t, crunchbaseCSV)

	// Acme: BOM-prefixed first header must still match "Organization Name";
	// headcount range "11-50" → upper bound 50; website → bare domain.
	acme := getDetailByName(t, db, "Acme AI")
	if acme.Vertical != "Artificial Intelligence" {
		t.Errorf("vertical = %q (Industries should map to vertical)", acme.Vertical)
	}
	if acme.Location != "San Francisco, California, United States" {
		t.Errorf("location = %q (Headquarters Location should map)", acme.Location)
	}
	if acme.Headcount != 50 {
		t.Errorf("headcount = %d, want 50 (range 11-50 → upper bound)", acme.Headcount)
	}
	if acme.FundingStage != "Series A" {
		t.Errorf("funding_stage = %q (Last Funding Type should map)", acme.FundingStage)
	}
	if acme.Domain != "acme.ai" {
		t.Errorf("domain = %q, want acme.ai (https:// + trailing slash stripped)", acme.Domain)
	}

	// Globex: "www." prefix stripped from Website.
	globex := getDetailByName(t, db, "Globex")
	if globex.Domain != "globex.com" {
		t.Errorf("domain = %q, want globex.com (www. stripped)", globex.Domain)
	}
	if globex.Headcount != 5000 {
		t.Errorf("headcount = %d, want 5000 (range 1001-5000 → upper bound)", globex.Headcount)
	}

	// NoSite: missing Website and Number of Employees must not break ingest;
	// they land empty/zero (Remote location passes the filter's remote_ok).
	nosite := getDetailByName(t, db, "NoSite")
	if nosite.Domain != "" {
		t.Errorf("domain = %q, want empty for missing Website", nosite.Domain)
	}
	if nosite.Headcount != 0 {
		t.Errorf("headcount = %d, want 0 for missing Number of Employees", nosite.Headcount)
	}
	if nosite.Location != "Remote" {
		t.Errorf("location = %q, want Remote", nosite.Location)
	}
}

// getDetailByName finds a company id by name via the triage rows, then loads
// its detail. Small helper so the test asserts on the public detail shape.
func getDetailByName(t *testing.T, db *store.DB, name string) *store.CompanyDetail {
	t.Helper()
	rows, err := db.TriageRows()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Name == name {
			d, err := db.GetCompanyDetail(r.CompanyID)
			if err != nil {
				t.Fatal(err)
			}
			if d == nil {
				t.Fatalf("no detail for %q", name)
			}
			return d
		}
	}
	t.Fatalf("company %q not ingested", name)
	return nil
}

// TestIngestReportsMergedCount checks that Result splits fresh inserts from
// dedup merges — both within a single file (same domain, different rows) and
// across a re-ingest of the same file.
func TestIngestReportsMergedCount(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "scout.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	// Two distinct companies; the third row repeats the first by domain (a
	// different Crunchbase URL but the same Website), so it should merge.
	const csv = `Organization Name,Website,Organization Name URL
Acme,https://acme.ai/,https://www.crunchbase.com/organization/acme
Globex,www.globex.com,https://www.crunchbase.com/organization/globex
Acme (Relisted),http://acme.ai,https://www.crunchbase.com/organization/acme-2
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if res.Read != 3 || res.Upserted != 3 || res.Merged != 1 {
		t.Fatalf("read=%d upserted=%d merged=%d, want 3/3/1 (errors=%v)", res.Read, res.Upserted, res.Merged, res.Errors)
	}
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (the two acme rows share a domain)", n)
	}

	// Re-ingesting the same file dedups every row onto what's already stored.
	res = runIngest(t, db, dir, "crunchbase", csv)
	if res.Merged != 3 {
		t.Fatalf("re-ingest merged=%d, want 3 (all rows already present)", res.Merged)
	}
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d after re-ingest, want 2 (no new rows)", n)
	}
}

// TestIngestAutoMergesDomainlessIntoDomain checks that a company first ingested
// WITHOUT a domain (keyed by name) collapses onto the same company when it later
// arrives WITH a domain (keyed by domain): one surviving row, and any children
// attached to the original name-keyed row ride along to the merged row.
func TestIngestAutoMergesDomainlessIntoDomain(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "scout.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	// First pass: "Acme" with no Website → keyed on name.
	res := runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,\n")
	if res.Read != 1 || res.Upserted != 1 || res.Merged != 0 {
		t.Fatalf("first pass read=%d upserted=%d merged=%d, want 1/1/0", res.Read, res.Upserted, res.Merged)
	}
	nameKey := store.CompanyID("", "Acme")
	// Attach a child to the name-keyed row; it must survive the merge.
	if err := db.UpsertEnrichment(store.Enrichment{CompanyID: nameKey, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed enrichment on name-keyed row: %v", err)
	}

	// Second pass: "Acme" WITH a Website → keyed on domain, folds in the old row.
	res = runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,https://acme.com/\n")
	if res.Read != 1 || res.Upserted != 1 || res.Merged != 1 {
		t.Fatalf("second pass read=%d upserted=%d merged=%d, want 1/1/1 (auto-merge)", res.Read, res.Upserted, res.Merged)
	}

	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (the name-keyed row merged into the domain-keyed row)", n)
	}
	domainKey := store.CompanyID("acme.com", "Acme")
	d, err := db.GetCompanyDetail(domainKey)
	if err != nil || d == nil {
		t.Fatalf("detail for domain-keyed row: %v (nil=%v)", err, d == nil)
	}
	if d.Domain != "acme.com" {
		t.Errorf("surviving row domain = %q, want acme.com", d.Domain)
	}
	if !d.HasEnrichment {
		t.Errorf("enrichment from the name-keyed row did not survive the merge")
	}
}

// runIngest writes content to a fresh temp CSV under dir and ingests it into db.
func runIngest(t *testing.T, db *store.DB, dir, source, content string) *Result {
	t.Helper()
	f, err := os.CreateTemp(dir, "in-*.csv")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	f.Close()
	res, err := (&CSV{Source: source, DB: db}).Run(f.Name())
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}
	return res
}
