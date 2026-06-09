package store

import "database/sql"

// OutreachConfig is the persisted form of the outreach pipeline's knobs: the
// lint word window, the subject-line format template, and the email structure
// (stored as a JSON array of slots; "" means the compiled-in default). It is a
// singleton in the local DB, set from the UI — no values are baked into the
// repo beyond the migration's defaults. The domain layer (internal/outreach)
// owns parsing, validation, and the default fallbacks.
type OutreachConfig struct {
	WordMin       int    `json:"word_min"`
	WordMax       int    `json:"word_max"`
	SubjectFormat string `json:"subject_format"`
	Structure     string `json:"structure"` // JSON array of slots; "" = default
}

// outreachConfigKey is the fixed primary key of the singleton config row.
const outreachConfigKey = "default"

// GetOutreachConfig returns the stored config, or (nil, nil) when the UI has
// never set one — callers fall back to the compiled-in defaults.
func (db *DB) GetOutreachConfig() (*OutreachConfig, error) {
	const q = `SELECT word_min, word_max, subject_format, structure
FROM outreach_config WHERE key = ?`
	var c OutreachConfig
	err := db.QueryRow(q, outreachConfigKey).Scan(&c.WordMin, &c.WordMax, &c.SubjectFormat, &c.Structure)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// PutOutreachConfig upserts the singleton config row.
func (db *DB) PutOutreachConfig(c OutreachConfig) error {
	const q = `
INSERT INTO outreach_config (key, word_min, word_max, subject_format, structure, updated_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
    word_min       = excluded.word_min,
    word_max       = excluded.word_max,
    subject_format = excluded.subject_format,
    structure      = excluded.structure,
    updated_at     = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, outreachConfigKey, c.WordMin, c.WordMax, c.SubjectFormat, c.Structure)
	return err
}
