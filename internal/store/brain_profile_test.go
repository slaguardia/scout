package store

import (
	"testing"
)

// openTestDB lives in companies_test.go (same package).

// TestBrainProfilePutGetTouch covers the change-aware accessors end-to-end:
// PutBrainProfile stamps cursor + verified_at; TouchBrainProfile advances both
// WITHOUT rewriting body/content_hash/fetched_at.
func TestBrainProfilePutGetTouch(t *testing.T) {
	db := openTestDB(t)
	const url = "http://brain.test"

	if err := db.PutBrainProfile(url, "BODY ONE", "hash-1", "cursor-A"); err != nil {
		t.Fatalf("Put: %v", err)
	}
	cp, err := db.GetBrainProfile(url)
	if err != nil || cp == nil {
		t.Fatalf("Get after Put: cp=%v err=%v", cp, err)
	}
	if cp.Body != "BODY ONE" || cp.ContentHash != "hash-1" || cp.Cursor != "cursor-A" {
		t.Fatalf("Put round-trip wrong: %+v", cp)
	}
	if cp.VerifiedAt == "" {
		t.Fatal("verified_at should be stamped by Put")
	}
	if cp.VerifiedAgeSeconds < 0 {
		t.Fatalf("verified_age_seconds = %d, want >= 0 after Put", cp.VerifiedAgeSeconds)
	}
	fetchedAt := cp.FetchedAt

	// Touch: cursor + verified_at move; body / content_hash / fetched_at do NOT.
	if err := db.TouchBrainProfile(url, "cursor-B"); err != nil {
		t.Fatalf("Touch: %v", err)
	}
	cp2, err := db.GetBrainProfile(url)
	if err != nil || cp2 == nil {
		t.Fatalf("Get after Touch: cp=%v err=%v", cp2, err)
	}
	if cp2.Cursor != "cursor-B" {
		t.Fatalf("cursor = %q after Touch, want cursor-B", cp2.Cursor)
	}
	if cp2.Body != "BODY ONE" || cp2.ContentHash != "hash-1" {
		t.Fatalf("Touch rewrote body/hash: %+v", cp2)
	}
	if cp2.FetchedAt != fetchedAt {
		t.Fatalf("Touch moved fetched_at: %q -> %q", fetchedAt, cp2.FetchedAt)
	}
}

// TestTouchMissingRowNoOp documents the contract: touching an absent row is a
// no-op, not an error (the cold path writes a full row later).
func TestTouchMissingRowNoOp(t *testing.T) {
	db := openTestDB(t)
	if err := db.TouchBrainProfile("http://nobody.test", "cursor-X"); err != nil {
		t.Fatalf("Touch on missing row should be a no-op, got %v", err)
	}
	if cp, err := db.GetBrainProfile("http://nobody.test"); err != nil || cp != nil {
		t.Fatalf("Touch must not create a row: cp=%v err=%v", cp, err)
	}
}

// TestPreMigrationRowReadsNeverVerified simulates a row written before 0037
// (verified_at IS NULL, cursor defaulted ”) and asserts the sentinel semantics:
// VerifiedAt empty, VerifiedAgeSeconds == -1, Cursor == "".
func TestPreMigrationRowReadsNeverVerified(t *testing.T) {
	db := openTestDB(t)
	const url = "http://legacy.test"
	// Insert bypassing PutBrainProfile to leave verified_at NULL, as a pre-0037
	// row reads after the ALTER TABLE adds the nullable column.
	if _, err := db.Exec(
		`INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
		url, "LEGACY BODY", "legacy-hash",
	); err != nil {
		t.Fatalf("legacy insert: %v", err)
	}
	cp, err := db.GetBrainProfile(url)
	if err != nil || cp == nil {
		t.Fatalf("Get legacy: cp=%v err=%v", cp, err)
	}
	if cp.Cursor != "" {
		t.Fatalf("legacy cursor = %q, want '' (default)", cp.Cursor)
	}
	if cp.VerifiedAt != "" {
		t.Fatalf("legacy verified_at = %q, want '' (NULL→COALESCE)", cp.VerifiedAt)
	}
	if cp.VerifiedAgeSeconds != -1 {
		t.Fatalf("legacy verified_age_seconds = %d, want -1 sentinel", cp.VerifiedAgeSeconds)
	}
}

// TestMigration0037AppliesToPreExistingTable drives the actual ALTER path: it
// rolls a populated DB back to the pre-0037 shape (drop the two columns + the
// applied-migration record) and re-runs migrate, asserting 0037 re-adds the
// columns to a table that already has rows and the old row reads never-verified.
func TestMigration0037AppliesToPreExistingTable(t *testing.T) {
	db := openTestDB(t)
	const url = "http://preexisting.test"
	if err := db.PutBrainProfile(url, "OLD BODY", "old-hash", "old-cursor"); err != nil {
		t.Fatalf("seed row: %v", err)
	}
	// Roll back to the pre-0037 schema: drop the columns and forget the migration.
	for _, stmt := range []string{
		`ALTER TABLE brain_profile_cache DROP COLUMN cursor`,
		`ALTER TABLE brain_profile_cache DROP COLUMN verified_at`,
		`DELETE FROM schema_migrations WHERE name = '0037_brain_profile_cursor.sql'`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("rollback %q: %v", stmt, err)
		}
	}
	// Re-run migrations: 0037 must ALTER the now-populated table cleanly.
	if err := db.migrate(); err != nil {
		t.Fatalf("re-migrate: %v", err)
	}
	cp, err := db.GetBrainProfile(url)
	if err != nil || cp == nil {
		t.Fatalf("Get after re-migrate: cp=%v err=%v", cp, err)
	}
	if cp.Body != "OLD BODY" || cp.ContentHash != "old-hash" {
		t.Fatalf("re-migrate disturbed the row: %+v", cp)
	}
	if cp.Cursor != "" || cp.VerifiedAt != "" || cp.VerifiedAgeSeconds != -1 {
		t.Fatalf("re-added columns should default to empty/never-verified, got %+v", cp)
	}
}
