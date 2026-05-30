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

// UpsertVerdict inserts or replaces a verdict for a company.
func (db *DB) UpsertVerdict(v Verdict) error {
	const q = `
INSERT INTO verdicts (company_id, verdict, reason, taste_version, model, scored_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(company_id) DO UPDATE SET
    verdict       = excluded.verdict,
    reason        = excluded.reason,
    taste_version = excluded.taste_version,
    model         = excluded.model,
    scored_at     = CURRENT_TIMESTAMP;`
	if _, err := db.Exec(q, v.CompanyID, v.Verdict, v.Reason, v.TasteVersion, v.Model); err != nil {
		return fmt.Errorf("upsert verdict %d: %w", v.CompanyID, err)
	}
	return nil
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
