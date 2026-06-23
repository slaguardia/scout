package store

import (
	"database/sql"
	"errors"
	"strings"
	"testing"
)

func TestPostingsRoundTrip(t *testing.T) {
	db := openTestDB(t)

	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}

	// Empty list for a company with no postings — non-nil, len 0.
	if ps, err := db.ListPostings(cid); err != nil || ps == nil || len(ps) != 0 {
		t.Fatalf("ListPostings empty: got %v len=%d err=%v", ps, len(ps), err)
	}

	p, err := db.AddPosting(cid, "  https://acme.com/jobs/se  ", "  Solutions Engineer  ")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	if p.ID == "" {
		t.Error("expected a generated uuid id")
	}
	if p.URL != "https://acme.com/jobs/se" {
		t.Errorf("url not trimmed: %q", p.URL)
	}
	if p.Title != "Solutions Engineer" {
		t.Errorf("title not trimmed: %q", p.Title)
	}
	if p.CompanyID != cid || p.CreatedAt == "" {
		t.Errorf("unexpected posting: %+v", p)
	}

	// Second posting should sort first (newest first).
	p2, err := db.AddPosting(cid, "https://acme.com/jobs/pm", "")
	if err != nil {
		t.Fatalf("AddPosting 2: %v", err)
	}
	ps, err := db.ListPostings(cid)
	if err != nil {
		t.Fatalf("ListPostings: %v", err)
	}
	if len(ps) != 2 {
		t.Fatalf("want 2 postings, got %d", len(ps))
	}
	if ps[0].ID != p2.ID {
		t.Errorf("expected newest first; got %q then %q", ps[0].ID, ps[1].ID)
	}
	if ps[1].Title != "Solutions Engineer" {
		t.Errorf("title round-trip mismatch: %q", ps[1].Title)
	}
}

func TestAddPostingIdempotentByURL(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}

	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	// The same URL again returns the existing row — and backfills the blank
	// title — instead of inserting a duplicate.
	p2, err := db.AddPosting(cid, "https://acme.com/jobs/se", "Solutions Engineer")
	if err != nil {
		t.Fatalf("AddPosting again: %v", err)
	}
	if p2.ID != p.ID {
		t.Errorf("want existing posting %s, got %s", p.ID, p2.ID)
	}
	if p2.Title != "Solutions Engineer" {
		t.Errorf("blank title not backfilled: %q", p2.Title)
	}

	// A non-blank title is never overwritten.
	p3, err := db.AddPosting(cid, "https://acme.com/jobs/se", "Sales Engineer")
	if err != nil {
		t.Fatalf("AddPosting third: %v", err)
	}
	if p3.Title != "Solutions Engineer" {
		t.Errorf("existing title clobbered: %q", p3.Title)
	}
	if ps, _ := db.ListPostings(cid); len(ps) != 1 {
		t.Errorf("want 1 posting, got %d", len(ps))
	}
}

func TestNextUpClearsWhenOutreachGoesOut(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	// Queue it.
	p, err = db.SetPostingNextUp(p.ID, true)
	if err != nil || !p.NextUp {
		t.Fatalf("SetPostingNextUp on: next_up=%v err=%v", p.NextUp, err)
	}

	// A tracking write that does NOT bump outreach keeps the mark.
	p, err = db.UpdatePostingTracking(p.ID, PostingTracking{OutreachStatus: "initial contact"})
	if err != nil || !p.NextUp {
		t.Fatalf("mark lost on unrelated tracking write: next_up=%v err=%v", p.NextUp, err)
	}

	// Logging the outreach (+1) completes the to-do — the mark clears.
	p, err = db.UpdatePostingTracking(p.ID, PostingTracking{
		OutreachCount: 1, LastOutreachAt: "2026-06-06",
	})
	if err != nil || p.NextUp {
		t.Fatalf("mark not cleared by outreach bump: next_up=%v err=%v", p.NextUp, err)
	}

	// Manual unqueue works too.
	p, _ = db.SetPostingNextUp(p.ID, true)
	p, err = db.SetPostingNextUp(p.ID, false)
	if err != nil || p.NextUp {
		t.Fatalf("SetPostingNextUp off: next_up=%v err=%v", p.NextUp, err)
	}

	// Unknown posting → ErrNoRows for the 404.
	if _, err := db.SetPostingNextUp("nope", true); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want ErrNoRows, got %v", err)
	}
}

