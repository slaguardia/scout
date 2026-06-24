package store

import "testing"

// migrate() wraps each migration body in a transaction so a multi-statement
// migration (ADD COLUMN + backfill + DROP COLUMN) is atomic: a failure partway
// rolls back the earlier DDL instead of leaving the schema half-migrated (which
// would wedge startup on the re-run). This guards the property the fix relies on
// — that modernc/sqlite honors DDL rollback inside a transaction.
func TestMigrationBodyIsAtomic(t *testing.T) {
	db := openTestDB(t)

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if _, err := tx.Exec(`ALTER TABLE job_postings ADD COLUMN atomicity_probe TEXT`); err != nil {
		t.Fatalf("add column: %v", err)
	}
	// A later statement in the same body fails (duplicate column).
	if _, err := tx.Exec(`ALTER TABLE job_postings ADD COLUMN atomicity_probe TEXT`); err == nil {
		t.Fatal("expected a duplicate-column error on the second ADD")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// The probe column must have rolled back, so re-adding it now succeeds. If DDL
	// did NOT roll back, this would fail with "duplicate column name" — exactly the
	// startup-wedge the transactional runner prevents.
	if _, err := db.Exec(`ALTER TABLE job_postings ADD COLUMN atomicity_probe TEXT`); err != nil {
		t.Fatalf("probe column was not rolled back (re-add failed): %v", err)
	}
}

// TestApplicationStatusBackfillSQL exercises the exact backfill from migration
// 0051 against a replica of the pre-migration shape (the M50 stage_history JSON
// array): the current stage = the last entry, and garbage/empty histories
// collapse to the ” default.
func TestApplicationStatusBackfillSQL(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.Exec(`CREATE TABLE tt (id TEXT, stage_history TEXT, application_status TEXT NOT NULL DEFAULT '')`); err != nil {
		t.Fatalf("create: %v", err)
	}
	rows := []struct{ id, hist string }{
		{"a", `[{"stage":"applied","date":"2026-05-22"}]`},
		{"b", `[{"stage":"applied","date":"2026-05-22"},{"stage":"offer","date":"2026-06-10"}]`},
		{"c", `[]`},
		{"d", `not json`},
		{"e", ``},
	}
	for _, r := range rows {
		if _, err := db.Exec(`INSERT INTO tt (id, stage_history) VALUES (?, ?)`, r.id, NullString(r.hist)); err != nil {
			t.Fatalf("insert %s: %v", r.id, err)
		}
	}
	if _, err := db.Exec(`
UPDATE tt
SET application_status = COALESCE(
    json_extract(stage_history, '$[' || (json_array_length(stage_history) - 1) || '].stage'),
    '')
WHERE stage_history IS NOT NULL AND stage_history <> ''
  AND json_valid(stage_history) AND json_array_length(stage_history) > 0`); err != nil {
		t.Fatalf("backfill: %v", err)
	}
	get := func(id string) string {
		var s string
		if err := db.QueryRow(`SELECT application_status FROM tt WHERE id = ?`, id).Scan(&s); err != nil {
			t.Fatalf("read %s: %v", id, err)
		}
		return s
	}
	for id, want := range map[string]string{"a": "applied", "b": "offer", "c": "", "d": "", "e": ""} {
		if got := get(id); got != want {
			t.Errorf("row %s: application_status = %q, want %q", id, got, want)
		}
	}
}
