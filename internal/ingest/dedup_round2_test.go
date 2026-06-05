package ingest

import (
	"os"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// [1][12] Bare-TLD / pure-punctuation Website cells (".com", ".io", "..") are not
// identities — each company is name-keyed and survives instead of collapsing.
func TestBareTLDAndJunkRouteToName(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Foo,.com
Baz,.com
Qux,.io
Quux,..
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 4 {
		t.Fatalf("companies=%d, want 4 (junk Website cells must not share an identity); res=%+v", n, res)
	}
}

// [11] Leading dots are stripped so ".acme.com" / "...acme.com" dedup with "acme.com".
func TestLeadingDotsDedup(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,acme.com
Acme,.acme.com
Acme,...acme.com
`
	if res := runIngest(t, db, dir, "crunchbase", csv); func() bool { n, _ := db.CountCompanies(); return n != 1 }() {
		n, _ := db.CountCompanies()
		t.Fatalf("companies=%d, want 1 (leading-dot variants are the same site); res=%+v", n, res)
	}
}

// [2][4] Reverse fold works for non-ASCII names: SQLite lower() is ASCII-only, so
// the lookup must use the Go-folded name_key. "CAFÉ" with a site then without one
// must collapse to one row.
func TestReverseFoldNonASCIIName(t *testing.T) {
	db, dir := freshDB(t)
	const csv = "Organization Name,Website\nCAFÉ,https://cafe.com/\nCAFÉ,\n"
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (non-ASCII reverse fold); res=%+v", n, res)
	}
	if res.Merged != 1 {
		t.Errorf("merged=%d, want 1", res.Merged)
	}
}

// [6] Case-variant non-ASCII names that Go folds the same ("CAFÉ" vs "Café") are
// matched via name_key, so a domain-less "Café" sees BOTH domain rows and is
// absorbed (not added as a third row) — and crucially the count uses Go folding,
// not SQLite's ASCII-only lower() which would have matched only one.
func TestReverseFoldCaseVariantAbsorbed(t *testing.T) {
	db, dir := freshDB(t)
	const csv = "Organization Name,Website\nCAFÉ,https://cafe1.com/\nCafé,https://cafe2.com/\nCafé,\n"
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (domain-less case-variant twin absorbed); res=%+v", n, res)
	}
}

// [5] Share/short-link hosts (youtu.be, lnkd.in, fb.me, t.me) are aggregators too.
func TestShareHostsRouteToName(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://youtu.be/aaa
Globex,https://youtu.be/bbb
Initech,https://lnkd.in/xyz
`
	runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 3 {
		t.Fatalf("companies=%d, want 3 (share hosts are not identities)", n)
	}
}

// [16] Userinfo in the URL must not leave "www." on the host: user@www.acme.com
// dedups with www.acme.com.
func TestUserinfoNormalizesToBareHost(t *testing.T) {
	if got := normalizeDomain("http://user@www.acme.com"); got != "acme.com" {
		t.Errorf("normalizeDomain(userinfo) = %q, want acme.com", got)
	}
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,http://www.acme.com
Acme,http://user@www.acme.com
`
	if res := runIngest(t, db, dir, "crunchbase", csv); func() bool { n, _ := db.CountCompanies(); return n != 1 }() {
		n, _ := db.CountCompanies()
		t.Fatalf("companies=%d, want 1; res=%+v", n, res)
	}
}

// [3] A REAL unterminated quote (parser swallows the rest of the file into one
// field → wrong field count + embedded newline) is skipped with a surfaced
// error, not ingested as a giant blob company.
func TestUnterminatedQuoteSkippedWithError(t *testing.T) {
	db, dir := freshDB(t)
	csv := "Organization Name,Website\n\"Acme,acme.com\nGlobex,globex.com\n"
	res := runIngest(t, db, dir, "crunchbase", csv)
	if len(res.Errors) == 0 {
		t.Errorf("want an error surfaced for the unterminated-quote blob, got none; res=%+v", res)
	}
	// The swallowed blob must not become a company.
	rows, _ := db.TriageRows()
	for _, r := range rows {
		if strings.Contains(r.Name, "\n") || strings.Contains(r.Name, "Globex") {
			t.Errorf("unterminated-quote blob was ingested as company %q", r.Name)
		}
	}
}

// [1][2][8] A correctly-quoted multi-line cell (a real Crunchbase "Description"
// spans lines) keeps the right field count and MUST be ingested — the company is
// not dropped, and the newline is preserved in raw_json.
func TestLegitMultilineCellIngested(t *testing.T) {
	db, dir := freshDB(t)
	csv := "Organization Name,Website,Description\nAcme,acme.com,\"We build widgets.\nFounded 2019.\"\nGlobex,globex.com,one-liner\n"
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (a multi-line description must not drop the company); res=%+v", n, res)
	}
	d := getDetailByName(t, db, "Acme")
	if d.Domain != "acme.com" {
		t.Errorf("domain=%q, want acme.com", d.Domain)
	}
	if !strings.Contains(d.RawJSON["Description"], "Founded 2019") {
		t.Errorf("multi-line description not preserved in raw_json: %q", d.RawJSON["Description"])
	}
}

// [7] A header with no recognizable name column is a hard error, not a silent
// no-op that reports success.
func TestMissingNameColumnErrors(t *testing.T) {
	db, dir := freshDB(t)
	_, err := (&CSV{Source: "crunchbase", DB: db}).Run(writeTemp(t, dir, "Org,Website\nAcme,acme.com\n"))
	if err == nil {
		t.Fatal("want an error for a header with no name column, got nil")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q should mention the missing name column", err.Error())
	}
}

// [8] A duplicated header column maps identity to the FIRST occurrence (the real
// site), not the last (a tracking/redirect URL).
func TestDuplicateHeaderFirstWins(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website,Website
Acme,acme.com,bit.ly/acme-track
`
	runIngest(t, db, dir, "crunchbase", csv)
	if d := getDetailByName(t, db, "Acme"); d.Domain != "acme.com" {
		t.Errorf("domain=%q, want acme.com (first Website column wins, not the tracking URL)", d.Domain)
	}
}

// [13] A repeated header line mid-file is skipped, not ingested as a company.
func TestRepeatedHeaderRowSkipped(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,acme.com
Organization Name,Website
Globex,globex.com
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (repeated header must be skipped); res=%+v", n, res)
	}
	rows, _ := db.TriageRows()
	for _, r := range rows {
		if r.Name == "Organization Name" {
			t.Errorf("repeated header row was ingested as a company")
		}
	}
}