func TestAddPostingValidation(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}

	// Empty url (after trim) is rejected.
	if _, err := db.AddPosting(cid, "   ", "title"); err == nil || !strings.Contains(err.Error(), "url required") {
		t.Errorf("want url-required error, got %v", err)
	}

	// Non-http(s) schemes (e.g. javascript:, which would render into an href)
	// are rejected with a "url "-prefixed error so the handler returns 400.
	for _, bad := range []string{"javascript:alert(1)", "data:text/html,x", "ftp://acme.com/x"} {
		_, err := db.AddPosting(cid, bad, "")
		if err == nil || !strings.HasPrefix(err.Error(), "url ") {
			t.Errorf("AddPosting(%q): want url-prefixed validation error, got %v", bad, err)
		}
	}

	// http(s) urls still pass scheme validation (sanity check the gate isn't
	// over-broad).
	if _, err := db.AddPosting(cid, "http://acme.com/jobs", ""); err != nil {
		t.Errorf("http url unexpectedly rejected: %v", err)
	}

	// Unknown company → sql.ErrNoRows.
	if _, err := db.AddPosting("no-such-company-uuid", "https://x.com/job", ""); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("want sql.ErrNoRows for missing company, got %v", err)
	}
}

func TestUpsertCapturedPosting(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}

	// Fresh insert carries the extracted fields + capture provenance.
	p, updated, err := db.UpsertCapturedPosting(CapturedPosting{
		CompanyID: cid, URL: "https://acme.com/jobs/se", PastedURL: "https://acme.co/r/123",
		Title: "Solutions Engineer", Location: "SF / remote", Description: "Pre-sales eng.", FetchStatus: "ok",
	})
	if err != nil {
		t.Fatalf("UpsertCapturedPosting: %v", err)
	}
	if updated {
		t.Error("fresh insert reported as update")
	}
	if p.Source != "capture" || p.Title != "Solutions Engineer" || p.Location != "SF / remote" ||
		p.Description != "Pre-sales eng." || p.FetchStatus != "ok" || p.CapturedAt == "" {
		t.Errorf("unexpected captured posting: %+v", p)
	}

	// Re-capturing the same canonical URL refreshes in place — no duplicate.
	p2, updated, err := db.UpsertCapturedPosting(CapturedPosting{
		CompanyID: cid, URL: "https://acme.com/jobs/se",
		Title: "Senior Solutions Engineer", FetchStatus: "ok",
	})
	if err != nil {
		t.Fatalf("re-capture: %v", err)
	}
	if !updated || p2.ID != p.ID || p2.Title != "Senior Solutions Engineer" {
		t.Errorf("re-capture: updated=%v posting=%+v", updated, p2)
	}

	// Capturing via the PASTED url of a stored row also matches that row.
	p3, updated, err := db.UpsertCapturedPosting(CapturedPosting{
		CompanyID: cid, URL: "https://acme.com/jobs/se-final", PastedURL: "https://acme.com/jobs/se",
		Title: "SE", FetchStatus: "ok",
	})
	if err != nil {
		t.Fatalf("pasted-url match: %v", err)
	}
	if !updated || p3.ID != p.ID || p3.URL != "https://acme.com/jobs/se-final" {
		t.Errorf("pasted-url match: updated=%v posting=%+v", updated, p3)
	}
	if ps, _ := db.ListPostings(cid); len(ps) != 1 {
		t.Errorf("want 1 posting after re-captures, got %d", len(ps))
	}

	// A capture of a hand-added link upgrades it in place.
	hand, err := db.AddPosting(cid, "https://acme.com/jobs/pm", "")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	h2, updated, err := db.UpsertCapturedPosting(CapturedPosting{
		CompanyID: cid, URL: "https://acme.com/jobs/pm", Title: "PM", FetchStatus: "ok",
	})
	if err != nil || !updated || h2.ID != hand.ID || h2.Source != "capture" || h2.Title != "PM" {
		t.Errorf("hand-added upgrade: updated=%v err=%v posting=%+v", updated, err, h2)
	}

	// Validation + unknown company mirror AddPosting.
	if _, _, err := db.UpsertCapturedPosting(CapturedPosting{CompanyID: cid, URL: "javascript:x"}); err == nil || !strings.HasPrefix(err.Error(), "url ") {
		t.Errorf("want url-prefixed validation error, got %v", err)
	}
	if _, _, err := db.UpsertCapturedPosting(CapturedPosting{CompanyID: "nope", URL: "https://x.com/j"}); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("want sql.ErrNoRows for missing company, got %v", err)
	}
}

