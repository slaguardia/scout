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

// MergeCompany folds a domain-less (name-keyed) company into the domain-keyed
// company that arrives later for the same identity: children re-point and the
// old parent goes away, leaving exactly one row.
func TestMergeCompanyCollapsesNameKeyIntoDomainKey(t *testing.T) {
	db := openTestDB(t)

	// "Acme" first arrives with no domain (keyed on name) and picks up children.
	oldID, err := db.UpsertCompany(mkCompany("manual", "Acme", ""))
	if err != nil {
		t.Fatalf("seed name-keyed: %v", err)
	}
	if want := CompanyID("", "Acme"); oldID != want {
		t.Fatalf("name-keyed id = %q, want %q", oldID, want)
	}
	if err := db.UpsertEnrichment(Enrichment{CompanyID: oldID, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed enrichment: %v", err)
	}
	if _, err := db.AddPosting(oldID, "https://acme.com/jobs", "SE"); err != nil {
		t.Fatalf("seed posting: %v", err)
	}

	// "Acme" arrives again WITH a domain — the new domain-keyed parent.
	newID, err := db.UpsertCompany(mkCompany("crunchbase", "Acme", "acme.com"))
	if err != nil {
		t.Fatalf("seed domain-keyed: %v", err)
	}
	if newID == oldID {
		t.Fatalf("domain-keyed id collided with name-keyed id %q", newID)
	}

	if err := db.MergeCompany(oldID, newID); err != nil {
		t.Fatalf("merge: %v", err)
	}

	// Exactly one row survives — the domain-keyed one.
	if n, _ := db.CountCompanies(); n != 1 {
		t.Fatalf("CountCompanies = %d, want 1 after merge", n)
	}
	if exists, _ := db.CompanyExists(oldID); exists {
		t.Fatalf("old name-keyed parent %q still present", oldID)
	}

	// Children moved to the surviving row, not cascaded away.
	d, err := db.GetCompanyDetail(newID)
	if err != nil || d == nil {
		t.Fatalf("detail: %v (nil=%v)", err, d == nil)
	}
	if !d.HasEnrichment {
		t.Errorf("enrichment did not survive the merge")
	}
	if len(d.Postings) != 1 || d.Postings[0].URL != "https://acme.com/jobs" {
		t.Errorf("posting did not survive the merge: %+v", d.Postings)
	}
}

// DeleteCompany wipes the company and everything hanging off it — the company_id
// children it deletes explicitly (companyChildTables) and the posting-keyed
// grandchildren that cascade off job_postings — leaving the DB empty. An unknown
// id is sql.ErrNoRows so the API can 404 rather than silently no-op.
func TestDeleteCompanyRemovesEverything(t *testing.T) {
	db := openTestDB(t)
	id, err := db.UpsertCompany(mkCompany("crunchbase", "Acme", "acme.com"))
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}

	// One row in each company_id child table…
	if err := db.UpsertEnrichment(Enrichment{CompanyID: id, FetchStatus: "ok"}); err != nil {
		t.Fatalf("seed enrichment: %v", err)
	}
	if err := db.UpsertVerdict(Verdict{CompanyID: id, Verdict: "yes", Reason: "fits", Model: "manual"}); err != nil {
		t.Fatalf("seed verdict: %v", err)
	}
	if err := db.InsertVerdictTrace(VerdictTrace{CompanyID: id, Model: "haiku", Verdict: "yes"}); err != nil {
		t.Fatalf("seed trace: %v", err)
	}
	if err := db.InsertVerdictOverride(VerdictOverride{CompanyID: id, ToVerdict: "yes"}); err != nil {
		t.Fatalf("seed override: %v", err)
	}
	p, err := db.AddPosting(id, "https://acme.com/jobs", "SE")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}
	// …and a posting-keyed grandchild that must cascade off job_postings.
	if _, err := db.CreateOutreachDraft(p.ID); err != nil {
		t.Fatalf("seed draft: %v", err)
	}

	if err := db.DeleteCompany(id); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if n, _ := db.CountCompanies(); n != 0 {
		t.Fatalf("CountCompanies = %d, want 0 after delete", n)
	}
	if exists, _ := db.CompanyExists(id); exists {
		t.Fatalf("company %q still present after delete", id)
	}
	// Every company_id child table is empty…
	for _, table := range companyChildTables {
		var n int
		if err := db.QueryRow(`SELECT COUNT(1) FROM ` + table).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if n != 0 {
			t.Errorf("%s still has %d rows after delete", table, n)
		}
	}
	// …and the posting-keyed grandchild cascaded away with its posting.
	var drafts int
	if err := db.QueryRow(`SELECT COUNT(1) FROM outreach_drafts`).Scan(&drafts); err != nil {
		t.Fatalf("count outreach_drafts: %v", err)
	}
	if drafts != 0 {
		t.Errorf("outreach_drafts not cascaded: %d remain", drafts)
	}

	// Unknown id → sql.ErrNoRows (the handler maps it to 404).
	if err := db.DeleteCompany("does-not-exist"); err != sql.ErrNoRows {
		t.Errorf("delete unknown: want sql.ErrNoRows, got %v", err)
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

// TestUpdateCompanyNotes covers the human-only notes column: set, clear, the
// unknown-id error, and — the whole point — that a re-ingest never clobbers it.
func TestUpdateCompanyNotes(t *testing.T) {
	db := openTestDB(t)
	id, err := db.UpsertCompany(mkCompany("crunchbase", "Acme", "acme.com"))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := db.UpdateCompanyNotes(id, "talked to a founder; warm intro pending"); err != nil {
		t.Fatalf("set notes: %v", err)
	}
	d, _ := db.GetCompanyDetail(id)
	if d == nil || d.Notes != "talked to a founder; warm intro pending" {
		t.Fatalf("notes not stored: %+v", d)
	}

	// A re-ingest (same identity, fresh data) must leave the notes untouched —
	// UpsertCompany doesn't list the column, so the user's note survives.
	if _, err := db.UpsertCompany(mkCompany("manual", "Acme Inc", "acme.com")); err != nil {
		t.Fatalf("re-ingest: %v", err)
	}
	d, _ = db.GetCompanyDetail(id)
	if d.Notes != "talked to a founder; warm intro pending" {
		t.Errorf("re-ingest clobbered notes: %q", d.Notes)
	}

	// Blank clears.
	if err := db.UpdateCompanyNotes(id, ""); err != nil {
		t.Fatalf("clear notes: %v", err)
	}
	d, _ = db.GetCompanyDetail(id)
	if d.Notes != "" {
		t.Errorf("notes not cleared: %q", d.Notes)
	}

	if err := db.UpdateCompanyNotes("nope", "x"); err != sql.ErrNoRows {
		t.Errorf("unknown id: want sql.ErrNoRows, got %v", err)
	}
}

// TestUpdateCompanyEditable covers the web edit path: a full replace of the
// editable fields (blanks clear), name_key tracking the new name, and
// sql.ErrNoRows for an unknown id.
func TestUpdateCompanyEditable(t *testing.T) {
	db := openTestDB(t)
	id, err := db.UpsertCompany(mkCompany("manual", "acme.com", "acme.com"))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	err = db.UpdateCompanyEditable(id, EditableCompany{
		Name:         "Acme Robotics",
		Headcount:    sql.NullInt64{Int64: 50, Valid: true},
		FundingStage: sql.NullString{String: "Series A", Valid: true},
		Location:     sql.NullString{String: "Austin, TX", Valid: true},
		Vertical:     sql.NullString{String: "Robotics", Valid: true},
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	d, err := db.GetCompanyDetail(id)
	if err != nil || d == nil {
		t.Fatalf("detail: %v", err)
	}
	if d.Name != "Acme Robotics" || d.Headcount != 50 || d.FundingStage != "Series A" {
		t.Errorf("fields wrong after edit: %+v", d)
	}

	// name_key must track the edit so the dedup fold still matches.
	var key string
	if err := db.QueryRow(`SELECT name_key FROM companies WHERE id = ?`, id).Scan(&key); err != nil {
		t.Fatalf("name_key: %v", err)
	}
	if key != "acme robotics" {
		t.Errorf("name_key = %q, want %q", key, "acme robotics")
	}

	// Blanks clear (full replace).
	if err := db.UpdateCompanyEditable(id, EditableCompany{Name: "Acme Robotics"}); err != nil {
		t.Fatalf("clear: %v", err)
	}
	d, _ = db.GetCompanyDetail(id)
	if d.Headcount != 0 || d.FundingStage != "" || d.Location != "" || d.Vertical != "" {
		t.Errorf("blanks should clear: %+v", d)
	}

	if err := db.UpdateCompanyEditable("nope", EditableCompany{Name: "x"}); err != sql.ErrNoRows {
		t.Errorf("unknown id: want sql.ErrNoRows, got %v", err)
	}
}

// TestSetCompanyDomain covers the web "add a website" path: a domain-less,
// name-keyed company gets a domain, which re-keys it onto the domain identity
// and carries its children along.
func TestSetCompanyDomain(t *testing.T) {
	db := openTestDB(t)

	// A domain-less company with a posting child.
	oldID, err := db.UpsertCompany(mkCompany("manual", "Acme", ""))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if want := CompanyID("", "Acme"); oldID != want {
		t.Fatalf("name-keyed id = %q, want %q", oldID, want)
	}
	if _, err := db.AddPosting(oldID, "https://acme.com/jobs", "SE"); err != nil {
		t.Fatalf("seed posting: %v", err)
	}

	newID, err := db.SetCompanyDomain(oldID, "acme.com")
	if err != nil {
		t.Fatalf("set domain: %v", err)
	}
	if want := CompanyID("acme.com", "Acme"); newID != want {
		t.Fatalf("re-keyed id = %q, want domain key %q", newID, want)
	}
	if exists, _ := db.CompanyExists(oldID); exists {
		t.Errorf("old name-keyed row %q survived the re-key", oldID)
	}
	if n, _ := db.CountCompanies(); n != 1 {
		t.Errorf("CountCompanies = %d, want 1", n)
	}
	d, err := db.GetCompanyDetail(newID)
	if err != nil || d == nil {
		t.Fatalf("detail: %v (nil=%v)", err, d == nil)
	}
	if d.Domain != "acme.com" {
		t.Errorf("domain = %q, want acme.com", d.Domain)
	}
	if len(d.Postings) != 1 || d.Postings[0].URL != "https://acme.com/jobs" {
		t.Errorf("posting did not follow the re-key: %+v", d.Postings)
	}

	if _, err := db.SetCompanyDomain("nope", "x.com"); err != sql.ErrNoRows {
		t.Errorf("unknown id: want sql.ErrNoRows, got %v", err)
	}
}

// TestSetCompanyDomainFoldsTwin: when a domain-keyed company of the same name
// already exists, setting the domain on a name-keyed twin folds it in (the
// reverse fold) rather than forking a row; a different name is refused.
func TestSetCompanyDomainFoldsTwin(t *testing.T) {
	db := openTestDB(t)

	// Domain-keyed "Acme" already present.
	domainID, _ := db.UpsertCompany(mkCompany("crunchbase", "Acme", "acme.com"))
	// A separate name-keyed "Acme" with a posting.
	nameID, _ := db.UpsertCompany(mkCompany("manual", "Acme", ""))
	if nameID == domainID {
		t.Fatalf("seed ids collided")
	}
	if _, err := db.AddPosting(nameID, "https://acme.com/careers", "PM"); err != nil {
		t.Fatalf("seed posting: %v", err)
	}

	got, err := db.SetCompanyDomain(nameID, "acme.com")
	if err != nil {
		t.Fatalf("set domain (fold): %v", err)
	}
	if got != domainID {
		t.Fatalf("fold target = %q, want existing domain row %q", got, domainID)
	}
	if exists, _ := db.CompanyExists(nameID); exists {
		t.Errorf("name-keyed twin %q survived the fold", nameID)
	}
	if n, _ := db.CountCompanies(); n != 1 {
		t.Errorf("CountCompanies = %d, want 1 after fold", n)
	}
	d, _ := db.GetCompanyDetail(domainID)
	if d == nil || len(d.Postings) != 1 {
		t.Errorf("posting did not fold into the domain row: %+v", d)
	}

	// A DIFFERENT company can't steal an owned domain.
	otherID, _ := db.UpsertCompany(mkCompany("manual", "Globex", ""))
	if _, err := db.SetCompanyDomain(otherID, "acme.com"); err != ErrDomainTaken {
		t.Errorf("cross-identity claim: want ErrDomainTaken, got %v", err)
	}
}

// TestFillCompanyNamePlaceholder pins the enrichment name-fill: only the
// bare-domain placeholder (or empty) is replaced — a real name never is.
func TestFillCompanyNamePlaceholder(t *testing.T) {
	db := openTestDB(t)
	id, err := db.UpsertCompany(mkCompany("manual", "acme.com", "acme.com"))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	ok, err := db.FillCompanyNamePlaceholder(id, "Acme Robotics")
	if err != nil || !ok {
		t.Fatalf("fill placeholder: ok=%v err=%v", ok, err)
	}
	d, _ := db.GetCompanyDetail(id)
	if d.Name != "Acme Robotics" {
		t.Errorf("name = %q, want filled", d.Name)
	}

	// A real name is sticky.
	ok, err = db.FillCompanyNamePlaceholder(id, "Acme Inc")
	if err != nil || ok {
		t.Fatalf("real name must not be overwritten: ok=%v err=%v", ok, err)
	}
	d, _ = db.GetCompanyDetail(id)
	if d.Name != "Acme Robotics" {
		t.Errorf("name changed to %q, want sticky", d.Name)
	}

	// Empty extracted name is a no-op.
	if ok, err := db.FillCompanyNamePlaceholder(id, "  "); err != nil || ok {
		t.Errorf("blank fill: ok=%v err=%v, want no-op", ok, err)
	}
}

// VerticalTags flattens composite "A, B, C" cells into individual tags:
// trimmed, deduped case-insensitively (first spelling wins), sorted, with
// NULL/empty cells skipped. This feeds both the facets picker and the
// extraction prompts' vocabulary steering.
func TestVerticalTagsSplitsAndDedupes(t *testing.T) {
	db := openTestDB(t)

	add := func(name, domain, vertical string) {
		c := mkCompany("crunchbase", name, domain)
		if vertical != "" {
			c.Vertical = sql.NullString{String: vertical, Valid: true}
		}
		if _, err := db.UpsertCompany(c); err != nil {
			t.Fatalf("upsert %s: %v", name, err)
		}
	}
	add("Acme", "acme.com", "AI, Cloud Computing")
	add("Bolt", "bolt.com", "SaaS, ai") // "ai" dupes "AI" case-insensitively
	add("Cog", "cog.com", "  Robotics , AI ")
	add("Dud", "dud.com", "") // NULL vertical — skipped

	got, err := db.VerticalTags()
	if err != nil {
		t.Fatalf("VerticalTags: %v", err)
	}
	want := []string{"AI", "Cloud Computing", "Robotics", "SaaS"}
	if len(got) != len(want) {
		t.Fatalf("tags = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("tags = %v, want %v", got, want)
		}
	}
}