// [15] Duplicate header names preserve BOTH cells in raw_json (disambiguated).
func TestDuplicateHeaderRawJSONPreservesAll(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Note,Note,Website
Acme,first,second,acme.com
`
	runIngest(t, db, dir, "crunchbase", csv)
	raw := getDetailByName(t, db, "Acme").RawJSON // already an unmarshaled map
	if raw["Note"] != "first" || raw["Note (2)"] != "second" {
		t.Errorf("raw_json dropped a duplicate-header cell: %v", raw)
	}
}

// [9][10][14] Headcount parsing: dashless ranges, magnitude suffixes, reversed
// ranges, and stray separators all yield the right number instead of a silently
// concatenated wrong one.
func TestHeadcountRound2(t *testing.T) {
	cases := map[string]struct {
		valid bool
		want  int64
	}{
		"11 to 50":             {true, 50},   // [9] dashless range
		"100 to 200 employees": {true, 200},  // [9]
		"1.5k":                 {true, 1500}, // [10] magnitude
		"2.5M":                 {true, 2500000},
		"$1.2M":                {true, 1200000},
		"500k":                 {true, 500000},
		"50-10":                {true, 50}, // [14] reversed range → larger
		"-50":                  {true, 50}, // [14] leading dash
		"5000+":                {true, 5000},
		"10001+":               {true, 10001},
	}
	for in, want := range cases {
		got := nullHeadcount(in)
		if got.Valid != want.valid || (want.valid && got.Int64 != want.want) {
			t.Errorf("nullHeadcount(%q) = (valid=%v,%d), want (valid=%v,%d)",
				in, got.Valid, got.Int64, want.valid, want.want)
		}
	}
}

// [17] The forward fold (atomic upsert+merge) still collapses a name-keyed twin
// into the later domain row and carries its children along.
func TestForwardFoldStillWorksAndCarriesChildren(t *testing.T) {
	db, dir := freshDB(t)
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,\n")
	nameKey := store.CompanyID("", "Acme")
	if err := db.UpsertEnrichment(store.Enrichment{CompanyID: nameKey, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed enrichment: %v", err)
	}
	res := runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,https://acme.com/\n")
	if res.Merged != 1 {
		t.Fatalf("merged=%d, want 1 (forward fold); res=%+v", res.Merged, res)
	}
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1", n)
	}
	d := getDetailByName(t, db, "Acme")
	if d.Domain != "acme.com" || !d.HasEnrichment {
		t.Errorf("forward fold lost data: domain=%q hasEnrichment=%v", d.Domain, d.HasEnrichment)
	}
}

// writeTemp writes content to a temp CSV under dir and returns its path.
func writeTemp(t *testing.T, dir, content string) string {
	t.Helper()
	f, err := os.CreateTemp(dir, "in-*.csv")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return f.Name()
}