func TestListJobRows(t *testing.T) {
	db := openTestDB(t)
	// Empty list — non-nil, len 0.
	if rows, err := db.ListJobRows(); err != nil || rows == nil || len(rows) != 0 {
		t.Fatalf("ListJobRows empty: got %v len=%d err=%v", rows, len(rows), err)
	}

	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	if err := db.UpsertVerdict(Verdict{CompanyID: cid, Verdict: "yes", Reason: "fit", TasteVersion: "v1", Model: "m"}); err != nil {
		t.Fatalf("upsert verdict: %v", err)
	}
	if err := db.SetFlagged(cid, true); err != nil {
		t.Fatalf("set flagged: %v", err)
	}
	if _, _, err := db.UpsertCapturedPosting(CapturedPosting{
		CompanyID: cid, URL: "https://acme.com/jobs/se", Title: "SE", Location: "SF", FetchStatus: "ok",
	}); err != nil {
		t.Fatalf("captured posting: %v", err)
	}

	rows, err := db.ListJobRows()
	if err != nil {
		t.Fatalf("ListJobRows: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 job row, got %d", len(rows))
	}
	r := rows[0]
	if r.Company != "Acme" || r.CompanyID != cid || r.Title != "SE" || r.Location != "SF" ||
		r.Verdict != "yes" || r.Source != "capture" || !r.Flagged || r.Reviewed {
		t.Errorf("unexpected job row: %+v", r)
	}
	// No outreach draft yet — the badge field stays empty.
	if r.OutreachDraftStatus != "" {
		t.Errorf("OutreachDraftStatus = %q, want empty", r.OutreachDraftStatus)
	}

	// The latest draft's status surfaces on the row (newest by id wins).
	d1, err := db.CreateOutreachDraft(r.PostingID)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if err := db.SetOutreachDraftResult(d1.ID, DraftNoHook, "", "", "tpl", "[]", "", "", ""); err != nil {
		t.Fatalf("set draft result: %v", err)
	}
	rows, err = db.ListJobRows()
	if err != nil || len(rows) != 1 {
		t.Fatalf("ListJobRows after draft: rows=%d err=%v", len(rows), err)
	}
	if got := rows[0].OutreachDraftStatus; got != DraftNoHook {
		t.Errorf("OutreachDraftStatus = %q, want %q", got, DraftNoHook)
	}
}

