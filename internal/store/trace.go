package store

import "fmt"

// VerdictTrace is one append-only record of a scoring pass: which criteria
// (source + version) and model drove the verdict, and the verdict it produced.
// Written by the scorer; never updated.
type VerdictTrace struct {
	CompanyID      string
	RunID          string
	Model          string
	TasteVersion   string
	CriteriaSource string
	Verdict        string
	Reason         string
}

// InsertVerdictTrace appends one decision-trail row. Best-effort: the caller
// logs and ignores errors so a trace write never fails a verdict.
func (db *DB) InsertVerdictTrace(t VerdictTrace) error {
	const q = `
INSERT INTO verdict_trace
  (company_id, run_id, model, taste_version, criteria_source, verdict, reason)
VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err := db.Exec(q,
		t.CompanyID, nullIfEmpty(t.RunID), t.Model, t.TasteVersion,
		nullIfEmpty(t.CriteriaSource), t.Verdict, t.Reason)
	if err != nil {
		return fmt.Errorf("insert verdict trace %s: %w", t.CompanyID, err)
	}
	return nil
}

// TraceEvent is one decision-trail entry for the UI. JSON-tagged for direct
// serialization by the detail endpoint.
type TraceEvent struct {
	ID             int64  `json:"id"`
	RunID          string `json:"run_id"`
	Model          string `json:"model"`
	TasteVersion   string `json:"taste_version"`
	CriteriaSource string `json:"criteria_source"`
	Verdict        string `json:"verdict"`
	Reason         string `json:"reason"`
	ScoredAt       string `json:"scored_at"`
}

// CompanyTrace returns the full decision trail for one company, oldest first —
// the chronological timeline of every scoring pass.
func (db *DB) CompanyTrace(companyID string) ([]TraceEvent, error) {
	const q = `
SELECT id, COALESCE(run_id,''), model, taste_version,
       COALESCE(criteria_source,''), verdict, reason, scored_at
FROM verdict_trace
WHERE company_id = ?
ORDER BY scored_at ASC, id ASC`
	rows, err := db.Query(q, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TraceEvent{}
	for rows.Next() {
		var e TraceEvent
		if err := rows.Scan(&e.ID, &e.RunID, &e.Model, &e.TasteVersion,
			&e.CriteriaSource, &e.Verdict, &e.Reason, &e.ScoredAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
