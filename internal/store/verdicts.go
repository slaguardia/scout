package store

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
)

// VerdictHash is the dedup key for episode write-back: sha256[:12] of the
// decision content (verdict + reason). A capture is re-sent only when this
// changes — i.e. when the decision itself is new or different — independent of
// the (brain-derived) taste_version.
func VerdictHash(verdict, reason string) string {
	sum := sha256.Sum256([]byte(verdict + "\n" + reason))
	return hex.EncodeToString(sum[:])[:12]
}

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

// MarkEpisodeSent records that a verdict's decision was captured to the brain.
// episodes_sent holds exactly the LAST captured decision per company: any
// prior hash is cleared. So if a verdict re-scores to a new decision and later
// reverts to an earlier one, the revert is treated as new and re-captured —
// otherwise the brain would keep holding the stale intermediate verdict.
func (db *DB) MarkEpisodeSent(companyID int64, verdictHash string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(
		`DELETE FROM episodes_sent WHERE company_id = ? AND verdict_hash != ?`,
		companyID, verdictHash); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`INSERT OR IGNORE INTO episodes_sent (company_id, verdict_hash) VALUES (?, ?)`,
		companyID, verdictHash); err != nil {
		return err
	}
	return tx.Commit()
}

// EpisodeSent reports whether a verdict's current decision has been captured.
func (db *DB) EpisodeSent(companyID int64, verdictHash string) (sentAt string, ok bool, err error) {
	var at sql.NullString
	err = db.QueryRow(
		`SELECT sent_at FROM episodes_sent WHERE company_id = ? AND verdict_hash = ?`,
		companyID, verdictHash,
	).Scan(&at)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return at.String, at.Valid, nil
}

// PendingEpisodes returns verdicts whose current decision (verdict + reason)
// hasn't been captured to the brain. Dedup is keyed on the content hash, so a
// verdict re-captures only when its decision changes — not when the
// brain-derived taste_version shifts. SQLite has no sha256, so the diff is
// computed in Go.
func (db *DB) PendingEpisodes() ([]Verdict, error) {
	sent, err := db.sentHashes()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(
		`SELECT company_id, verdict, reason, taste_version, model, scored_at FROM verdicts`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Verdict
	for rows.Next() {
		var v Verdict
		if err := rows.Scan(&v.CompanyID, &v.Verdict, &v.Reason, &v.TasteVersion, &v.Model, &v.ScoredAt); err != nil {
			return nil, err
		}
		if _, ok := sent[sentKey{v.CompanyID, VerdictHash(v.Verdict, v.Reason)}]; !ok {
			out = append(out, v)
		}
	}
	return out, rows.Err()
}

type sentKey struct {
	companyID int64
	hash      string
}

func (db *DB) sentHashes() (map[sentKey]struct{}, error) {
	rows, err := db.Query(`SELECT company_id, verdict_hash FROM episodes_sent`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[sentKey]struct{}{}
	for rows.Next() {
		var k sentKey
		if err := rows.Scan(&k.companyID, &k.hash); err != nil {
			return nil, err
		}
		out[k] = struct{}{}
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