func TestUpdatePostingTracking(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	// Fresh posting starts blank.
	if p.ApplicationStatus != "" || p.OutreachCount != 0 || p.LastOutreachAt != "" || p.OutreachStatus != "" {
		t.Errorf("expected blank lifecycle, got %+v", p)
	}

	// Full update round-trips (application_status + outreach_status are configurable labels).
	got, err := db.UpdatePostingTracking(p.ID, PostingTracking{
		ApplicationStatus: "interview", OutreachStatus: "initial contact", OutreachCount: 2, LastOutreachAt: "2026-05-30",
		Contacts: "  Jane Doe <jane@acme.com>, cto@acme.com  ",
	})
	if err != nil {
		t.Fatalf("UpdatePostingTracking: %v", err)
	}
	if got.ApplicationStatus != "interview" || got.OutreachStatus != "initial contact" ||
		got.OutreachCount != 2 || got.LastOutreachAt != "2026-05-30" ||
		got.Contacts != "Jane Doe <jane@acme.com>, cto@acme.com" { // trimmed
		t.Errorf("unexpected tracking: %+v", got)
	}

	// Clearing works (application + outreach status reset).
	got, err = db.UpdatePostingTracking(p.ID, PostingTracking{})
	if err != nil {
		t.Fatalf("clear tracking: %v", err)
	}
	if got.ApplicationStatus != "" || got.OutreachStatus != "" || got.OutreachCount != 0 ||
		got.LastOutreachAt != "" || got.Contacts != "" {
		t.Errorf("tracking not cleared: %+v", got)
	}

	// The jobs view carries the lifecycle columns.
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{ApplicationStatus: "interview", OutreachStatus: "replied", OutreachCount: 1, LastOutreachAt: "2026-06-02", Contacts: "jane@acme.com"}); err != nil {
		t.Fatalf("re-set tracking: %v", err)
	}
	rows, err := db.ListJobRows()
	if err != nil || len(rows) != 1 {
		t.Fatalf("ListJobRows: rows=%d err=%v", len(rows), err)
	}
	if r := rows[0]; r.ApplicationStatus != "interview" || r.OutreachStatus != "replied" || r.OutreachCount != 1 ||
		r.LastOutreachAt != "2026-06-02" || r.Contacts != "jane@acme.com" {
		t.Errorf("job row lifecycle mismatch: %+v", r)
	}

	// Validation: bad date, over-long outreach_status, negative count, unknown posting.
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{LastOutreachAt: "May 22"}); err == nil || !strings.HasPrefix(err.Error(), "last_outreach_at ") {
		t.Errorf("bad date: want last_outreach_at error, got %v", err)
	}
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{OutreachStatus: strings.Repeat("x", 100)}); err == nil || !strings.HasPrefix(err.Error(), "outreach_status ") {
		t.Errorf("over-long status: want outreach_status error, got %v", err)
	}
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{OutreachCount: -1}); err == nil || !strings.HasPrefix(err.Error(), "outreach_count ") {
		t.Errorf("negative count: want outreach_count error, got %v", err)
	}
	if _, err := db.UpdatePostingTracking("no-such-posting", PostingTracking{}); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want sql.ErrNoRows, got %v", err)
	}
}

func TestUpdatePostingDetails(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "Wrong Title")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	// Full edit round-trips; strings are trimmed.
	got, err := db.UpdatePostingDetails(p.ID, PostingEdit{
		Title: "  Staff Engineer  ", Location: "Remote",
		EmploymentType: "Full-time", WorkplaceType: "Remote", Department: "Eng",
		CompRange: "$200k-$250k", Description: "long description",
	})
	if err != nil {
		t.Fatalf("UpdatePostingDetails: %v", err)
	}
	if got.Title != "Staff Engineer" || got.Location != "Remote" ||
		got.EmploymentType != "Full-time" || got.WorkplaceType != "Remote" || got.Department != "Eng" ||
		got.CompRange != "$200k-$250k" || got.Description != "long description" {
		t.Errorf("unexpected details: %+v", got)
	}
	// The URL (identity) is untouched.
	if got.URL != "https://acme.com/jobs/se" {
		t.Errorf("URL changed: %q", got.URL)
	}

	// Empty strings clear fields back to "".
	got, err = db.UpdatePostingDetails(p.ID, PostingEdit{Title: "Just a Title"})
	if err != nil {
		t.Fatalf("clear details: %v", err)
	}
	if got.Title != "Just a Title" || got.Location != "" ||
		got.Department != "" || got.CompRange != "" || got.Description != "" {
		t.Errorf("details not cleared: %+v", got)
	}

	// Unknown posting -> sql.ErrNoRows.
	if _, err := db.UpdatePostingDetails("no-such-posting", PostingEdit{}); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want sql.ErrNoRows, got %v", err)
	}
}

func TestUpdatePostingURL(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "Staff Engineer")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	// Happy path: the link changes, trims, and other fields are untouched.
	got, err := db.UpdatePostingURL(p.ID, "  https://acme.com/jobs/staff-se  ")
	if err != nil {
		t.Fatalf("UpdatePostingURL: %v", err)
	}
	if got.URL != "https://acme.com/jobs/staff-se" {
		t.Errorf("URL not updated/trimmed: %q", got.URL)
	}
	if got.Title != "Staff Engineer" {
		t.Errorf("title clobbered: %q", got.Title)
	}

	// Empty and non-http(s) urls are rejected (validatePostingURL).
	if _, err := db.UpdatePostingURL(p.ID, "  "); err == nil {
		t.Error("empty url: want error, got nil")
	}
	if _, err := db.UpdatePostingURL(p.ID, "ftp://acme.com/jobs"); err == nil {
		t.Error("ftp url: want error, got nil")
	}

	// Unknown posting -> sql.ErrNoRows.
	if _, err := db.UpdatePostingURL("no-such-posting", "https://x.com/j"); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want sql.ErrNoRows, got %v", err)
	}
}

