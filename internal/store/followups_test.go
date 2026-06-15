package store

import (
	"database/sql"
	"testing"
	"time"
)

// daysAgo returns the UTC date N days before today as "YYYY-MM-DD" — matching
// SQLite's date('now') (UTC) used by ListFollowUpsDue.
func daysAgo(n int) string {
	return time.Now().UTC().AddDate(0, 0, -n).Format("2006-01-02")
}

// mkAwaiting creates a posting under the given company and puts it in the
// 'awaiting' reply state with last_outreach_at set to `lastOutreach` (a date
// string, or "" to leave it null). Returns the posting id.
func mkAwaiting(t *testing.T, db *DB, companyID, url, title, lastOutreach string) string {
	t.Helper()
	p, err := db.AddPosting(companyID, url, title)
	if err != nil {
		t.Fatalf("add posting %s: %v", url, err)
	}
	tr := PostingTracking{OutreachStatus: "awaiting", OutreachCount: 1, LastOutreachAt: lastOutreach}
	if _, err := db.UpdatePostingTracking(p.ID, tr); err != nil {
		t.Fatalf("set awaiting %s: %v", url, err)
	}
	return p.ID
}

func TestFollowUpIntervalSetting(t *testing.T) {
	db := openTestDB(t)

	// Unset -> default 7.
	if n, err := db.FollowUpIntervalDays(); err != nil || n != DefaultFollowUpIntervalDays {
		t.Fatalf("default interval = %d (err %v), want %d", n, err, DefaultFollowUpIntervalDays)
	}
	// Set + round-trip.
	if err := db.SetFollowUpIntervalDays(14); err != nil {
		t.Fatalf("set 14: %v", err)
	}
	if n, _ := db.FollowUpIntervalDays(); n != 14 {
		t.Fatalf("interval after set = %d, want 14", n)
	}
	// Non-positive rejected.
	if err := db.SetFollowUpIntervalDays(0); err == nil {
		t.Fatal("expected SetFollowUpIntervalDays(0) to error")
	}
	if err := db.SetFollowUpIntervalDays(-3); err == nil {
		t.Fatal("expected SetFollowUpIntervalDays(-3) to error")
	}
	// A corrupt stored value falls back to the default rather than breaking.
	if err := db.SetSetting(FollowUpIntervalSetting, "garbage"); err != nil {
		t.Fatalf("seed garbage: %v", err)
	}
	if n, _ := db.FollowUpIntervalDays(); n != DefaultFollowUpIntervalDays {
		t.Fatalf("corrupt value gave %d, want default %d", n, DefaultFollowUpIntervalDays)
	}
}

