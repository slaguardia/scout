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
		Title: "Solutions Engineer", Location: "SF / remote", Summary: "Pre-sales eng.", FetchStatus: "ok",
	})
	if err != nil {
		t.Fatalf("UpsertCapturedPosting: %v", err)
	}
	if updated {
		t.Error("fresh insert reported as update")
	}
	if p.Source != "capture" || p.Title != "Solutions Engineer" || p.Location != "SF / remote" ||
		p.Summary != "Pre-sales eng." || p.FetchStatus != "ok" || p.CapturedAt == "" {
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
	if p.AppliedAt != "" || p.Response != "" || p.OutreachCount != 0 || p.LastOutreachAt != "" {
		t.Errorf("expected blank lifecycle, got %+v", p)
	}

	// Full update round-trips.
	got, err := db.UpdatePostingTracking(p.ID, PostingTracking{
		AppliedAt: "2026-05-22", Response: "Screening", OutreachCount: 2, LastOutreachAt: "2026-05-30",
	})
	if err != nil {
		t.Fatalf("UpdatePostingTracking: %v", err)
	}
	if got.AppliedAt != "2026-05-22" || got.Response != "screening" || // response is case-folded
		got.OutreachCount != 2 || got.LastOutreachAt != "2026-05-30" {
		t.Errorf("unexpected tracking: %+v", got)
	}

	// Clearing works (un-applied, response reset).
	got, err = db.UpdatePostingTracking(p.ID, PostingTracking{})
	if err != nil {
		t.Fatalf("clear tracking: %v", err)
	}
	if got.AppliedAt != "" || got.Response != "" || got.OutreachCount != 0 || got.LastOutreachAt != "" {
		t.Errorf("tracking not cleared: %+v", got)
	}

	// The jobs view carries the lifecycle columns.
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{AppliedAt: "2026-06-01", Response: "offer", OutreachCount: 1, LastOutreachAt: "2026-06-02"}); err != nil {
		t.Fatalf("re-set tracking: %v", err)
	}
	rows, err := db.ListJobRows()
	if err != nil || len(rows) != 1 {
		t.Fatalf("ListJobRows: rows=%d err=%v", len(rows), err)
	}
	if r := rows[0]; r.AppliedAt != "2026-06-01" || r.Response != "offer" || r.OutreachCount != 1 || r.LastOutreachAt != "2026-06-02" {
		t.Errorf("job row lifecycle mismatch: %+v", r)
	}

	// Validation: bad date, bad response, negative count, unknown posting.
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{AppliedAt: "May 22"}); err == nil || !strings.HasPrefix(err.Error(), "applied_at ") {
		t.Errorf("bad date: want applied_at error, got %v", err)
	}
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{Response: "ghosted"}); err == nil || !strings.HasPrefix(err.Error(), "response ") {
		t.Errorf("bad response: want response error, got %v", err)
	}
	if _, err := db.UpdatePostingTracking(p.ID, PostingTracking{OutreachCount: -1}); err == nil || !strings.HasPrefix(err.Error(), "outreach_count ") {
		t.Errorf("negative count: want outreach_count error, got %v", err)
	}
	if _, err := db.UpdatePostingTracking("no-such-posting", PostingTracking{}); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("unknown posting: want sql.ErrNoRows, got %v", err)
	}
}