func TestReapStuckOutreachDrafts(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", RawJSON: "{}"})
	if err != nil {
		t.Fatal(err)
	}
	p, err := db.AddPosting(cid, "https://acme.test/j", "X")
	if err != nil {
		t.Fatal(err)
	}
	d, err := db.CreateOutreachDraft(p.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Fresh row + 30-minute threshold: not reaped (a live run).
	if n, err := db.ReapStuckOutreachDrafts(30); err != nil || n != 0 {
		t.Fatalf("reap(30) = %d, %v; want 0", n, err)
	}
	// Threshold 0 (serve startup): reaped.
	n, err := db.ReapStuckOutreachDrafts(0)
	if err != nil || n != 1 {
		t.Fatalf("reap(0) = %d, %v; want 1", n, err)
	}
	got, _ := db.GetOutreachDraft(d.ID)
	if got.Status != DraftFailed || got.FailReason == "" {
		t.Fatalf("reaped draft: %+v", got)
	}
	// The posting is unblocked: a new draft can start.
	if _, err := db.CreateOutreachDraft(p.ID); err != nil {
		t.Fatalf("new draft after reap: %v", err)
	}
}

// TestPostingNotes pins the human-only posting notes: set via tracking, exposed
// on both readPosting and the jobs view, and — the point — preserved when the
// posting is re-captured (a details overwrite must not clobber the user's note).
func TestPostingNotes(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	got, err := db.UpdatePostingTracking(p.ID, PostingTracking{Notes: "  referred by Dana; mentions on-call  "})
	if err != nil {
		t.Fatalf("set notes: %v", err)
	}
	if got.Notes != "referred by Dana; mentions on-call" { // trimmed
		t.Fatalf("notes not stored/trimmed: %q", got.Notes)
	}

	// A re-capture (details overwrite) must leave notes untouched.
	if _, err := db.UpdatePostingDetails(p.ID, PostingEdit{Title: "Senior SE", Description: "new JD"}); err != nil {
		t.Fatalf("details overwrite: %v", err)
	}
	again, err := db.GetPosting(p.ID)
	if err != nil || again == nil {
		t.Fatalf("GetPosting: %v", err)
	}
	if again.Notes != "referred by Dana; mentions on-call" {
		t.Errorf("re-capture clobbered notes: %q", again.Notes)
	}

	// The jobs view carries notes too.
	rows, err := db.ListJobRows()
	if err != nil || len(rows) != 1 {
		t.Fatalf("ListJobRows: rows=%d err=%v", len(rows), err)
	}
	if rows[0].Notes != "referred by Dana; mentions on-call" {
		t.Errorf("job row notes mismatch: %q", rows[0].Notes)
	}

	// Blank clears.
	if got, err = db.UpdatePostingTracking(p.ID, PostingTracking{}); err != nil || got.Notes != "" {
		t.Errorf("clear notes: notes=%q err=%v", got.Notes, err)
	}
}

// DeletePosting removes the posting and its posting-keyed children (outreach
// drafts, application answers) cascade off job_postings, leaving the company and
// its other rows untouched. An unknown id is sql.ErrNoRows so the API can 404.
func TestDeletePostingRemovesEverything(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}
	// A posting-keyed child in each cascading table.
	if _, err := db.CreateOutreachDraft(p.ID); err != nil {
		t.Fatalf("seed draft: %v", err)
	}
	if err := db.UpsertDetectedQuestions(p.ID, []DetectedQuestion{{Prompt: "Why us?"}}, "ok"); err != nil {
		t.Fatalf("seed answer: %v", err)
	}

	if err := db.DeletePosting(p.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if got, _ := db.GetPosting(p.ID); got != nil {
		t.Fatalf("posting %q still present after delete", p.ID)
	}
	for _, table := range []string{"outreach_drafts", "posting_answers"} {
		var n int
		if err := db.QueryRow(`SELECT COUNT(1) FROM `+table+` WHERE posting_id = ?`, p.ID).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if n != 0 {
			t.Errorf("%s not cascaded: %d remain after delete", table, n)
		}
	}
	// The company is untouched — deleting a posting is not deleting its company.
	if exists, _ := db.CompanyExists(cid); !exists {
		t.Errorf("company %q removed by posting delete", cid)
	}

	// Unknown id → sql.ErrNoRows (the handler maps it to 404).
	if err := db.DeletePosting("does-not-exist"); err != sql.ErrNoRows {
		t.Errorf("delete unknown: want sql.ErrNoRows, got %v", err)
	}
}

func TestRegenerateOutreachDraft(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	// First draft → awaiting_review.
	d1, err := db.CreateOutreachDraft(p.ID)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	const research = `{"company":"Acme","hooks":[]}`
	if err := db.SetOutreachDraftResult(d1.ID, DraftAwaitingReview, research, "", "first body", "[]", "", "", ""); err != nil {
		t.Fatalf("set result: %v", err)
	}

	// A plain create now conflicts — one active (reviewable) draft per posting.
	if _, err := db.CreateOutreachDraft(p.ID); err == nil {
		t.Fatal("CreateOutreachDraft over an awaiting_review draft should conflict")
	}

	// Regenerate retires the old draft and returns a fresh researching one — with
	// the prior draft's research carried forward (re-draft, don't re-search).
	d2, err := db.RegenerateOutreachDraft(p.ID)
	if err != nil {
		t.Fatalf("regenerate: %v", err)
	}
	if d2.ID == d1.ID || d2.Status != DraftResearching {
		t.Fatalf("regenerate returned %+v, want a new researching draft", d2)
	}
	if d2.Research != research {
		t.Fatalf("regenerate did not carry research forward: got %q, want %q", d2.Research, research)
	}

	drafts, err := db.ListOutreachDrafts(p.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(drafts) != 2 {
		t.Fatalf("want 2 drafts (superseded + new), got %d", len(drafts))
	}
	// Newest first: the new researching draft, then the superseded original.
	if drafts[0].ID != d2.ID || drafts[0].Status != DraftResearching {
		t.Errorf("drafts[0] = %+v, want new researching", drafts[0])
	}
	if drafts[1].ID != d1.ID || drafts[1].Status != DraftSuperseded {
		t.Errorf("drafts[1] = %+v, want superseded original", drafts[1])
	}
	// The old body is preserved in history.
	if drafts[1].Draft != "first body" {
		t.Errorf("superseded draft lost its body: %q", drafts[1].Draft)
	}

	// Regenerating while a draft is still researching is refused (in-flight).
	if _, err := db.RegenerateOutreachDraft(p.ID); err == nil {
		t.Fatal("RegenerateOutreachDraft during researching should conflict")
	}
}

// needs_work is an ACTIVE status: it blocks a plain create (one reviewable
// draft per posting) and is retired to superseded by a regenerate.
func TestNeedsWorkIsActive(t *testing.T) {
	db := openTestDB(t)
	cid, err := db.UpsertCompany(Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("upsert company: %v", err)
	}
	p, err := db.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("AddPosting: %v", err)
	}

	d1, err := db.CreateOutreachDraft(p.ID)
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	critique := `{"depth":"medium","proof_tier":"adjacent","weaknesses":[],"experience_gaps":"","attempts":2}`
	if err := db.SetOutreachDraftResult(d1.ID, DraftNeedsWork, "{}", "", "flagged body", "[]", "", critique, ""); err != nil {
		t.Fatalf("set result: %v", err)
	}
	got, err := db.GetOutreachDraft(d1.ID)
	if err != nil || got.Critique != critique {
		t.Fatalf("critique round-trip: %q err=%v", got.Critique, err)
	}

	if _, err := db.CreateOutreachDraft(p.ID); err == nil {
		t.Fatal("CreateOutreachDraft over a needs_work draft should conflict")
	}

	d2, err := db.RegenerateOutreachDraft(p.ID)
	if err != nil {
		t.Fatalf("regenerate: %v", err)
	}
	if d2.ID == d1.ID || d2.Status != DraftResearching {
		t.Fatalf("regenerate returned %+v, want a new researching draft", d2)
	}
	old, err := db.GetOutreachDraft(d1.ID)
	if err != nil || old.Status != DraftSuperseded {
		t.Fatalf("needs_work draft after regenerate = %+v err=%v, want superseded", old, err)
	}
}
