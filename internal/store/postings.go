package store

import (
	"database/sql"
	"fmt"
	neturl "net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Posting is a link to a job/role posting found at a company. One-to-many:
// a company can have any number of postings. Flattened + JSON-tagged for
// direct serialization in the company detail payload and the add endpoint.
// company_id is the company's deterministic TEXT uuid (see CompanyID).
//
// Beyond the hand-entered url/title, the link-capture agent pass fills the
// extracted fields (location, summary) and provenance: source is "manual"
// (hand-added) or "capture", fetch_status records how the capture fetch went,
// and captured_at is when the agent pass last filled the row.
type Posting struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id"`
	URL         string `json:"url"`
	Title       string `json:"title"`        // "" when null
	Location    string `json:"location"`     // "" when null
	Summary     string `json:"summary"`      // "" when null
	Source      string `json:"source"`       // "manual" | "capture"
	FetchStatus string `json:"fetch_status"` // capture taxonomy; "" for manual adds
	CreatedAt   string `json:"created_at"`
	CapturedAt  string `json:"captured_at"` // "" when never captured

	// Application lifecycle (M23) — the jobs view doubles as the user's
	// application tracker. AppliedAt "" means not applied; Response is the
	// furthest reply reached ("screening"|"interview"|"offer"|"rejected").
	AppliedAt      string `json:"applied_at"`
	Response       string `json:"response"`
	OutreachCount  int    `json:"outreach_count"`
	LastOutreachAt string `json:"last_outreach_at"`

	// Contacts (M24): free-form outreach contacts for this role —
	// comma-separated emails, names allowed ("Jane <jane@acme.com>, cto@…").
	Contacts string `json:"contacts"`
}

// postingCols is the shared SELECT list; keep in sync with scanPosting.
const postingCols = `id, company_id, url, COALESCE(title, ''), COALESCE(location, ''),
       COALESCE(summary, ''), COALESCE(source, 'manual'), COALESCE(fetch_status, ''),
       created_at, COALESCE(captured_at, ''),
       COALESCE(applied_at, ''), COALESCE(response, ''), outreach_count, COALESCE(last_outreach_at, ''),
       COALESCE(contacts, '')`

func scanPosting(row interface{ Scan(...any) error }) (Posting, error) {
	var p Posting
	err := row.Scan(&p.ID, &p.CompanyID, &p.URL, &p.Title, &p.Location,
		&p.Summary, &p.Source, &p.FetchStatus, &p.CreatedAt, &p.CapturedAt,
		&p.AppliedAt, &p.Response, &p.OutreachCount, &p.LastOutreachAt,
		&p.Contacts)
	return p, err
}

// validatePostingURL trims and validates a posting link: it must be a non-empty
// http(s) URL — anything else (empty, or a scheme like javascript: that would
// render into a clickable href) is rejected with an error whose message starts
// with "url ", which the web handler maps to HTTP 400.
func validatePostingURL(url string) (string, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return "", fmt.Errorf("url required")
	}
	u, err := neturl.Parse(url)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("url must be http(s)")
	}
	return url, nil
}

// AddPosting inserts a hand-added posting (source "manual") for a company and
// returns the created row. Inputs are trimmed; see validatePostingURL for the
// url rules. Returns sql.ErrNoRows if the company doesn't exist.
func (db *DB) AddPosting(companyID, url, title string) (Posting, error) {
	url, err := validatePostingURL(url)
	if err != nil {
		return Posting{}, err
	}
	title = strings.TrimSpace(title)

	// Ensure the company exists (mirrors the guard in other store writes).
	exists, err := db.CompanyExists(companyID)
	if err != nil {
		return Posting{}, err
	}
	if !exists {
		return Posting{}, sql.ErrNoRows
	}

	titleVal := sql.NullString{String: title, Valid: title != ""}
	id := uuid.NewString()
	const q = `INSERT INTO job_postings (id, company_id, url, title, source) VALUES (?, ?, ?, ?, 'manual')`
	if _, err := db.Exec(q, id, companyID, url, titleVal); err != nil {
		return Posting{}, fmt.Errorf("insert posting for company %s: %w", companyID, err)
	}
	return db.readPosting(id)
}

// CapturedPosting is the payload the link-capture agent pass extracted from a
// pasted URL. URL is the canonical (post-redirect) link that gets stored;
// PastedURL, when different, is also matched on upsert so re-pasting the
// original link refreshes the same row.
type CapturedPosting struct {
	CompanyID   string
	URL         string
	PastedURL   string
	Title       string
	Location    string
	Summary     string
	FetchStatus string
}

