package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// FollowupIntervalSetting holds the default number of business days after an
// outreach send to arm a follow-up (0 = don't auto-arm). Configurable from the
// dashboard; defaults to defaultFollowupIntervalDays when unset.
const FollowupIntervalSetting = "followup_interval_days"

const (
	defaultFollowupIntervalDays = 5
	maxFollowupIntervalDays     = 90
	maxContactFieldLen          = 200
)

// ErrDuplicateContact is returned when a contact with the same email already
// exists at the company; the web layer maps it to 409.
var ErrDuplicateContact = errors.New("a contact with that email already exists for this company")

// Contact is a person at a company the user can reach out to. Company-level so
// one recruiter is reused across that company's roles. Email is the contact's
// identity (unique per company when set); a name-only contact is allowed.
type Contact struct {
	ID        string `json:"id"`
	CompanyID string `json:"company_id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// ContactInput is the editable content of a contact (create/update).
type ContactInput struct {
	Name  string `json:"name"`
	Role  string `json:"role"`
	Email string `json:"email"`
}

func cleanContact(in ContactInput) (ContactInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Role = strings.TrimSpace(in.Role)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Name == "" && in.Email == "" {
		return in, fmt.Errorf("contact needs a name or an email")
	}
	if len(in.Name) > maxContactFieldLen || len(in.Role) > maxContactFieldLen || len(in.Email) > maxContactFieldLen {
		return in, fmt.Errorf("contact field is too long")
	}
	return in, nil
}

func isUniqueErr(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint")
}

const contactCols = `id, company_id, COALESCE(name, ''), COALESCE(role, ''), COALESCE(email, ''), created_at, updated_at`

func scanContact(row interface{ Scan(...any) error }) (Contact, error) {
	var c Contact
	err := row.Scan(&c.ID, &c.CompanyID, &c.Name, &c.Role, &c.Email, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (db *DB) readContact(id string) (Contact, error) {
	return scanContact(db.QueryRow(`SELECT `+contactCols+` FROM contacts WHERE id = ?`, id))
}

// ListContacts returns a company's active contacts, name-first. Empty (non-nil)
// when the company has none.
func (db *DB) ListContacts(companyID string) ([]Contact, error) {
	const q = `SELECT ` + contactCols + ` FROM contacts
	 WHERE company_id = ? AND archived_at IS NULL
	 ORDER BY name COLLATE NOCASE, role COLLATE NOCASE, email COLLATE NOCASE`
	rows, err := db.Query(q, companyID)
	if err != nil {
		return nil, fmt.Errorf("list contacts: %w", err)
	}
	defer rows.Close()
	out := []Contact{}
	for rows.Next() {
		c, err := scanContact(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// CreateContact adds a company contact. Returns sql.ErrNoRows for an unknown
// company and ErrDuplicateContact when an active contact already has that email.
// An archived contact with the same email is revived in place.
func (db *DB) CreateContact(companyID string, in ContactInput) (Contact, error) {
	in, err := cleanContact(in)
	if err != nil {
		return Contact{}, err
	}
	exists, err := db.CompanyExists(companyID)
	if err != nil {
		return Contact{}, err
	}
	if !exists {
		return Contact{}, sql.ErrNoRows
	}
	if in.Email != "" {
		var existingID string
		var archived sql.NullString
		err := db.QueryRow(`SELECT id, archived_at FROM contacts WHERE company_id = ? AND email = ?`,
			companyID, in.Email).Scan(&existingID, &archived)
		switch {
		case err == nil && !archived.Valid:
			return Contact{}, ErrDuplicateContact
		case err == nil:
			// Revive the archived row with the new details.
			if _, err := db.Exec(`UPDATE contacts SET name = ?, role = ?, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
				in.Name, in.Role, existingID); err != nil {
				return Contact{}, fmt.Errorf("revive contact: %w", err)
			}
			return db.readContact(existingID)
		case err != sql.ErrNoRows:
			return Contact{}, err
		}
	}
	id := uuid.NewString()
	if _, err := db.Exec(`INSERT INTO contacts (id, company_id, name, role, email) VALUES (?, ?, ?, ?, ?)`,
		id, companyID, in.Name, in.Role, in.Email); err != nil {
		if isUniqueErr(err) {
			return Contact{}, ErrDuplicateContact
		}
		return Contact{}, fmt.Errorf("create contact: %w", err)
	}
	return db.readContact(id)
}

