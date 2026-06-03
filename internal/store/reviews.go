package store

import (
	"database/sql"
	"fmt"
)

// SetReviewed marks a company reviewed (reviewed_at = now) or new again
// (reviewed_at = NULL). Returns sql.ErrNoRows if the company doesn't exist, so
// the handler can answer 404 rather than silently no-op. Review state is the
// user's triage acknowledgement — independent of the verdict.
func (db *DB) SetReviewed(companyID string, reviewed bool) error {
	var q string
	if reviewed {
		q = `UPDATE companies SET reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
	} else {
		q = `UPDATE companies SET reviewed_at = NULL WHERE id = ?`
	}
	res, err := db.Exec(q, companyID)
	if err != nil {
		return fmt.Errorf("set reviewed %s: %w", companyID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("set reviewed %s: %w", companyID, err)
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