func TestListFollowUpsDueInclusionExclusion(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("company: %v", err)
	}
	// Default interval is 7.

	// Due: awaiting, last outreach 10 days ago, no response.
	due := mkAwaiting(t, db, cid, "https://acme.com/jobs/due", "Due Role", daysAgo(10))

	// Boundary included: exactly today-7.
	boundary := mkAwaiting(t, db, cid, "https://acme.com/jobs/boundary", "Boundary", daysAgo(7))

	// Boundary excluded: today-6 (i.e. today - interval + 1), too recent.
	mkAwaiting(t, db, cid, "https://acme.com/jobs/recent", "Recent", daysAgo(6))

	// Excluded: awaiting but never actually reached out (null last_outreach).
	never := mkAwaiting(t, db, cid, "https://acme.com/jobs/never", "Never", "")
	_ = never

	// Excluded: awaiting + old, but the application already advanced (response set).
	engaged := mkAwaiting(t, db, cid, "https://acme.com/jobs/engaged", "Engaged", daysAgo(20))
	if _, err := db.UpdatePostingTracking(engaged, PostingTracking{OutreachStatus: "awaiting", OutreachCount: 1, LastOutreachAt: daysAgo(20), Response: "screening"}); err != nil {
		t.Fatalf("engage: %v", err)
	}

	// Excluded: replied / no_response.
	replied := mkAwaiting(t, db, cid, "https://acme.com/jobs/replied", "Replied", daysAgo(30))
	if _, err := db.UpdatePostingTracking(replied, PostingTracking{OutreachStatus: "replied", OutreachCount: 1, LastOutreachAt: daysAgo(30)}); err != nil {
		t.Fatalf("replied: %v", err)
	}
	noresp := mkAwaiting(t, db, cid, "https://acme.com/jobs/noresp", "NoResp", daysAgo(40))
	if _, err := db.UpdatePostingTracking(noresp, PostingTracking{OutreachStatus: "no_response", OutreachCount: 1, LastOutreachAt: daysAgo(40)}); err != nil {
		t.Fatalf("noresp: %v", err)
	}

	rows, err := db.ListFollowUpsDue()
	if err != nil {
		t.Fatalf("ListFollowUpsDue: %v", err)
	}
	got := map[string]FollowUpDue{}
	for _, r := range rows {
		got[r.PostingID] = r
	}
	if _, ok := got[due]; !ok {
		t.Error("expected the 10-day-old awaiting posting to be due")
	}
	if _, ok := got[boundary]; !ok {
		t.Error("expected the exactly-at-threshold posting to be due (>= boundary)")
	}
	if len(rows) != 2 {
		t.Fatalf("expected exactly 2 due postings (due + boundary), got %d: %+v", len(rows), rows)
	}

	// DaysOverdue = days since last outreach - interval. due: 10-7=3; boundary: 7-7=0.
	if got[due].DaysOverdue != 3 {
		t.Errorf("due DaysOverdue = %d, want 3", got[due].DaysOverdue)
	}
	if got[boundary].DaysOverdue != 0 {
		t.Errorf("boundary DaysOverdue = %d, want 0", got[boundary].DaysOverdue)
	}
	// The render fields are populated.
	if got[due].Company != "Acme" || got[due].Title != "Due Role" || got[due].URL == "" {
		t.Errorf("due row missing render fields: %+v", got[due])
	}
}

func TestListFollowUpsDueIntervalSensitivity(t *testing.T) {
	db := openTestDB(t)
	cid, _ := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})

	// last outreach 10 days ago.
	mkAwaiting(t, db, cid, "https://acme.com/jobs/x", "X", daysAgo(10))

	// At interval 7, it's due.
	if err := db.SetFollowUpIntervalDays(7); err != nil {
		t.Fatalf("set 7: %v", err)
	}
	if rows, _ := db.ListFollowUpsDue(); len(rows) != 1 {
		t.Fatalf("interval 7: want 1 due, got %d", len(rows))
	}
	// At interval 14, the same posting is NOT due.
	if err := db.SetFollowUpIntervalDays(14); err != nil {
		t.Fatalf("set 14: %v", err)
	}
	if rows, _ := db.ListFollowUpsDue(); len(rows) != 0 {
		t.Fatalf("interval 14: want 0 due, got %d", len(rows))
	}
}

func TestListFollowUpsDueOrdering(t *testing.T) {
	db := openTestDB(t)
	cid, _ := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})

	// Insert out of order; most-overdue (oldest last_outreach) must sort first.
	mkAwaiting(t, db, cid, "https://acme.com/jobs/mid", "Mid", daysAgo(12))
	mkAwaiting(t, db, cid, "https://acme.com/jobs/oldest", "Oldest", daysAgo(30))
	mkAwaiting(t, db, cid, "https://acme.com/jobs/newest", "Newest", daysAgo(8))

	rows, err := db.ListFollowUpsDue()
	if err != nil {
		t.Fatalf("ListFollowUpsDue: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("want 3 due, got %d", len(rows))
	}
	if rows[0].Title != "Oldest" || rows[1].Title != "Mid" || rows[2].Title != "Newest" {
		t.Fatalf("wrong order: %s, %s, %s", rows[0].Title, rows[1].Title, rows[2].Title)
	}
}

// Empty result is a non-nil empty slice (serializes to [] not null).
func TestListFollowUpsDueEmpty(t *testing.T) {
	db := openTestDB(t)
	rows, err := db.ListFollowUpsDue()
	if err != nil {
		t.Fatalf("ListFollowUpsDue: %v", err)
	}
	if rows == nil || len(rows) != 0 {
		t.Fatalf("want non-nil empty slice, got %v (len %d)", rows, len(rows))
	}
}
