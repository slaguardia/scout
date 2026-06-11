package store

import (
	"database/sql"
	"fmt"
)

// Outreach draft statuses. Terminal: sent, failed, superseded. Active (at most
// one per posting): researching, awaiting_review, no_hook.
const (
	DraftResearching    = "researching"
	DraftAwaitingReview = "awaiting_review"
	DraftNoHook         = "no_hook"
	DraftSent           = "sent"
	DraftFailed         = "failed"
	// DraftSuperseded is an awaiting_review/no_hook draft retired by a
	// regenerate: kept in history (the user can still read it) but no longer
	// active, so a fresh draft can take its place.
	DraftSuperseded = "superseded"
)

// OutreachDraft is one pipeline run against a posting. Draft is what the
// pipeline assembled; Edited (when non-empty) is the user's revision and wins.
// Research/Hook/Lint/Violations carry stage outputs as JSON for the panel.
type OutreachDraft struct {
	ID         int64  `json:"id"`
	PostingID  string `json:"posting_id"`
	Status     string `json:"status"`
	Research   string `json:"research"`
	Hook       string `json:"hook"`
	Draft      string `json:"draft"`
	Edited     string `json:"edited"`
	Lint       string `json:"lint"`
	Violations string `json:"violations"`
	FailReason string `json:"fail_reason"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
	SentAt     string `json:"sent_at,omitempty"`
}

const draftCols = `id, posting_id, status, research, hook, draft, edited, lint,
violations, fail_reason, created_at, updated_at, COALESCE(sent_at, '')`

func scanDraft(row interface{ Scan(...any) error }) (*OutreachDraft, error) {
	var d OutreachDraft
	err := row.Scan(&d.ID, &d.PostingID, &d.Status, &d.Research, &d.Hook, &d.Draft,
		&d.Edited, &d.Lint, &d.Violations, &d.FailReason, &d.CreatedAt, &d.UpdatedAt, &d.SentAt)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// CreateOutreachDraft starts a new draft for a posting. It refuses (with an
// error mentioning "active draft") when one is already in a non-terminal
// status — one review at a time per posting.
func (db *DB) CreateOutreachDraft(postingID string) (*OutreachDraft, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM job_postings WHERE id = ?`, postingID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists == 0 {
		return nil, sql.ErrNoRows
	}

	var active int
	err = tx.QueryRow(`SELECT COUNT(1) FROM outreach_drafts
WHERE posting_id = ? AND status IN (?, ?, ?)`,
		postingID, DraftResearching, DraftAwaitingReview, DraftNoHook).Scan(&active)
	if err != nil {
		return nil, err
	}
	if active > 0 {
		return nil, fmt.Errorf("posting %s already has an active draft", postingID)
	}

	d, err := insertDraftTx(tx, postingID)
	if err != nil {
		return nil, err
	}
	return d, tx.Commit()
}

// RegenerateOutreachDraft retires the posting's current awaiting_review/no_hook
// draft (→ superseded, kept in history) and starts a fresh one — the way to
// re-draft after backfilling experience/template/company info. It refuses while
// a draft is still researching (that run is pipeline-owned and in flight).
func (db *DB) RegenerateOutreachDraft(postingID string) (*OutreachDraft, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM job_postings WHERE id = ?`, postingID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists == 0 {
		return nil, sql.ErrNoRows
	}

	var researching int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM outreach_drafts
WHERE posting_id = ? AND status = ?`, postingID, DraftResearching).Scan(&researching); err != nil {
		return nil, err
	}
	if researching > 0 {
		return nil, fmt.Errorf("posting %s already has an active draft", postingID)
	}

	if _, err := tx.Exec(`UPDATE outreach_drafts SET status = ?, updated_at = CURRENT_TIMESTAMP
WHERE posting_id = ? AND status IN (?, ?)`,
		DraftSuperseded, postingID, DraftAwaitingReview, DraftNoHook); err != nil {
		return nil, err
	}

	d, err := insertDraftTx(tx, postingID)
	if err != nil {
		return nil, err
	}
	return d, tx.Commit()
}

