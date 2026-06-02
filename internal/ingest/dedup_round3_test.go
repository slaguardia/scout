package ingest

import (
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// [3][6] AddManual folds into a pre-existing name-keyed twin (same company
// previously ingested without a website), instead of creating a duplicate — and
// the twin's children ride along.
func TestAddManualFoldsNameKeyedTwin(t *testing.T) {
	db, dir := freshDB(t)
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,\n")
	nameKey := store.CompanyID("", "Acme")
	if err := db.UpsertEnrichment(store.Enrichment{CompanyID: nameKey, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed enrichment: %v", err)
	}
	id, err := AddManual(db, ManualCompany{Website: "acme.com", Name: "Acme"})
	if err != nil {
		t.Fatalf("AddManual: %v", err)
	}
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (manual add must fold the name-keyed twin)", n)
	}
	if id != store.CompanyID("acme.com", "Acme") {
		t.Errorf("id=%q, want the domain-keyed id", id)
	}
	if d := getDetailByName(t, db, "Acme"); d.Domain != "acme.com" || !d.HasEnrichment {
		t.Errorf("fold lost data: domain=%q hasEnrichment=%v", d.Domain, d.HasEnrichment)
	}
}

// [5] An overwrite that renames a domain-keyed row to match an existing
// name-keyed twin folds the twin in, rather than stranding it as a permanent
// duplicate.
func TestDomainOverwriteFoldsRenamedTwin(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme Holdings,acme.com
Acme,
Acme,acme.com
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (rename-on-overwrite must fold the twin); res=%+v", n, res)
	}
	if d := getDetailByName(t, db, "Acme"); d == nil || d.Domain != "acme.com" {
		t.Errorf("surviving row wrong: %+v", d)
	}
}

// [7] The reverse fold backfills fields the stored row lacked from a richer
// domain-less arrival, instead of discarding them.
func TestReverseFoldBackfillsBlanks(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website,Number of Employees,Headquarters Location
Acme,acme.com,,
Acme,,11-50,Boston
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1; res=%+v", n, res)
	}
	d := getDetailByName(t, db, "Acme")
	if d.Headcount != 50 || d.Location != "Boston" {
		t.Errorf("backfill failed: headcount=%d location=%q, want 50/Boston", d.Headcount, d.Location)
	}
}

// [9] looksLikeDomain rejects hosts with illegal label characters (annotated
// cells, spaces) but accepts real domains and punycode.
func TestLooksLikeDomainLabelValidation(t *testing.T) {
	good := []string{"acme.com", "sub.acme.co.uk", "xn--mnchen-3ya.de", "a-b.io", "123.example.com"}
	bad := []string{"acme.com (verified)", "ac me.com", "com", "localhost", "-acme.com", "acme-.com", "a..b.com", "acme.c_m"}
	for _, h := range good {
		if !looksLikeDomain(h) {
			t.Errorf("looksLikeDomain(%q)=false, want true", h)
		}
	}
	for _, h := range bad {
		if looksLikeDomain(h) {
			t.Errorf("looksLikeDomain(%q)=true, want false", h)
		}
	}
	// And an annotated Website cell folds onto the real domain via name-keying,
	// not a bespoke key.
	db, dir := freshDB(t)
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,acme.com\nAcme,acme.com (verified)\n")
	if n, _ := db.CountCompanies(); n != 1 {
		t.Errorf("companies=%d, want 1 (annotated cell must not become a separate identity)", n)
	}
}

// [10] A single-column file whose value equals the header is NOT dropped as a
// repeated-header line — it's a legitimate company name.
func TestSingleColumnHeaderNameNotDropped(t *testing.T) {
	db, dir := freshDB(t)
	runIngest(t, db, dir, "crunchbase", "Organization Name\nOrganization Name\nAcme\n")
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (single-col header-named company kept)", n)
	}
}

// [11] Ragged over-wide rows keep their surplus cells in raw_json.
func TestSurplusCellsPreserved(t *testing.T) {
	db, dir := freshDB(t)
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,acme.com,extra1,extra2\n")
	raw := getDetailByName(t, db, "Acme").RawJSON
	if raw["__extra_2"] != "extra1" || raw["__extra_3"] != "extra2" {
		t.Errorf("surplus cells dropped from raw_json: %v", raw)
	}
}

// [16] rowAsMap disambiguation never overwrites a pre-existing literal "X (n)"
// header — every cell survives.
func TestRowAsMapCollisionProof(t *testing.T) {
	header := []string{"Website", "Website (2)", "Website"}
	row := []string{"primary.com", "literal2.com", "dup.com"}
	m := rowAsMap(header, row)
	vals := map[string]bool{}
	for _, v := range m {
		vals[v] = true
	}
	for _, want := range []string{"primary.com", "literal2.com", "dup.com"} {
		if !vals[want] {
			t.Errorf("rowAsMap dropped cell %q: %v", want, m)
		}
	}
	if len(m) != 3 {
		t.Errorf("rowAsMap kept %d cells, want 3: %v", len(m), m)
	}
}

// [12][13][15][17][18] Headcount: magnitude ranges take the UPPER bound,
// overflow → NULL, bare decimals don't fragment into the larger half.
func TestHeadcountRound3(t *testing.T) {
	cases := map[string]struct {
		valid bool
		want  int64
	}{
		"1k-5k":                {true, 5000},  // magnitude range → upper
		"10k-50k":              {true, 50000}, // magnitude range → upper
		"1.5k-3k":              {true, 3000},
		"1k to 5k":             {true, 5000},
		"500k-1m":              {true, 1000000},
		"2.5":                  {true, 2}, // bare decimal → truncated, not 5
		"v2.0":                 {true, 2},
		"10000000000b":         {false, 0}, // overflow → NULL
		"99999999999999999999": {false, 0},
	}
	for in, want := range cases {
		got := nullHeadcount(in)
		if got.Valid != want.valid || (want.valid && got.Int64 != want.want) {
			t.Errorf("nullHeadcount(%q) = (valid=%v,%d), want (valid=%v,%d)",
				in, got.Valid, got.Int64, want.valid, want.want)
		}
	}
}
