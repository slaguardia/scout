package store

import (
	"database/sql"
	"errors"
	"fmt"
	neturl "net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

// cleanStatusLabel trims a configurable status label — the outreach reply status
// or the application stage. Both vocabularies are user-configurable settings and
// "none" is empty, so the columns are opaque (like contacts) — only a length
// bound is enforced here; the UI constrains the choices. The error is prefixed
// with the field name so the web layer can map it to a 400.
func cleanStatusLabel(field, s string) (string, error) {
	s = strings.TrimSpace(s)
	if len(s) > maxStatusLabelLen {
		return "", fmt.Errorf("%s label is too long", field)
	}
	return s, nil
}

// ErrUnknownCompany is returned when an operation targets a company id that
// doesn't exist — relinking a posting (UpdatePostingCompany) never creates the
// target company, so the web layer maps this to a 400 (bad request), distinct
// from sql.ErrNoRows for a missing posting (a 404).
var ErrUnknownCompany = errors.New("company not found")

// Posting is a link to a job/role posting found at a company. One-to-many:
// a company can have any number of postings. Flattened + JSON-tagged for
// direct serialization in the company detail payload and the add endpoint.
// company_id is the company's deterministic TEXT uuid (see CompanyID).
//
// Beyond the hand-entered url/title, the link-capture agent pass fills the
// extracted fields (location, description) and provenance: source is "manual"
// (hand-added) or "capture", fetch_status records how the capture fetch went,
// and captured_at is when the agent pass last filled the row.
type Posting struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id"`
	URL         string `json:"url"`
	Title       string `json:"title"`        // "" when null
	Location    string `json:"location"`     // "" when null
	Source      string `json:"source"`       // "manual" | "capture"
	FetchStatus string `json:"fetch_status"` // capture taxonomy; "" for manual adds
	CreatedAt   string `json:"created_at"`
	CapturedAt  string `json:"captured_at"` // "" when never captured

	// Structured details (M28), filled by the ATS resolver — the no-LLM capture
	// path that reads ashby/greenhouse/lever's public posting API. The detail
	// columns are "" when the link wasn't ATS-resolved; Description is the
	// exception — the non-ATS LLM path also fills it (with the fetched page
	// text), since it's the posting body outreach and chat read.
	PostedAt       string `json:"posted_at"`       // "YYYY-MM-DD"
	EmploymentType string `json:"employment_type"` // "Full-time", "Contract", ...
	WorkplaceType  string `json:"workplace_type"`  // "Remote" | "Hybrid" | "On-site"
	Department     string `json:"department"`
	CompRange      string `json:"comp_range"`  // published salary range, pre-formatted
	Description    string `json:"description"` // full posting text, plain

	// Application lifecycle — the jobs view doubles as the user's application
	// tracker. ApplicationStatus (M51) is the application axis: a single
	// configurable label ("" = none), the furthest stage reached. The vocabulary
	// lives in the application_stages setting. It replaced the M50 dated
	// stage_history (the dates carried no weight), mirroring OutreachStatus.
	ApplicationStatus string `json:"application_status"`
	OutreachCount     int    `json:"outreach_count"`
	LastOutreachAt    string `json:"last_outreach_at"`

	// OutreachStatus (M48) is the reply state of the outreach — a SEPARATE axis
	// from the application stage. A configurable label ("" = none); the
	// vocabulary lives in the outreach_statuses setting.
	OutreachStatus string `json:"outreach_status"`

	// Contacts (M24): hand-curated outreach contacts for this role, stored as a
	// JSON array of {position, email} entries (legacy free-form strings still
	// parse). Opaque to the backend — the UI owns the shape.
	Contacts string `json:"contacts"`

	// Notes: free-form, human-only scratchpad on this posting. Never written by
	// capture/ATS/outreach — only the tracking PUT touches it.
	Notes string `json:"notes"`

	// NextUp (M27) marks the posting as queued "next up for outreach" — a
	// hand-set to-do that clears automatically when outreach_count bumps.
	NextUp bool `json:"next_up"`

	// Application-questions detection summary (M32), set by the question
	// resolver at capture / re-detect. QuestionsStatus is the QuestionScan
	// status ("ok"|"none"|"unsupported"|fetch status); "" = never detected.
	QuestionsStatus string `json:"questions_status"`
	QuestionsAt     string `json:"questions_at"`
}

