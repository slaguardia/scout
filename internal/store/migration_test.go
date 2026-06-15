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
