package store

import (
	"encoding/json"
	"fmt"
)

// TraceFact is one fact the brain returned for a per-company recall, with the
// flag for whether it cleared the relevance floor and was injected into the
// prompt (used) or dropped as noise.
type TraceFact struct {
	Fact  string  `json:"fact"`
	Name  string  `json:"name,omitempty"`
	Score float64 `json:"score"`
	Used  bool    `json:"used"`
}

// TraceEpisode is an episode body the brain returned for a recall. Scout does
// NOT inject these into the per-company verdict prompt today — they're recorded
// so the trail surfaces what the brain knows but scout ignores.
type TraceEpisode struct {
	Name string `json:"name,omitempty"`
	Body string `json:"body"`
}

// VerdictTrace is one append-only record of a scoring pass: what scout asked
// the brain, what came back, and the verdict it produced. Written by the
// scorer; never updated.
type VerdictTrace struct {
	CompanyID      string
	RunID          string
	Model          string
	TasteVersion   string
	CriteriaSource string
	BrainQuery     string
	BrainStatus    string // "ok" | "error" | "empty" | "disabled"
	BrainError     string
	BrainFacts     []TraceFact
	BrainEpisodes  []TraceEpisode
	Verdict        string
	Reason         string
}

// InsertVerdictTrace appends one decision-trail row. Best-effort: the caller
// logs and ignores errors so a trace write never fails a verdict.
func (db *DB) InsertVerdictTrace(t VerdictTrace) error {
	facts, _ := json.Marshal(t.BrainFacts)
	eps, _ := json.Marshal(t.BrainEpisodes)
	const q = `
INSERT INTO verdict_trace
  (company_id, run_id, model, taste_version, criteria_source,
   brain_query, brain_status, brain_error, brain_facts, brain_episodes,
   verdict, reason)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := db.Exec(q,
		t.CompanyID, nullIfEmpty(t.RunID), t.Model, t.TasteVersion,
		nullIfEmpty(t.CriteriaSource), nullIfEmpty(t.BrainQuery), t.BrainStatus,
		nullIfEmpty(t.BrainError), string(facts), string(eps), t.Verdict, t.Reason)
	if err != nil {
		return fmt.Errorf("insert verdict trace %s: %w", t.CompanyID, err)
	}
	return nil
}

// TraceEvent is one decision-trail entry for the UI. JSON-tagged for direct
// serialization by the detail endpoint.
type TraceEvent struct {
	ID             int64          `json:"id"`
	RunID          string         `json:"run_id"`
	Model          string         `json:"model"`
	TasteVersion   string         `json:"taste_version"`
	CriteriaSource string         `json:"criteria_source"`
	BrainQuery     string         `json:"brain_query"`
	BrainStatus    string         `json:"brain_status"`
	BrainError     string         `json:"brain_error"`
	BrainFacts     []TraceFact    `json:"brain_facts"`
	BrainEpisodes  []TraceEpisode `json:"brain_episodes"`
	Verdict        string         `json:"verdict"`
	Reason         string         `json:"reason"`
	ScoredAt       string         `json:"scored_at"`
}

// CompanyTrace returns the full decision trail for one company, oldest first —
// the chronological timeline of every scoring pass.
func (db *DB) CompanyTrace(companyID string) ([]TraceEvent, error) {
	const q = `
SELECT id, COALESCE(run_id,''), model, taste_version,
       COALESCE(criteria_source,''), COALESCE(brain_query,''), brain_status,
       COALESCE(brain_error,''), COALESCE(brain_facts,''), COALESCE(brain_episodes,''),
       verdict, reason, scored_at
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
		var facts, eps string
		if err := rows.Scan(&e.ID, &e.RunID, &e.Model, &e.TasteVersion,
			&e.CriteriaSource, &e.BrainQuery, &e.BrainStatus, &e.BrainError,
			&facts, &eps, &e.Verdict, &e.Reason, &e.ScoredAt); err != nil {
			return nil, err
		}
		e.BrainFacts = []TraceFact{}
		e.BrainEpisodes = []TraceEpisode{}
		if facts != "" {
			_ = json.Unmarshal([]byte(facts), &e.BrainFacts)
		}
		if eps != "" {
			_ = json.Unmarshal([]byte(eps), &e.BrainEpisodes)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
