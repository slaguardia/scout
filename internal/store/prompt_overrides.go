package store

import "database/sql"

// GetStage returns one pipeline stage's saved prompt override (content) and
// whether the stage is enabled. No row → ("", true): the compiled-in default
// prompt, stage on.
func (db *DB) GetStage(stage string) (content string, enabled bool, err error) {
	var en int
	err = db.QueryRow("SELECT content, enabled FROM prompt_overrides WHERE stage = ?", stage).Scan(&content, &en)
	if err == sql.ErrNoRows {
		return "", true, nil
	}
	return content, en != 0, err
}

// PutPromptOverride upserts a stage's prompt override (content). A new row
// defaults enabled=1; an existing row keeps its enabled flag.
func (db *DB) PutPromptOverride(stage, content string) error {
	const q = `
INSERT INTO prompt_overrides (stage, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(stage) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, stage, content)
	return err
}

// SetStageEnabled upserts a stage's on/off flag, leaving any content override
// untouched (a new row defaults content=”).
func (db *DB) SetStageEnabled(stage string, enabled bool) error {
	en := 0
	if enabled {
		en = 1
	}
	const q = `
INSERT INTO prompt_overrides (stage, enabled, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(stage) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, stage, en)
	return err
}

// ResetStageContent clears a stage's content override (reverting it to the
// compiled-in default prompt) while leaving its enabled flag in place.
func (db *DB) ResetStageContent(stage string) error {
	_, err := db.Exec(`UPDATE prompt_overrides SET content = '', updated_at = CURRENT_TIMESTAMP WHERE stage = ?`, stage)
	return err
}
