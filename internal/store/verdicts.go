package store

import (
	"database/sql"
	"fmt"
)

// Verdict is a row in the verdicts table.
type Verdict struct {
	CompanyID    int64
	Verdict      string
	Reason       string
	TasteVersion string
	Model        string
	ScoredAt     sql.NullString
}

// VerdictCandidate is a survivor with its enrichment, ready for scoring.
type VerdictCandidate struct {
	CompanyID      int64
	Name           string
	Domain         string
	Location       string
	Vertical       string
	Headcount      int64
	Stage          string
	WebsiteSummary string
}

// GetVerdict returns the latest verdict for a company, if any.
func (db *DB) GetVerdict(companyID int64) (*Verdict, error) {
	const q = `SELECT company_id, verdict, reason, taste_version, model, scored_at FROM verdicts WHERE company_id = ?`
	var v Verdict
	err := db.QueryRow(q, companyID).Scan(&v.CompanyID, &v.Verdict, &v.Reason, &v.TasteVersion, &v.Model, &v.ScoredAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// UpsertVerdict inserts or replaces a verdict. A first-pass upsert clears
// escalated_model (a re-score invalidates any prior escalation).
func (db *DB) UpsertVerdict(v Verdict) error {
	const q = `
INSERT INTO verdicts (company_id, verdict, reason, taste_version, model, scored_at, escalated_model)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
ON CONFLICT(company_id) DO UPDATE SET
    verdict         = excluded.verdict,
    reason          = excluded.reason,
    taste_version   = excluded.taste_version,
    model           = excluded.model,
    scored_at       = CURRENT_TIMESTAMP,
    escalated_model = NULL;`
	if _, err := db.Exec(q, v.CompanyID, v.Verdict, v.Reason, v.TasteVersion, v.Model); err != nil {
		return fmt.Errorf("upsert verdict %d: %w", v.CompanyID, err)
	}
	return nil
}

// UpsertEscalatedVerdict overwrites a verdict with the second-pass result
// from an escalation model, recording which model did the re-score so the
// next run can skip rows that already escalated to the same model.
func (db *DB) UpsertEscalatedVerdict(v Verdict, escalatedModel string) error {
	const q = `
INSERT INTO verdicts (company_id, verdict, reason, taste_version, model, scored_at, escalated_model)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
ON CONFLICT(company_id) DO UPDATE SET
    verdict         = excluded.verdict,
    reason          = excluded.reason,
    taste_version   = excluded.taste_version,
    model           = excluded.model,
    scored_at       = CURRENT_TIMESTAMP,
    escalated_model = excluded.escalated_model;`
	if _, err := db.Exec(q, v.CompanyID, v.Verdict, v.Reason, v.TasteVersion, v.Model, escalatedModel); err != nil {
		return fmt.Errorf("upsert escalated verdict %d: %w", v.CompanyID, err)
	}
	return nil
}

// MaybesNeedingEscalation returns company_ids that are currently scored 'maybe'
// at the given taste_version AND have not yet been escalated with the given
// model (escalated_model is NULL or differs).
func (db *DB) MaybesNeedingEscalation(tasteVersion, escalateModel string) ([]int64, error) {
	const q = `
SELECT company_id FROM verdicts
WHERE verdict = 'maybe'
  AND taste_version = ?
  AND (escalated_model IS NULL OR escalated_model != ?)`
	rows, err := db.Query(q, tasteVersion, escalateModel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CountVerdictsByVerdict returns a histogram for stats.
func (db *DB) CountVerdictsByVerdict() (map[string]int, error) {
	rows, err := db.Query(`SELECT verdict, COUNT(1) FROM verdicts GROUP BY verdict`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}