// insertDraftTx inserts a fresh researching draft and returns it, within the
// caller's transaction.
func insertDraftTx(tx *sql.Tx, postingID string) (*OutreachDraft, error) {
	res, err := tx.Exec(`INSERT INTO outreach_drafts (posting_id) VALUES (?)`, postingID)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return scanDraft(tx.QueryRow(`SELECT `+draftCols+` FROM outreach_drafts WHERE id = ?`, id))
}

// GetOutreachDraft returns one draft, or (nil, nil) when absent.
func (db *DB) GetOutreachDraft(id int64) (*OutreachDraft, error) {
	d, err := scanDraft(db.QueryRow(`SELECT `+draftCols+` FROM outreach_drafts WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return d, err
}

// ListOutreachDrafts returns a posting's drafts, newest first.
func (db *DB) ListOutreachDrafts(postingID string) ([]OutreachDraft, error) {
	rows, err := db.Query(`SELECT `+draftCols+` FROM outreach_drafts
WHERE posting_id = ? ORDER BY id DESC`, postingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OutreachDraft
	for rows.Next() {
		d, err := scanDraft(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

// SetOutreachDraftResult records a pipeline outcome: the new status plus any
// stage outputs. Empty strings overwrite (stages own their fields).
func (db *DB) SetOutreachDraftResult(id int64, status, research, hook, draft, lint, violations, failReason string) error {
	res, err := db.Exec(`UPDATE outreach_drafts SET
status = ?, research = ?, hook = ?, draft = ?, lint = ?, violations = ?,
fail_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		status, research, hook, draft, lint, violations, failReason, id)
	if err != nil {
		return err
	}
	return mustAffect(res)
}

// SetOutreachDraftEdited stores the user's revision and its lint findings.
func (db *DB) SetOutreachDraftEdited(id int64, edited, lint string) error {
	res, err := db.Exec(`UPDATE outreach_drafts SET
edited = ?, lint = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, edited, lint, id)
	if err != nil {
		return err
	}
	return mustAffect(res)
}

// MarkOutreachDraftSent flips a draft to sent and, in the same transaction,
// bumps the posting's outreach_count and stamps last_outreach_at — the send
// date is what makes Touch-2 follow-ups cheap later.
func (db *DB) MarkOutreachDraftSent(id int64) (*OutreachDraft, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`UPDATE outreach_drafts SET
status = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND status != ?`, DraftSent, id, DraftSent)
	if err != nil {
		return nil, err
	}
	if err := mustAffect(res); err != nil {
		// Idempotent double-send: an already-sent draft returns itself (the
		// panel's Mark-sent can be double-clicked); only a missing row errors.
		if d, gErr := scanDraft(tx.QueryRow(`SELECT `+draftCols+` FROM outreach_drafts WHERE id = ?`, id)); gErr == nil && d.Status == DraftSent {
			return d, tx.Commit()
		}
		return nil, err
	}
	// The send completes the "next up" to-do, so the queue mark clears too.
	if _, err := tx.Exec(`UPDATE job_postings SET
outreach_count = outreach_count + 1, last_outreach_at = DATE('now'), next_up_at = NULL
WHERE id = (SELECT posting_id FROM outreach_drafts WHERE id = ?)`, id); err != nil {
		return nil, err
	}
	d, err := scanDraft(tx.QueryRow(`SELECT `+draftCols+` FROM outreach_drafts WHERE id = ?`, id))
	if err != nil {
		return nil, err
	}
	return d, tx.Commit()
}

func mustAffect(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ReapStuckOutreachDrafts fails any draft stuck in `researching` longer than
// olderThanMinutes (0 = all of them). A row only stays in researching while an
// engine goroutine is live; after a server restart (or a crash the catch-all
// couldn't see) the row is orphaned — it blocks new drafts for its posting and
// the panel polls it forever. Called at serve startup, before any new work.
func (db *DB) ReapStuckOutreachDrafts(olderThanMinutes int) (int64, error) {
	res, err := db.Exec(`UPDATE outreach_drafts SET
status = ?, fail_reason = 'interrupted — scout restarted mid-run',
updated_at = CURRENT_TIMESTAMP
WHERE status = ? AND updated_at <= datetime('now', ?)`,
		DraftFailed, DraftResearching, fmt.Sprintf("-%d minutes", olderThanMinutes))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