// UpdateContact edits an active contact. sql.ErrNoRows for an unknown/archived
// id; ErrDuplicateContact when the new email collides with another contact.
func (db *DB) UpdateContact(id string, in ContactInput) (Contact, error) {
	in, err := cleanContact(in)
	if err != nil {
		return Contact{}, err
	}
	res, err := db.Exec(`UPDATE contacts SET name = ?, role = ?, email = ?, updated_at = CURRENT_TIMESTAMP
	 WHERE id = ? AND archived_at IS NULL`, in.Name, in.Role, in.Email, id)
	if err != nil {
		if isUniqueErr(err) {
			return Contact{}, ErrDuplicateContact
		}
		return Contact{}, fmt.Errorf("update contact %s: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Contact{}, sql.ErrNoRows
	}
	return db.readContact(id)
}

// ArchiveContact soft-deletes a contact (its outreach log is left intact).
// sql.ErrNoRows for an unknown/already-archived id.
func (db *DB) ArchiveContact(id string) error {
	res, err := db.Exec(`UPDATE contacts SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
	 WHERE id = ? AND archived_at IS NULL`, id)
	if err != nil {
		return fmt.Errorf("archive contact %s: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// FollowupIntervalDays returns the configured business-day follow-up interval,
// falling back to the default for an unset/garbage value. 0 means "don't auto-arm."
func (db *DB) FollowupIntervalDays() (int, error) {
	v, err := db.GetSetting(FollowupIntervalSetting)
	if err != nil {
		return defaultFollowupIntervalDays, err
	}
	v = strings.TrimSpace(v)
	if v == "" {
		return defaultFollowupIntervalDays, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return defaultFollowupIntervalDays, nil
	}
	if n > maxFollowupIntervalDays {
		n = maxFollowupIntervalDays
	}
	return n, nil
}

// SetFollowupIntervalDays stores the follow-up interval (0–90 business days).
func (db *DB) SetFollowupIntervalDays(n int) error {
	if n < 0 || n > maxFollowupIntervalDays {
		return fmt.Errorf("follow-up interval must be 0–%d days", maxFollowupIntervalDays)
	}
	return db.SetSetting(FollowupIntervalSetting, strconv.Itoa(n))
}

// addBusinessDays advances d by n weekdays (skips Sat/Sun). n <= 0 returns d.
func addBusinessDays(d time.Time, n int) time.Time {
	for n > 0 {
		d = d.AddDate(0, 0, 1)
		if wd := d.Weekday(); wd != time.Saturday && wd != time.Sunday {
			n--
		}
	}
	return d
}

// OutreachEntry is one logged send to a contact. SentAt / FollowupDueAt are bare
// ISO dates; FollowupDoneAt is "" while the follow-up is still pending.
type OutreachEntry struct {
	ID             int64  `json:"id"`
	ContactID      string `json:"contact_id"`
	PostingID      string `json:"posting_id"`
	SentAt         string `json:"sent_at"`
	Body           string `json:"body"` // the actual email sent (M53); "" when not recorded
	Note           string `json:"note"`
	FollowupDueAt  string `json:"followup_due_at"`
	FollowupDoneAt string `json:"followup_done_at"`
}

// OutreachInput logs a send. SentAt defaults to today. FollowupDueAt empty
// auto-arms from the configured interval unless NoFollowup is set. Body is the
// email text sent (optional).
type OutreachInput struct {
	SentAt        string `json:"sent_at"`
	Body          string `json:"body"`
	Note          string `json:"note"`
	FollowupDueAt string `json:"followup_due_at"`
	NoFollowup    bool   `json:"no_followup"`
}

const outreachLogCols = `id, contact_id, posting_id, sent_at, COALESCE(body, ''),
	COALESCE(note, ''), COALESCE(followup_due_at, ''), COALESCE(followup_done_at, '')`

func scanOutreachEntry(row interface{ Scan(...any) error }) (OutreachEntry, error) {
	var e OutreachEntry
	err := row.Scan(&e.ID, &e.ContactID, &e.PostingID, &e.SentAt, &e.Body, &e.Note, &e.FollowupDueAt, &e.FollowupDoneAt)
	return e, err
}

func (db *DB) readOutreachEntry(id int64) (OutreachEntry, error) {
	return scanOutreachEntry(db.QueryRow(`SELECT `+outreachLogCols+` FROM outreach_log WHERE id = ?`, id))
}

func parseDate(field, s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", nil
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return "", fmt.Errorf("%s must be a YYYY-MM-DD date", field)
	}
	return s, nil
}

// LogOutreach records a send to a contact about a posting, arms its follow-up,
// and clears the posting's "next up" to-do (the outreach went out). The contact
// must be active and belong to the posting's company. Validation errors carry
// the offending field's name as a prefix.
func (db *DB) LogOutreach(postingID, contactID string, in OutreachInput) (OutreachEntry, error) {
	sent, err := parseDate("sent_at", in.SentAt)
	if err != nil {
		return OutreachEntry{}, err
	}
	due, err := parseDate("followup_due_at", in.FollowupDueAt)
	if err != nil {
		return OutreachEntry{}, err
	}

	// The contact must exist, be active, and belong to the posting's company.
	var ok int
	err = db.QueryRow(`SELECT 1 FROM contacts c JOIN job_postings p ON p.company_id = c.company_id
	 WHERE c.id = ? AND p.id = ? AND c.archived_at IS NULL`, contactID, postingID).Scan(&ok)
	if err == sql.ErrNoRows {
		return OutreachEntry{}, fmt.Errorf("contact not found for this posting's company")
	}
	if err != nil {
		return OutreachEntry{}, err
	}

	if sent == "" {
		sent = time.Now().Format("2006-01-02")
	}

	// Bubble the reply status up the front of its axis: logging a send seeds the
	// posting's outreach_status to the first configured label (e.g. "initial
	// contact") when it's still blank — never overwriting a hand-set value. The
	// later reply states (replied / no response) stay manual; scout can't observe
	// them. Resolved before the tx so a settings read isn't inside it.
	firstStatus := ""
	if labels, lerr := db.OutreachStatuses(); lerr == nil && len(labels) > 0 {
		firstStatus = labels[0]
	}

	var dueVal sql.NullString
	switch {
	case in.NoFollowup:
		// leave NULL
	case due != "":
		dueVal = sql.NullString{String: due, Valid: true}
	default:
		n, _ := db.FollowupIntervalDays()
		if n > 0 {
			base, _ := time.Parse("2006-01-02", sent)
			dueVal = sql.NullString{String: addBusinessDays(base, n).Format("2006-01-02"), Valid: true}
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return OutreachEntry{}, err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO outreach_log (contact_id, posting_id, sent_at, body, note, followup_due_at)
	 VALUES (?, ?, ?, ?, ?, ?)`, contactID, postingID, sent, strings.TrimSpace(in.Body), strings.TrimSpace(in.Note), dueVal)
	if err != nil {
		return OutreachEntry{}, fmt.Errorf("log outreach: %w", err)
	}
	id, _ := res.LastInsertId()
	if _, err := tx.Exec(`UPDATE job_postings SET next_up_at = NULL WHERE id = ?`, postingID); err != nil {
		return OutreachEntry{}, err
	}
	if firstStatus != "" {
		if _, err := tx.Exec(`UPDATE job_postings SET outreach_status = ?
		 WHERE id = ? AND COALESCE(outreach_status, '') = ''`, firstStatus, postingID); err != nil {
			return OutreachEntry{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return OutreachEntry{}, err
	}
	return db.readOutreachEntry(id)
}

// ListOutreachForPosting returns a posting's send log, newest first. Empty
// (non-nil) when there are none. The pursuit panel groups these by contact.
func (db *DB) ListOutreachForPosting(postingID string) ([]OutreachEntry, error) {
	const q = `SELECT ` + outreachLogCols + ` FROM outreach_log
	 WHERE posting_id = ? ORDER BY sent_at DESC, id DESC`
	rows, err := db.Query(q, postingID)
	if err != nil {
		return nil, fmt.Errorf("list outreach: %w", err)
	}
	defer rows.Close()
	out := []OutreachEntry{}
	for rows.Next() {
		e, err := scanOutreachEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// OutreachEntryEdit is the full-state edit of a logged send. FollowupDueAt is
// literal — empty clears the follow-up. Done toggles the follow-up's completion
// (a newly-done entry is stamped now; reopening clears the stamp).
type OutreachEntryEdit struct {
	SentAt        string `json:"sent_at"`
	Body          string `json:"body"`
	Note          string `json:"note"`
	FollowupDueAt string `json:"followup_due_at"`
	Done          bool   `json:"done"`
}

// UpdateOutreachEntry edits a logged send. sql.ErrNoRows for an unknown id.
func (db *DB) UpdateOutreachEntry(id int64, e OutreachEntryEdit) (OutreachEntry, error) {
	sent, err := parseDate("sent_at", e.SentAt)
	if err != nil {
		return OutreachEntry{}, err
	}
	due, err := parseDate("followup_due_at", e.FollowupDueAt)
	if err != nil {
		return OutreachEntry{}, err
	}
	var dueVal sql.NullString
	if due != "" {
		dueVal = sql.NullString{String: due, Valid: true}
	}
	// COALESCE preserves an existing done timestamp; reopening clears it.
	doneExpr := "NULL"
	if e.Done {
		doneExpr = "COALESCE(followup_done_at, CURRENT_TIMESTAMP)"
	}
	args := []any{strings.TrimSpace(e.Body), strings.TrimSpace(e.Note), dueVal}
	q := `UPDATE outreach_log SET body = ?, note = ?, followup_due_at = ?, followup_done_at = ` + doneExpr
	if sent != "" {
		q += `, sent_at = ?`
		args = append(args, sent)
	}
	q += ` WHERE id = ?`
	args = append(args, id)
	res, err := db.Exec(q, args...)
	if err != nil {
		return OutreachEntry{}, fmt.Errorf("update outreach %d: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return OutreachEntry{}, sql.ErrNoRows
	}
	return db.readOutreachEntry(id)
}

// DeleteOutreachEntry removes a logged send. sql.ErrNoRows for an unknown id.
func (db *DB) DeleteOutreachEntry(id int64) error {
	res, err := db.Exec(`DELETE FROM outreach_log WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete outreach %d: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
