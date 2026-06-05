package store

import "fmt"

// VerdictOverride is one durable record of a hand-set verdict from the UI: the
// delta (from → to), the reason the user gave, and the criteria version in
// effect at the time. Append-only; never updated, never written to the brain.
type VerdictOverride struct {
	CompanyID       string
	FromVerdict     string // prior verdict being replaced; "" if the company was unscored
	ToVerdict       string
	Reason          string
	CriteriaVersion string
}

// InsertVerdictOverride appends one override record. Unlike the verdict_trace
// rows (a disposable debug aid), this table is a record of intent.
func (db *DB) InsertVerdictOverride(o VerdictOverride) error {
	const q = `
INSERT INTO verdict_override (company_id, from_verdict, to_verdict, reason, criteria_version)
VALUES (?, ?, ?, ?, ?)`
	if _, err := db.Exec(q,
		o.CompanyID, nullIfEmpty(o.FromVerdict), o.ToVerdict, o.Reason, nullIfEmpty(o.CriteriaVersion),
	); err != nil {
		return fmt.Errorf("insert verdict override %s: %w", o.CompanyID, err)
	}
	return nil
}