// UpsertCapturedPosting inserts a captured posting, or — when the same URL is
// already stored — refreshes that row's extracted fields in place, so pasting
// a link twice re-captures instead of duplicating. The existing row's company
// is kept (the URL is the posting's identity, not the resolution of the
// company). Returns the stored posting and whether an existing row was
// updated. Returns sql.ErrNoRows if a fresh insert targets an unknown company.
func (db *DB) UpsertCapturedPosting(p CapturedPosting) (Posting, bool, error) {
	url, err := validatePostingURL(p.URL)
	if err != nil {
		return Posting{}, false, err
	}
	pasted := strings.TrimSpace(p.PastedURL)
	if pasted == "" {
		pasted = url
	}

	null := func(s string) sql.NullString { return NullString(strings.TrimSpace(s)) }

	var existingID string
	err = db.QueryRow(
		`SELECT id FROM job_postings WHERE url IN (?, ?) ORDER BY created_at DESC, rowid DESC LIMIT 1`,
		url, pasted,
	).Scan(&existingID)
	switch {
	case err == nil:
		const q = `UPDATE job_postings SET
		    url = ?, title = ?, location = ?, summary = ?,
		    source = 'capture', fetch_status = ?, captured_at = CURRENT_TIMESTAMP
		 WHERE id = ?`
		if _, err := db.Exec(q, url, null(p.Title), null(p.Location), null(p.Summary), null(p.FetchStatus), existingID); err != nil {
			return Posting{}, false, fmt.Errorf("update captured posting %s: %w", existingID, err)
		}
		out, err := db.readPosting(existingID)
		return out, true, err
	case err != sql.ErrNoRows:
		return Posting{}, false, fmt.Errorf("find posting by url: %w", err)
	}

	exists, err := db.CompanyExists(p.CompanyID)
	if err != nil {
		return Posting{}, false, err
	}
	if !exists {
		return Posting{}, false, sql.ErrNoRows
	}
	id := uuid.NewString()
	const q = `INSERT INTO job_postings (id, company_id, url, title, location, summary, source, fetch_status, captured_at)
	           VALUES (?, ?, ?, ?, ?, ?, 'capture', ?, CURRENT_TIMESTAMP)`
	if _, err := db.Exec(q, id, p.CompanyID, url, null(p.Title), null(p.Location), null(p.Summary), null(p.FetchStatus)); err != nil {
		return Posting{}, false, fmt.Errorf("insert captured posting for company %s: %w", p.CompanyID, err)
	}
	out, err := db.readPosting(id)
	return out, false, err
}

// PostingTracking is the application-lifecycle payload for one posting. All
// fields are full-state (not deltas): the UI sends the complete picture and
// the row is set to it. Empty strings clear the dates/response; a negative
// OutreachCount is rejected.
type PostingTracking struct {
	AppliedAt      string `json:"applied_at"`       // "YYYY-MM-DD" or "" (not applied)
	Response       string `json:"response"`         // ""|"screening"|"interview"|"offer"|"rejected"
	OutreachCount  int    `json:"outreach_count"`   // >= 0
	LastOutreachAt string `json:"last_outreach_at"` // "YYYY-MM-DD" or ""
	Contacts       string `json:"contacts"`         // free-form; trimmed, no validation
}

// validTrackingDate accepts "" (unset) or a bare ISO date. Validation errors
// are prefixed with the field name so the web layer can map them to 400s.
func validTrackingDate(field, s string) (sql.NullString, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return sql.NullString{}, nil
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return sql.NullString{}, fmt.Errorf("%s must be a YYYY-MM-DD date", field)
	}
	return sql.NullString{String: s, Valid: true}, nil
}

