package store

import (
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func pendingCount(t *testing.T, db *DB) int {
	t.Helper()
	p, err := db.PendingEpisodes()
	if err != nil {
		t.Fatal(err)
	}
	return len(p)
}

// TestEpisodeDedupRevert guards the dedup fix: a verdict that re-scores to a
// new decision and then reverts to an earlier one must re-capture, so the
// brain doesn't keep holding the stale intermediate verdict.
func TestEpisodeDedupRevert(t *testing.T) {
	db := openTestDB(t)
	id, err := db.UpsertCompany(Company{Source: "test", Name: "Acme"})
	if err != nil {
		t.Fatal(err)
	}
	score := func(verdict, reason string) {
		if err := db.UpsertVerdict(Verdict{CompanyID: id, Verdict: verdict, Reason: reason, TasteVersion: "v1", Model: "m"}); err != nil {
			t.Fatal(err)
		}
	}
	send := func(verdict, reason string) {
		if err := db.MarkEpisodeSent(id, VerdictHash(verdict, reason)); err != nil {
			t.Fatal(err)
		}
	}

	// Decision A: pending, then captured.
	score("no", "crypto wallet (excluded)")
	if n := pendingCount(t, db); n != 1 {
		t.Fatalf("after first verdict: pending=%d, want 1", n)
	}
	send("no", "crypto wallet (excluded)")
	if n := pendingCount(t, db); n != 0 {
		t.Fatalf("after capture A: pending=%d, want 0", n)
	}

	// Decision changes to B: pending again (content changed), then captured.
	score("yes", "AI infra for ML teams, Series B")
	if n := pendingCount(t, db); n != 1 {
		t.Fatalf("after change to B: pending=%d, want 1", n)
	}
	send("yes", "AI infra for ML teams, Series B")
	if n := pendingCount(t, db); n != 0 {
		t.Fatalf("after capture B: pending=%d, want 0", n)
	}

	// Revert to A: the decision is genuinely new again — must re-capture.
	score("no", "crypto wallet (excluded)")
	if n := pendingCount(t, db); n != 1 {
		t.Fatalf("after revert to A: pending=%d, want 1 (the brain must hear the revert)", n)
	}

	// And episodes_sent holds exactly one row for the company (last decision).
	sent, err := db.sentHashes()
	if err != nil {
		t.Fatal(err)
	}
	if len(sent) != 1 {
		t.Fatalf("episodes_sent rows = %d, want exactly 1 (last decision per company)", len(sent))
	}
}

// TestEpisodeNoChangeIsNoOp: re-running with no verdict change captures nothing.
func TestEpisodeNoChangeIsNoOp(t *testing.T) {
	db := openTestDB(t)
	id, _ := db.UpsertCompany(Company{Source: "test", Name: "Globex"})
	db.UpsertVerdict(Verdict{CompanyID: id, Verdict: "maybe", Reason: "adjacent vertical", TasteVersion: "v1", Model: "m"})
	db.MarkEpisodeSent(id, VerdictHash("maybe", "adjacent vertical"))
	if n := pendingCount(t, db); n != 0 {
		t.Fatalf("unchanged verdict should be a no-op, pending=%d", n)
	}
	// A brain-derived taste_version change must NOT re-capture (decision same).
	db.UpsertVerdict(Verdict{CompanyID: id, Verdict: "maybe", Reason: "adjacent vertical", TasteVersion: "v2-brain-changed", Model: "m"})
	if n := pendingCount(t, db); n != 0 {
		t.Fatalf("taste_version change with same decision should be a no-op, pending=%d", n)
	}
}
