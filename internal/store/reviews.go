package store

import (
	"database/sql"
	"fmt"
)

// SetReviewed marks a company reviewed (reviewed_at = now) or new again
// (reviewed_at = NULL). Review state is the user's triage acknowledgement —
// independent of the verdict.
func (db *DB) SetReviewed(companyID string, reviewed bool) error {
	return db.setCompanyMark(companyID, "reviewed_at", reviewed)
}

// SetFlagged flags (flagged_at = now) or unflags (flagged_at = NULL) a company.
// A flag is a hand-set bookmark, orthogonal to verdict and review state.
func (db *DB) SetFlagged(companyID string, flagged bool) error {
	return db.setCompanyMark(companyID, "flagged_at", flagged)
}

// setCompanyMark sets or clears one of the user-mark timestamp columns. The
// column name is a compile-time constant from the wrappers above — never user
// input. Returns sql.ErrNoRows if the company doesn't exist, so handlers can
// answer 404 rather than silently no-op.
func (db *DB) setCompanyMark(companyID, column string, on bool) error {
	q := `UPDATE companies SET ` + column + ` = NULL WHERE id = ?`
	if on {
		q = `UPDATE companies SET ` + column + ` = CURRENT_TIMESTAMP WHERE id = ?`
	}
	res, err := db.Exec(q, companyID)
	if err != nil {
		return fmt.Errorf("set %s %s: %w", column, companyID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("set %s %s: %w", column, companyID, err)
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
