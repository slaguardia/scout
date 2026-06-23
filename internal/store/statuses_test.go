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

func TestStatusListDefaultsAndRoundTrip(t *testing.T) {
	db := openTestDB(t)

	// Unset -> defaults.
	os, err := db.OutreachStatuses()
	if err != nil || len(os) != len(DefaultOutreachStatuses) || os[0] != "initial contact" {
		t.Fatalf("default outreach statuses = %v (err %v)", os, err)
	}
	st, err := db.ApplicationStages()
	if err != nil || len(st) != len(DefaultApplicationStages) || st[0] != "applied" {
		t.Fatalf("default application stages = %v (err %v)", st, err)
	}

	// Set + round-trip.
	if err := db.SetOutreachStatuses([]string{"reached out", "ghosted", "talking"}); err != nil {
		t.Fatalf("set outreach statuses: %v", err)
	}
	if got, _ := db.OutreachStatuses(); len(got) != 3 || got[1] != "ghosted" {
		t.Fatalf("round-trip outreach statuses = %v", got)
	}
	if err := db.SetApplicationStages([]string{"applied", "phone screen", "onsite", "offer"}); err != nil {
		t.Fatalf("set application stages: %v", err)
	}
	if got, _ := db.ApplicationStages(); len(got) != 4 || got[1] != "phone screen" {
		t.Fatalf("round-trip application stages = %v", got)
	}
}

func TestStatusListSanitize(t *testing.T) {
	db := openTestDB(t)
	// Trim, drop blanks, collapse case-insensitive dupes (first spelling wins).
	if err := db.SetOutreachStatuses([]string{"  Replied ", "", "replied", "REPLIED", "no response"}); err != nil {
		t.Fatalf("set: %v", err)
	}
	got, _ := db.OutreachStatuses()
	if len(got) != 2 || got[0] != "Replied" || got[1] != "no response" {
		t.Fatalf("sanitize = %v, want [Replied, no response]", got)
	}

	// An all-empty list is rejected (prefix "statuses " for the 400 mapping).
	if err := db.SetOutreachStatuses([]string{"", "   "}); err == nil || !strings.HasPrefix(err.Error(), "statuses ") {
		t.Fatalf("empty list: want statuses error, got %v", err)
	}

	// A corrupt stored value falls back to the default, not an empty dropdown.
	if err := db.SetSetting(OutreachStatusesSetting, "not json"); err != nil {
		t.Fatalf("seed garbage: %v", err)
	}
	if got, _ := db.OutreachStatuses(); len(got) != len(DefaultOutreachStatuses) {
		t.Fatalf("corrupt value didn't fall back to default: %v", got)
	}
}

// outreach_status is a free configurable label: lenient (only a length bound),
// and independent of the application stage axis.
func TestOutreachStatusLenientAndIndependent(t *testing.T) {
	db := openTestDB(t)
	pid := seedPosting(t, db)

	// Any short label is accepted (no enum check).
	got, err := db.UpdatePostingTracking(pid, PostingTracking{OutreachStatus: "  followed up  "})
	if err != nil {
		t.Fatalf("set status: %v", err)
	}
	if got.OutreachStatus != "followed up" { // trimmed
		t.Fatalf("status = %q, want 'followed up'", got.OutreachStatus)
	}

	// Setting a stage doesn't disturb the outreach status (separate axes).
	got, err = db.UpdatePostingTracking(pid, PostingTracking{
		OutreachStatus:    "followed up",
		ApplicationStatus: "interview",
	})
	if err != nil {
		t.Fatalf("set stage: %v", err)
	}
	if got.OutreachStatus != "followed up" || got.ApplicationStatus != "interview" {
		t.Fatalf("axes interfered: status=%q stage=%q", got.OutreachStatus, got.ApplicationStatus)
	}
}
