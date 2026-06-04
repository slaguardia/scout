package store

import (
	"database/sql"
	"fmt"
)

// The two hand-set company marks, orthogonal to the verdict:
//   - flagged_at  — a bookmark, toggled on/off
//   - reviewed_at — a last-reviewed stamp, refreshed on every "Mark reviewed"
//
// Both return sql.ErrNoRows for an unknown company so handlers can answer 404
// rather than silently no-op.

// SetFlagged flags (flagged_at = now) or unflags (flagged_at = NULL) a company.
func (db *DB) SetFlagged(companyID string, flagged bool) error {
	q := `UPDATE companies SET flagged_at = NULL WHERE id = ?`
	if flagged {
		q = `UPDATE companies SET flagged_at = CURRENT_TIMESTAMP WHERE id = ?`
	}
	return db.execMark(q, companyID, "flagged")
}

// TouchReviewed stamps a company as reviewed now. Repeated calls keep moving
// the stamp forward — the table sorts on it, so the user can cycle through
// companies oldest-reviewed-first instead of always landing on the same ones.
func (db *DB) TouchReviewed(companyID string) error {
	return db.execMark(`UPDATE companies SET reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`, companyID, "reviewed")
}

func (db *DB) execMark(q, companyID, what string) error {
	res, err := db.Exec(q, companyID)
	if err != nil {
		return fmt.Errorf("set %s %s: %w", what, companyID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("set %s %s: %w", what, companyID, err)
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
