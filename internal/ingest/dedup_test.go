package ingest

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// freshDB opens a throwaway store for one test.
func freshDB(t *testing.T) (*store.DB, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "scout.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, dir
}

// Aggregator / social URLs in the Website column must NOT collapse distinct
// companies. Each is routed to name-keying (identityDomain returns ""), so the
// three rows survive as three rows instead of overwriting onto "linkedin.com".
func TestAggregatorURLsDoNotCollapse(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://www.linkedin.com/company/acme
Globex,https://www.linkedin.com/company/globex
Initech,https://linkedin.com/company/initech
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 3 {
		t.Fatalf("companies=%d, want 3 (aggregator hosts must not collapse distinct companies); res=%+v", n, res)
	}
	if res.Collisions != 0 {
		t.Errorf("collisions=%d, want 0 (name-keyed rows don't share a key)", res.Collisions)
	}
	// The original URL is still preserved verbatim in raw_json, just not used as identity.
	acme := getDetailByName(t, db, "Acme")
	if acme.Domain != "" {
		t.Errorf("Acme domain=%q, want empty (linkedin URL is not an identity domain)", acme.Domain)
	}
}

// Per-company subdomains of shared platforms (acme.myshopify.com, acme.github.io)
// are also non-identities → name-keyed and kept distinct.
func TestAggregatorSubdomainsRouteToName(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://acme.myshopify.com
Globex,https://globex.github.io/
`
	runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2", n)
	}
	for _, name := range []string{"Acme", "Globex"} {
		if d := getDetailByName(t, db, name); d.Domain != "" {
			t.Errorf("%s domain=%q, want empty (platform subdomain)", name, d.Domain)
		}
	}
}

// Reverse fold: a company seen first WITH a domain, then again WITHOUT one
// (same name), must collapse to ONE row — the domain-less arrival is recognized
// as a duplicate, not inserted as a second row.
func TestDomainThenDomainlessFolds(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://acme.com/
Acme,
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (domain-less twin must fold into the domain row); res=%+v", n, res)
	}
	if res.Merged != 1 {
		t.Errorf("merged=%d, want 1", res.Merged)
	}
	// The surviving row keeps its domain identity.
	if d := getDetailByName(t, db, "Acme"); d.Domain != "acme.com" {
		t.Errorf("surviving domain=%q, want acme.com", d.Domain)
	}
}

// When a domain-less arrival's name is already represented by one or more
// domain-keyed companies, it is absorbed (no redundant bare row) — even when
// ambiguous across several same-name domains. This keeps re-ingest idempotent;
// see TestReingestIdempotentWithAmbiguousName.
func TestDomainlessAbsorbedByExistingDomains(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://acme.com/
Acme,https://acme.io/
Acme,
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 2 {
		t.Fatalf("companies=%d, want 2 (domain-less twin absorbed, two domains remain); res=%+v", n, res)
	}
}

// Domain spellings that denote the SAME site must dedup onto one key: scheme,
// www., trailing path, query string, trailing FQDN dot, explicit port, and
// protocol-relative form.
func TestDomainNormalizationVariantsDedup(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://www.acme.com/careers
Acme,acme.com.
Acme,acme.com?utm=x
Acme,acme.com:443
Acme,//acme.com/jobs#top
Acme,HTTP://Acme.Com
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (all spellings are acme.com); res=%+v", n, res)
	}
}

// Two DIFFERENT names sharing one real domain key is a genuine cross-identity
// collision — the overwrite is flagged so a stress run can see it.
func TestSameDomainDifferentNameFlagsCollision(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,acme.com
Acme Holdings,acme.com
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("companies=%d, want 1 (shared domain key)", n)
	}
	if res.Merged != 1 || res.Collisions != 1 {
		t.Fatalf("merged=%d collisions=%d, want 1/1; res=%+v", res.Merged, res.Collisions, res)
	}
}

// A benign re-ingest (same name, same domain) is a merge but NOT a collision.
func TestReingestIsMergeNotCollision(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,acme.com
Acme,https://www.acme.com/
`
	res := runIngest(t, db, dir, "crunchbase", csv)
	if res.Merged != 1 {
		t.Fatalf("merged=%d, want 1", res.Merged)
	}
	if res.Collisions != 0 {
		t.Errorf("collisions=%d, want 0 (same name)", res.Collisions)
	}
}