// postingCols is the shared SELECT list; keep in sync with scanPosting.
const postingCols = `id, company_id, url, COALESCE(title, ''), COALESCE(location, ''),
       COALESCE(source, 'manual'), COALESCE(fetch_status, ''),
       created_at, COALESCE(captured_at, ''),
       COALESCE(posted_at, ''), COALESCE(employment_type, ''), COALESCE(workplace_type, ''),
       COALESCE(department, ''), COALESCE(comp_range, ''), COALESCE(description, ''),
       COALESCE(application_status, ''), outreach_count, COALESCE(last_outreach_at, ''),
       COALESCE(outreach_status, ''),
       COALESCE(contacts, ''), COALESCE(notes, ''), next_up_at,
       COALESCE(questions_status, ''), COALESCE(questions_at, '')`

func scanPosting(row interface{ Scan(...any) error }) (Posting, error) {
	var p Posting
	var nextUpAt sql.NullString
	err := row.Scan(&p.ID, &p.CompanyID, &p.URL, &p.Title, &p.Location,
		&p.Source, &p.FetchStatus, &p.CreatedAt, &p.CapturedAt,
		&p.PostedAt, &p.EmploymentType, &p.WorkplaceType,
		&p.Department, &p.CompRange, &p.Description,
		&p.ApplicationStatus, &p.OutreachCount, &p.LastOutreachAt,
		&p.OutreachStatus,
		&p.Contacts, &p.Notes, &nextUpAt,
		&p.QuestionsStatus, &p.QuestionsAt)
	p.NextUp = nextUpAt.Valid
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
// url rules. The URL is the posting's identity (same rule as the capture
// upsert): adding a link that's already tracked returns the existing row —
// backfilling a blank title when one was typed — instead of duplicating it.
// Returns sql.ErrNoRows if the company doesn't exist.
func (db *DB) AddPosting(companyID, url, title string) (Posting, error) {
	url, err := validatePostingURL(url)
	if err != nil {
		return Posting{}, err
	}
	title = strings.TrimSpace(title)

	// Already tracked? Return that row (the existing row's company wins).
	var existingID string
	err = db.QueryRow(
		`SELECT id FROM job_postings WHERE url = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
		url,
	).Scan(&existingID)
	switch {
	case err == nil:
		if title != "" {
			const q = `UPDATE job_postings SET title = ? WHERE id = ? AND (title IS NULL OR title = '')`
			if _, err := db.Exec(q, title, existingID); err != nil {
				return Posting{}, fmt.Errorf("backfill posting title %s: %w", existingID, err)
			}
		}
		return db.readPosting(existingID)
	case err != sql.ErrNoRows:
		return Posting{}, fmt.Errorf("find posting by url: %w", err)
	}

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
	FetchStatus string

	// Structured details (M28) — set by the ATS resolver; the LLM path leaves
	// PostedAt/EmploymentType/etc. empty but does fill Description (the fetched
	// page text). Empties never overwrite stored values on upsert.
	PostedAt       string // "YYYY-MM-DD"
	EmploymentType string
	WorkplaceType  string
	Department     string
	CompRange      string
	Description    string
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
		// Most columns COALESCE — the two capture paths fill different fields
		// (the ATS resolver fills the detail columns, the LLM path fills only
		// description), so an empty re-capture must not erase what the other
		// path stored. Non-empty values still overwrite.
		const q = `UPDATE job_postings SET
		    url = ?, title = ?, location = COALESCE(?, location),
		    posted_at = COALESCE(?, posted_at), employment_type = COALESCE(?, employment_type),
		    workplace_type = COALESCE(?, workplace_type), department = COALESCE(?, department),
		    comp_range = COALESCE(?, comp_range), description = COALESCE(?, description),
		    source = 'capture', fetch_status = ?, captured_at = CURRENT_TIMESTAMP
		 WHERE id = ?`
		if _, err := db.Exec(q, url, null(p.Title), null(p.Location),
			null(p.PostedAt), null(p.EmploymentType), null(p.WorkplaceType),
			null(p.Department), null(p.CompRange), null(p.Description),
			null(p.FetchStatus), existingID); err != nil {
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
	const q = `INSERT INTO job_postings (id, company_id, url, title, location,
	               posted_at, employment_type, workplace_type, department, comp_range, description,
	               source, fetch_status, captured_at)
	           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'capture', ?, CURRENT_TIMESTAMP)`
	if _, err := db.Exec(q, id, p.CompanyID, url, null(p.Title), null(p.Location),
		null(p.PostedAt), null(p.EmploymentType), null(p.WorkplaceType),
		null(p.Department), null(p.CompRange), null(p.Description),
		null(p.FetchStatus)); err != nil {
		return Posting{}, false, fmt.Errorf("insert captured posting for company %s: %w", p.CompanyID, err)
	}
	out, err := db.readPosting(id)
	return out, false, err
}

// PostingTracking is the application-lifecycle payload for one posting. All
// fields are full-state (not deltas): the UI sends the complete picture and
// the row is set to it. Empty strings clear a field; a negative OutreachCount
// is rejected.
type PostingTracking struct {
	ApplicationStatus string `json:"application_status"` // configurable label; "" = none
	OutreachCount     int    `json:"outreach_count"`     // >= 0
	LastOutreachAt    string `json:"last_outreach_at"`   // "YYYY-MM-DD" or ""
	OutreachStatus    string `json:"outreach_status"`    // configurable label; "" = none
	Contacts          string `json:"contacts"`           // JSON [{position,email}]; trimmed, opaque
	Notes             string `json:"notes"`              // free-form, human-only; trimmed
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
	lastOutreach, err := validTrackingDate("last_outreach_at", t.LastOutreachAt)
	if err != nil {
		return Posting{}, err
	}
	outreachStatus, err := cleanStatusLabel("outreach_status", t.OutreachStatus)
	if err != nil {
		return Posting{}, err
	}
	applicationStatus, err := cleanStatusLabel("application_status", t.ApplicationStatus)
	if err != nil {
		return Posting{}, err
	}
	if t.OutreachCount < 0 {
		return Posting{}, fmt.Errorf("outreach_count must be >= 0")
	}

	// A rising outreach_count means the outreach went out — the "next up"
	// to-do mark has served its purpose, so it clears in the same write.
	// (SET expressions see the old row, so the CASE compares old vs new.)
	// application_status (the application axis) and outreach_status (the reply
	// axis) are independent — neither write touches the other. Both are
	// configurable labels; "" stores verbatim (NOT NULL default '').
	const q = `UPDATE job_postings SET
	    next_up_at = CASE WHEN ? > outreach_count THEN NULL ELSE next_up_at END,
	    application_status = ?, outreach_count = ?, last_outreach_at = ?,
	    outreach_status = ?, contacts = ?, notes = ?
	 WHERE id = ?`
	res, err := db.Exec(q, t.OutreachCount, applicationStatus, t.OutreachCount, lastOutreach,
		outreachStatus, NullString(strings.TrimSpace(t.Contacts)), NullString(strings.TrimSpace(t.Notes)), id)
	if err != nil {
		return Posting{}, fmt.Errorf("update posting tracking %s: %w", id, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return Posting{}, sql.ErrNoRows
	}
	return db.readPosting(id)
}

// PostingEdit is the hand-editable content of a posting — the fields a user
// might fix when capture got them wrong (or left them blank). All full-state:
// the UI sends the complete picture and the row is set to it. Empty strings
// clear the field. URL and the lifecycle/provenance fields are NOT editable
// here — those have their own paths (tracking, capture).
type PostingEdit struct {
	Title          string `json:"title"`
	Location       string `json:"location"`
	EmploymentType string `json:"employment_type"`
	WorkplaceType  string `json:"workplace_type"`
	Department     string `json:"department"`
	CompRange      string `json:"comp_range"`
	Description    string `json:"description"`
}

// UpdatePostingDetails sets a posting's hand-editable content fields and
// returns the refreshed row. Returns sql.ErrNoRows for an unknown posting.
// Strings are trimmed; empty ones store as NULL.
func (db *DB) UpdatePostingDetails(id string, e PostingEdit) (Posting, error) {
	const q = `UPDATE job_postings SET
	    title = ?, location = ?, employment_type = ?,
	    workplace_type = ?, department = ?, comp_range = ?, description = ?
	 WHERE id = ?`
	tr := func(s string) sql.NullString { return NullString(strings.TrimSpace(s)) }
	res, err := db.Exec(q, tr(e.Title), tr(e.Location), tr(e.EmploymentType),
		tr(e.WorkplaceType), tr(e.Department), tr(e.CompRange), tr(e.Description), id)
	if err != nil {
		return Posting{}, fmt.Errorf("update posting details %s: %w", id, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return Posting{}, sql.ErrNoRows
	}
	return db.readPosting(id)
}

// UpdatePostingURL changes a posting's link and returns the refreshed row. The
// URL is the posting's identity (capture upserts by it), so it has its own path
// rather than riding in the full-state details edit — and it's validated the
// same way as on add (http(s), non-empty; empty would orphan the posting).
// Returns sql.ErrNoRows for an unknown posting.
func (db *DB) UpdatePostingURL(id, url string) (Posting, error) {
	url, err := validatePostingURL(url)
	if err != nil {
		return Posting{}, err
	}
	res, err := db.Exec(`UPDATE job_postings SET url = ? WHERE id = ?`, url, id)
	if err != nil {
		return Posting{}, fmt.Errorf("update posting url %s: %w", id, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return Posting{}, sql.ErrNoRows
	}
	return db.readPosting(id)
}

// UpdatePostingCompany re-links a posting to a different existing company and
// returns the refreshed row. This is the fix for a posting captured under the
// wrong company twin (e.g. "Automat" vs "Automat AI" — the one with the real
// enrichment): everything posting-scoped (drafts, answers, tracking) travels
// with the row, and the verdict/brief it shows become the new company's. The
// target must already exist — relinking never creates a company (that's the Add
// dialog's job): an unknown/blank companyID returns ErrUnknownCompany, and an
// unknown posting returns sql.ErrNoRows.
func (db *DB) UpdatePostingCompany(id, companyID string) (Posting, error) {
	companyID = strings.TrimSpace(companyID)
	if companyID == "" {
		return Posting{}, ErrUnknownCompany
	}
	exists, err := db.CompanyExists(companyID)
	if err != nil {
		return Posting{}, err
	}
	if !exists {
		return Posting{}, ErrUnknownCompany
	}
	res, err := db.Exec(`UPDATE job_postings SET company_id = ? WHERE id = ?`, companyID, id)
	if err != nil {
		return Posting{}, fmt.Errorf("update posting company %s: %w", id, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return Posting{}, sql.ErrNoRows
	}
	return db.readPosting(id)
}

// SetPostingNextUp queues (next_up_at = now) or unqueues (NULL) a posting as
// "next up for outreach", returning the refreshed row. The mark also clears on
// its own when outreach_count bumps — see UpdatePostingTracking and
// MarkOutreachDraftSent. Returns sql.ErrNoRows for an unknown posting.
func (db *DB) SetPostingNextUp(id string, nextUp bool) (Posting, error) {
	q := `UPDATE job_postings SET next_up_at = NULL WHERE id = ?`
	if nextUp {
		q = `UPDATE job_postings SET next_up_at = CURRENT_TIMESTAMP WHERE id = ?`
	}
	res, err := db.Exec(q, id)
	if err != nil {
		return Posting{}, fmt.Errorf("set next_up %s: %w", id, err)
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

// GetPosting returns one posting by id, or (nil, nil) when absent. The outreach
// engine needs the posting's url/title/company_id to seed a draft run.
func (db *DB) GetPosting(id string) (*Posting, error) {
	p, err := scanPosting(db.QueryRow(`SELECT `+postingCols+` FROM job_postings WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// DeletePosting permanently removes one job posting and everything attached to
// it — its outreach drafts and application answers fall away via ON DELETE
// CASCADE off job_postings (foreign keys are always ON; see store.Open). One
// statement is the whole cleanup, unlike DeleteCompany which must fan across
// several company_id tables. Returns sql.ErrNoRows for an unknown id so the
// caller can 404. Irreversible — there is no soft-delete.
func (db *DB) DeletePosting(id string) error {
	res, err := db.Exec(`DELETE FROM job_postings WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete posting %q: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
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
	Source      string `json:"source"`
	FetchStatus string `json:"fetch_status"`
	CreatedAt   string `json:"created_at"`

	// Structured details (M28) — ATS-resolved; "" when the link wasn't.
	PostedAt       string `json:"posted_at"`
	EmploymentType string `json:"employment_type"`
	WorkplaceType  string `json:"workplace_type"`
	Department     string `json:"department"`
	CompRange      string `json:"comp_range"`
	Description    string `json:"description"`

	Verdict  string `json:"verdict"` // the company's verdict; "" when unscored
	Reason   string `json:"reason"`
	Reviewed bool   `json:"reviewed"`
	Flagged  bool   `json:"flagged"`

	// Application lifecycle — the tracker columns of the jobs view.
	ApplicationStatus string `json:"application_status"` // application axis (M51): configurable label, "" = none
	OutreachCount     int    `json:"outreach_count"`
	LastOutreachAt    string `json:"last_outreach_at"`
	OutreachStatus    string `json:"outreach_status"` // reply axis (M48): configurable label, "" = none
	Contacts          string `json:"contacts"`        // outreach contacts (M24)
	Notes             string `json:"notes"`           // free-form, human-only posting notes
	NextUp            bool   `json:"next_up"`         // queued "next up for outreach" (M27)

	// OutreachDraftStatus is the latest outreach draft's status for this
	// posting ("" when none) — drives the jobs-table "draft ready" badge so
	// the fire-and-forget UX surfaces a finished draft on the next refresh.
	OutreachDraftStatus string `json:"outreach_draft_status"`

	// QuestionsStatus is the posting's application-questions detection status
	// (M32) — "" when never detected. Lets the panel header reflect form state
	// from the cached row before the per-posting answers fetch returns.
	QuestionsStatus string `json:"questions_status"`
}

// ListJobRows returns every posting across all companies, newest first, for
// the jobs view. Returns an empty (non-nil) slice when there are none.
func (db *DB) ListJobRows() ([]JobRow, error) {
	// The latest-draft status rides a correlated subquery (newest by id) rather
	// than a JOIN so the existing verdicts LEFT JOIN keeps its one-row-per-posting
	// shape — it feeds the jobs-table "draft ready" badge, nothing more.
	const q = `
SELECT p.id, p.company_id, c.name, p.url, COALESCE(p.title, ''), COALESCE(p.location, ''),
       COALESCE(p.source, 'manual'), COALESCE(p.fetch_status, ''),
       p.created_at,
       COALESCE(p.posted_at, ''), COALESCE(p.employment_type, ''), COALESCE(p.workplace_type, ''),
       COALESCE(p.department, ''), COALESCE(p.comp_range, ''), COALESCE(p.description, ''),
       COALESCE(v.verdict, ''), COALESCE(v.reason, ''),
       c.reviewed_at, c.flagged_at, p.next_up_at,
       COALESCE(p.application_status, ''), p.outreach_count, COALESCE(p.last_outreach_at, ''),
       COALESCE(p.outreach_status, ''),
       COALESCE(p.contacts, ''), COALESCE(p.notes, ''),
       COALESCE((SELECT od.status FROM outreach_drafts od
                 WHERE od.posting_id = p.id ORDER BY od.id DESC LIMIT 1), ''),
       COALESCE(p.questions_status, '')
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
		var reviewedAt, flaggedAt, nextUpAt sql.NullString
		if err := rows.Scan(&r.PostingID, &r.CompanyID, &r.Company, &r.URL, &r.Title, &r.Location,
			&r.Source, &r.FetchStatus, &r.CreatedAt,
			&r.PostedAt, &r.EmploymentType, &r.WorkplaceType,
			&r.Department, &r.CompRange, &r.Description,
			&r.Verdict, &r.Reason,
			&reviewedAt, &flaggedAt, &nextUpAt,
			&r.ApplicationStatus, &r.OutreachCount, &r.LastOutreachAt,
			&r.OutreachStatus,
			&r.Contacts, &r.Notes, &r.OutreachDraftStatus, &r.QuestionsStatus); err != nil {
			return nil, err
		}
		r.Reviewed = reviewedAt.Valid
		r.Flagged = flaggedAt.Valid
		r.NextUp = nextUpAt.Valid
		out = append(out, r)
	}
	return out, rows.Err()
}
