package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func mkCompany(source, name, domain string) Company {
	c := Company{Source: source, Name: name, RawJSON: "{}"}
	if domain != "" {
		c.Domain = sql.NullString{String: domain, Valid: true}
	}
	return c
}

// The pkey is a deterministic UUID and the dedup key. The same domain from two
// different sources must collapse to one row (last writer wins), and the
// returned id must be stable and equal to CompanyID(domain, name).
func TestUpsertCompanyDedupCrossSource(t *testing.T) {
	db := openTestDB(t)

	id1, err := db.UpsertCompany(mkCompany("crunchbase", "Acme", "acme.com"))
	if err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	if want := CompanyID("acme.com", "Acme"); id1 != want {
		t.Fatalf("id = %q, want deterministic %q", id1, want)
	}

	// Same domain, different source and name → same row, overwritten.
	id2, err := db.UpsertCompany(mkCompany("manual", "Acme Inc", "acme.com"))
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	if id2 != id1 {
		t.Fatalf("cross-source dedup failed: id2 %q != id1 %q", id2, id1)
	}

	n, err := db.CountCompanies()
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("CountCompanies = %d, want 1 (same domain should dedup)", n)
	}

	d, err := db.GetCompanyDetail(id1)
	if err != nil || d == nil {
		t.Fatalf("detail: %v (nil=%v)", err, d == nil)
	}
	if d.Source != "manual" || d.Name != "Acme Inc" {
		t.Fatalf("last writer not applied: source=%q name=%q", d.Source, d.Name)
	}
}

// With no domain, identity falls back to the (lowercased) name. Same name in
// different casing dedups; genuinely different names stay separate.
func TestUpsertCompanyDomainlessNameFallback(t *testing.T) {
	db := openTestDB(t)

	a, _ := db.UpsertCompany(mkCompany("manual", "Globex", ""))
	b, _ := db.UpsertCompany(mkCompany("manual", "globex", "")) // case-only difference
	if a != b {
		t.Fatalf("domain-less name dedup failed: %q != %q", a, b)
	}
	c, _ := db.UpsertCompany(mkCompany("manual", "Initech", ""))
	if c == a {
		t.Fatalf("distinct names collided: Initech == Globex (%q)", c)
	}

	n, _ := db.CountCompanies()
	if n != 2 {
		t.Fatalf("CountCompanies = %d, want 2", n)
	}
}

// Child rows keyed on the company UUID cascade on delete.
func TestCompanyDeleteCascades(t *testing.T) {
	db := openTestDB(t)
	id, _ := db.UpsertCompany(mkCompany("crunchbase", "Acme", "acme.com"))

	if err := db.UpsertEnrichment(Enrichment{CompanyID: id, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed enrichment: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM companies WHERE id = ?`, id); err != nil {
		t.Fatalf("delete: %v", err)
	}
	var rows int
	if err := db.QueryRow(`SELECT COUNT(1) FROM enrichment WHERE company_id = ?`, id).Scan(&rows); err != nil {
		t.Fatalf("count enrichment: %v", err)
	}
	if rows != 0 {
		t.Fatalf("enrichment not cascaded: %d remain", rows)
	}
}
