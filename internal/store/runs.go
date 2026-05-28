package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Run is a durable record of a pipeline run.
type Run struct {
	ID           string         `json:"id"`
	Stage        string         `json:"stage"`
	Status       string         `json:"status"`
	StartedAt    string         `json:"started_at"`
	FinishedAt   string         `json:"finished_at"`
	TasteVersion string         `json:"taste_version"`
	Summary      map[string]any `json:"summary"`
	Error        string         `json:"error"`
}

// InsertRun records the start of a run (status 'running').
func (db *DB) InsertRun(id, stage, tasteVersion string) error {
	const q = `INSERT INTO runs (id, stage, status, started_at, taste_version)
	           VALUES (?, ?, 'running', ?, ?)`
	_, err := db.Exec(q, id, stage, time.Now().UTC().Format(time.RFC3339), nullIfEmpty(tasteVersion))
	if err != nil {
		return fmt.Errorf("insert run: %w", err)
	}
	return nil
}

// FinishRun updates a run with its terminal status and summary. summary may be
// nil; errMsg may be "".
func (db *DB) FinishRun(id, status string, summary map[string]any, errMsg string) error {
	var summaryJSON sql.NullString
	if summary != nil {
		b, _ := json.Marshal(summary)
		summaryJSON = sql.NullString{String: string(b), Valid: true}
	}
	const q = `UPDATE runs SET status = ?, finished_at = ?, summary = ?, error = ? WHERE id = ?`
	_, err := db.Exec(q, status, time.Now().UTC().Format(time.RFC3339), summaryJSON, nullIfEmpty(errMsg), id)
	if err != nil {
		return fmt.Errorf("finish run %s: %w", id, err)
	}
	return nil
}

// ListRuns returns the most recent runs, newest first.
func (db *DB) ListRuns(limit int) ([]Run, error) {
	if limit <= 0 {
		limit = 30
	}
	const q = `SELECT id, stage, status, started_at, COALESCE(finished_at,''),
	                  COALESCE(taste_version,''), COALESCE(summary,''), COALESCE(error,'')
	           FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?`
	rows, err := db.Query(q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Run
	for rows.Next() {
		var r Run
		var summaryJSON string
		if err := rows.Scan(&r.ID, &r.Stage, &r.Status, &r.StartedAt, &r.FinishedAt,
			&r.TasteVersion, &summaryJSON, &r.Error); err != nil {
			return nil, err
		}
		if summaryJSON != "" {
			_ = json.Unmarshal([]byte(summaryJSON), &r.Summary)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