// UpdatePostingTracking sets a posting's application-lifecycle fields and
// returns the refreshed row. Returns sql.ErrNoRows for an unknown posting;
// validation errors carry the offending field's name as a prefix.
func (db *DB) UpdatePostingTracking(id string, t PostingTracking) (Posting, error) {
	applied, err := validTrackingDate("applied_at", t.AppliedAt)
	if err != nil {
		return Posting{}, err
	}
	lastOutreach, err := validTrackingDate("last_outreach_at", t.LastOutreachAt)
	if err != nil {
		return Posting{}, err
	}
	response := strings.ToLower(strings.TrimSpace(t.Response))
	switch response {
	case "", "screening", "interview", "offer", "rejected":
	default:
		return Posting{}, fmt.Errorf(`response must be "screening", "interview", "offer", "rejected", or empty`)
	}
	if t.OutreachCount < 0 {
		return Posting{}, fmt.Errorf("outreach_count must be >= 0")
	}

	const q = `UPDATE job_postings SET
	    applied_at = ?, response = ?, outreach_count = ?, last_outreach_at = ?, contacts = ?
	 WHERE id = ?`
	res, err := db.Exec(q, applied, NullString(response), t.OutreachCount, lastOutreach,
		NullString(strings.TrimSpace(t.Contacts)), id)
	if err != nil {
		return Posting{}, fmt.Errorf("update posting tracking %s: %w", id, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return Posting{}, sql.ErrNoRows
	}
	return db.readPosting(id)
}

func (db *DB) readPosting(id string) (Posting, error) {
	p, err := scanPosting(db.QueryRow(`SELECT `+postingCols+` FROM job_postings WHERE id = ?`, id))
	if err != nil {
		return Posting{}, fmt.Errorf("read back posting %s: %w", id, err)
	}
	return p, nil
}

// ListPostings returns a company's postings, newest first. Returns an empty
// (non-nil) slice when there are none, so callers serialize [] not null.
func (db *DB) ListPostings(companyID string) ([]Posting, error) {
	rows, err := db.Query(`SELECT `+postingCols+` FROM job_postings WHERE company_id = ?
	           ORDER BY created_at DESC, rowid DESC`, companyID)
	if err != nil {
		return nil, fmt.Errorf("list postings for company %s: %w", companyID, err)
	}
	defer rows.Close()

	out := []Posting{}
	for rows.Next() {
		p, err := scanPosting(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// JobRow is one row of the jobs view: a posting joined with its company's
// name, verdict, and triage marks, so the UI can filter jobs by the company's
// state without a second fetch.
type JobRow struct {
	PostingID   string `json:"posting_id"`
	CompanyID   string `json:"company_id"`
	Company     string `json:"company"`
	URL         string `json:"url"`
	Title       string `json:"title"`
	Location    string `json:"location"`
	Summary     string `json:"summary"`
	Source      string `json:"source"`
	FetchStatus string `json:"fetch_status"`
	CreatedAt   string `json:"created_at"`
	Verdict     string `json:"verdict"` // the company's verdict; "" when unscored
	Reason      string `json:"reason"`
	Reviewed    bool   `json:"reviewed"`
	Flagged     bool   `json:"flagged"`

	// Application lifecycle (M23) — the tracker columns of the jobs view.
	AppliedAt      string `json:"applied_at"`
	Response       string `json:"response"`
	OutreachCount  int    `json:"outreach_count"`
	LastOutreachAt string `json:"last_outreach_at"`
	Contacts       string `json:"contacts"` // outreach contacts (M24)
}

// ListJobRows returns every posting across all companies, newest first, for
// the jobs view. Returns an empty (non-nil) slice when there are none.
func (db *DB) ListJobRows() ([]JobRow, error) {
	const q = `
SELECT p.id, p.company_id, c.name, p.url, COALESCE(p.title, ''), COALESCE(p.location, ''),
       COALESCE(p.summary, ''), COALESCE(p.source, 'manual'), COALESCE(p.fetch_status, ''),
       p.created_at, COALESCE(v.verdict, ''), COALESCE(v.reason, ''),
       c.reviewed_at, c.flagged_at,
       COALESCE(p.applied_at, ''), COALESCE(p.response, ''), p.outreach_count, COALESCE(p.last_outreach_at, ''),
       COALESCE(p.contacts, '')
FROM job_postings p
JOIN companies c ON c.id = p.company_id
LEFT JOIN verdicts v ON v.company_id = p.company_id
ORDER BY p.created_at DESC, p.rowid DESC`
	rows, err := db.Query(q)
	if err != nil {
		return nil, fmt.Errorf("list job rows: %w", err)
	}
	defer rows.Close()

	out := []JobRow{}
	for rows.Next() {
		var r JobRow
		var reviewedAt, flaggedAt sql.NullString
		if err := rows.Scan(&r.PostingID, &r.CompanyID, &r.Company, &r.URL, &r.Title, &r.Location,
			&r.Summary, &r.Source, &r.FetchStatus, &r.CreatedAt, &r.Verdict, &r.Reason,
			&reviewedAt, &flaggedAt,
			&r.AppliedAt, &r.Response, &r.OutreachCount, &r.LastOutreachAt,
			&r.Contacts); err != nil {
			return nil, err
		}
		r.Reviewed = reviewedAt.Valid
		r.Flagged = flaggedAt.Valid
		out = append(out, r)
	}
	return out, rows.Err()
}
