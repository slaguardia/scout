package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// StageEvent is one entry in a posting's application-stage history: a stage
// label (from the configurable application_stages vocabulary) and the date it
// was reached. The history is an ordered JSON array of these, stored opaquely on
// the posting's stage_history column; the current stage is the last entry.
type StageEvent struct {
	Stage string `json:"stage"`
	Date  string `json:"date"` // "YYYY-MM-DD"
}

// ParseStageHistory parses a stage_history JSON string into events, tolerating
// empty/blank/garbage by returning nil (the UI owns the canonical shape). Stages
// are trimmed and blank-stage entries dropped.
func ParseStageHistory(s string) []StageEvent {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	var raw []StageEvent
	if err := json.Unmarshal([]byte(s), &raw); err != nil {
		return nil
	}
	out := make([]StageEvent, 0, len(raw))
	for _, e := range raw {
		e.Stage = strings.TrimSpace(e.Stage)
		e.Date = strings.TrimSpace(e.Date)
		if e.Stage != "" {
			out = append(out, e)
		}
	}
	return out
}

// CurrentStage returns the posting's current application stage — the last entry
// in its history — or "" when untracked.
func CurrentStage(stageHistory string) string {
	ev := ParseStageHistory(stageHistory)
	if len(ev) == 0 {
		return ""
	}
	return ev[len(ev)-1].Stage
}

// marshalStageHistory serializes events, returning "" for an empty list.
func marshalStageHistory(ev []StageEvent) string {
	if len(ev) == 0 {
		return ""
	}
	b, _ := json.Marshal(ev)
	return string(b)
}

// AppendStageEvent appends a stage to a posting's history (date defaults to
// today, UTC, when blank) and returns the refreshed posting. The chat
// track-application tool uses this to advance a posting's stage; the web UI owns
// the array directly via the tracking PUT. Returns sql.ErrNoRows for an unknown
// posting; an empty stage or malformed date is rejected.
func (db *DB) AppendStageEvent(postingID, stage, date string) (Posting, error) {
	stage = strings.TrimSpace(stage)
	if stage == "" {
		return Posting{}, fmt.Errorf("stage is required")
	}
	if len(stage) > maxStatusLabelLen {
		return Posting{}, fmt.Errorf("stage label is too long")
	}
	date = strings.TrimSpace(date)
	if date == "" {
		date = time.Now().UTC().Format("2006-01-02")
	} else if _, err := time.Parse("2006-01-02", date); err != nil {
		return Posting{}, fmt.Errorf("stage date must be a YYYY-MM-DD date")
	}
	cur, err := db.GetPosting(postingID)
	if err != nil {
		return Posting{}, err
	}
	if cur == nil {
		return Posting{}, sql.ErrNoRows
	}
	ev := append(ParseStageHistory(cur.StageHistory), StageEvent{Stage: stage, Date: date})
	res, err := db.Exec(`UPDATE job_postings SET stage_history = ? WHERE id = ?`,
		NullString(marshalStageHistory(ev)), postingID)
	if err != nil {
		return Posting{}, fmt.Errorf("append stage event %s: %w", postingID, err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return Posting{}, sql.ErrNoRows
	}
	return db.readPosting(postingID)
}
