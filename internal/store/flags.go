package store

import (
	"database/sql"
	"fmt"
)

// SetFlagged flags (flagged_at = now) or unflags (flagged_at = NULL) a company.
// The flag is the one hand-set bookmark, orthogonal to the verdict. Returns
// sql.ErrNoRows if the company doesn't exist, so the handler can answer 404
// rather than silently no-op.
func (db *DB) SetFlagged(companyID string, flagged bool) error {
	q := `UPDATE companies SET flagged_at = NULL WHERE id = ?`
	if flagged {
		q = `UPDATE companies SET flagged_at = CURRENT_TIMESTAMP WHERE id = ?`
	}
	res, err := db.Exec(q, companyID)
	if err != nil {
		return fmt.Errorf("set flagged %s: %w", companyID, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("set flagged %s: %w", companyID, err)
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
