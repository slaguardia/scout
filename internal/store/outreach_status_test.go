package store

import (
	"database/sql"
	"strings"
	"testing"
)

// seedPosting creates a company + one posting and returns the posting id.
func seedPosting(t *testing.T, db *DB) string {
	t.Helper()
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "Solutions Engineer")
	if err != nil {
		t.Fatalf("add posting: %v", err)
	}
	return p.ID
}

func TestOutreachStatusDefaultAndUpdate(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)

	// Default is "" (none) — the column backfills empty.
	p, err := db.GetPosting(pid)
	if err != nil || p == nil {
		t.Fatalf("get posting: %v", err)
	}
	if p.OutreachStatus != "" {
		t.Fatalf("default outreach_status = %q, want empty", p.OutreachStatus)
	}

	// Round-trip each valid value through the tracking PUT.
	for _, v := range []string{"awaiting", "replied", "no_response", ""} {
		got, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: v})
		if err != nil {
			t.Fatalf("set outreach_status=%q: %v", v, err)
		}
		if got.OutreachStatus != v {
			t.Fatalf("after set %q, got %q", v, got.OutreachStatus)
		}
	}

	// Case-insensitive + trimmed.
	got, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "  AWAITING "})
	if err != nil {
		t.Fatalf("set mixed-case: %v", err)
	}
	if got.OutreachStatus != "awaiting" {
		t.Fatalf("normalize: got %q, want awaiting", got.OutreachStatus)
	}
}

func TestOutreachStatusInvalidRejected(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)
	_, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "maybe-later"})
	if err == nil {
		t.Fatal("expected an error for an invalid outreach_status, got nil")
	}
	if !strings.HasPrefix(err.Error(), "outreach_status ") {
		t.Fatalf("error %q must be prefixed 'outreach_status ' so the web layer maps it to 400", err.Error())
	}
	// The bad write must not have stored anything.
	if p, _ := db.GetPosting(pid); p != nil && p.OutreachStatus != "" {
		t.Fatalf("invalid status leaked: %q", p.OutreachStatus)
	}
}

// outreach_status and response are independent axes — setting one must not
// mutate the other.
func TestOutreachStatusIndependentOfResponse(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)

	// awaiting reply, no application response yet.
	got, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "awaiting"})
	if err != nil {
		t.Fatalf("set awaiting: %v", err)
	}
	if got.OutreachStatus != "awaiting" || got.Response != "" {
		t.Fatalf("want awaiting/empty-response, got %q/%q", got.OutreachStatus, got.Response)
	}

	// Set a response while keeping awaiting — both coexist.
	got, err = db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "awaiting", Response: "screening"})
	if err != nil {
		t.Fatalf("set response: %v", err)
	}
	if got.OutreachStatus != "awaiting" || got.Response != "screening" {
		t.Fatalf("axes interfered: %q/%q", got.OutreachStatus, got.Response)
	}
}

// Marking a draft sent opens the reply window (outreach_status -> 'awaiting') in
// the same transaction that bumps outreach_count / last_outreach_at, but it must
// not clobber an existing 'replied'.
func TestMarkOutreachDraftSentSetsAwaiting(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)

	d, err := db.CreateOutreachDraft(pid)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if _, err := db.MarkOutreachDraftSent(d.ID); err != nil {
		t.Fatalf("mark sent: %v", err)
	}
	p, _ := db.GetPosting(pid)
	if p.OutreachStatus != "awaiting" {
		t.Fatalf("after mark-sent, outreach_status = %q, want awaiting", p.OutreachStatus)
	}
	if p.OutreachCount != 1 || p.LastOutreachAt == "" {
		t.Fatalf("tracking not bumped: count=%d last=%q", p.OutreachCount, p.LastOutreachAt)
	}
}

func TestMarkOutreachDraftSentKeepsReplied(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)

	// They already replied; a later sent draft (a follow-up) must keep 'replied'.
	if _, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "replied"}); err != nil {
		t.Fatalf("set replied: %v", err)
	}
	d, err := db.CreateOutreachDraft(pid)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if _, err := db.MarkOutreachDraftSent(d.ID); err != nil {
		t.Fatalf("mark sent: %v", err)
	}
	p, _ := db.GetPosting(pid)
	if p.OutreachStatus != "replied" {
		t.Fatalf("mark-sent clobbered replied -> %q", p.OutreachStatus)
	}
}
