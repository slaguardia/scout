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

	// Unknown company → sql.ErrNoRows.
	if _, err := db.AddPosting("no-such-company-uuid", "https://x.com/job", ""); !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("want sql.ErrNoRows for missing company, got %v", err)
	}
}