// A dotless hostname ("acme", "localhost") is not a public identity → name-keyed.
func TestDotlessHostRoutesToName(t *testing.T) {
	db, dir := freshDB(t)
	runIngest(t, db, dir, "crunchbase", "Organization Name,Website\nAcme,acme\n")
	if d := getDetailByName(t, db, "Acme"); d.Domain != "" {
		t.Errorf("domain=%q, want empty for dotless host", d.Domain)
	}
}

// Headcount: open-ended Crunchbase buckets must yield a number, not NULL.
func TestHeadcountParsing(t *testing.T) {
	cases := map[string]struct {
		valid bool
		want  int64
	}{
		"11-50":       {true, 50},
		"1,001-5,000": {true, 5000},
		"10001+":      {true, 10001},
		"10,000+":     {true, 10000},
		"5000+":       {true, 5000},
		"500":         {true, 500},
		"  250  ":     {true, 250},
		"11–50":       {true, 50}, // en dash
		"Unknown":     {false, 0},
		"":            {false, 0},
	}
	for in, want := range cases {
		got := nullHeadcount(in)
		if got.Valid != want.valid || (want.valid && got.Int64 != want.want) {
			t.Errorf("nullHeadcount(%q) = (valid=%v,%d), want (valid=%v,%d)",
				in, got.Valid, got.Int64, want.valid, want.want)
		}
	}
}

// AddManual rejects social/profile links with a "website "-prefixed error
// (so the web layer maps it to 400), and never writes a row.
func TestAddManualRejectsAggregatorURL(t *testing.T) {
	db, _ := freshDB(t)
	for _, bad := range []string{
		"https://www.linkedin.com/company/acme",
		"https://x.com/acme",
		"acme.github.io",
	} {
		_, err := AddManual(db, ManualCompany{Website: bad, Name: "Acme"})
		if err == nil {
			t.Errorf("AddManual(%q): want rejection, got nil", bad)
			continue
		}
		if !strings.HasPrefix(err.Error(), "website ") {
			t.Errorf("AddManual(%q): error %q must be 'website '-prefixed for a 400", bad, err.Error())
		}
	}
	if n, _ := db.CountCompanies(); n != 0 {
		t.Fatalf("companies=%d, want 0 (rejected adds write nothing)", n)
	}
	// Sanity: AddManual still rejects the obvious aggregator via ErrCompanyExists path untouched.
	if _, err := AddManual(db, ManualCompany{Website: "acme.com", Name: "Acme"}); err != nil {
		t.Errorf("AddManual(acme.com): unexpected error %v", err)
	}
	if _, err := AddManual(db, ManualCompany{Website: "acme.com"}); !errors.Is(err, ErrCompanyExists) {
		t.Errorf("re-add acme.com: want ErrCompanyExists, got %v", err)
	}
}

// Re-ingesting an aggregator-heavy file is idempotent: counts are stable.
func TestAggregatorReingestStable(t *testing.T) {
	db, dir := freshDB(t)
	const csv = `Organization Name,Website
Acme,https://linkedin.com/company/acme
Globex,globex.com
`
	runIngest(t, db, dir, "crunchbase", csv)
	n1, _ := db.CountCompanies()
	res := runIngest(t, db, dir, "crunchbase", csv)
	n2, _ := db.CountCompanies()
	if n1 != n2 {
		t.Fatalf("re-ingest changed company count %d -> %d (not idempotent); res=%+v", n1, n2, res)
	}
}
