package store

import "database/sql"

// tasteFilterKey is the fixed primary key of the singleton pre-filter row.
const tasteFilterKey = "default"

// GetTasteFilter returns the saved pre-filter rules (raw TOML) and whether the
// filter is enabled. When no row has been saved it returns ("", true, nil) — no
// rules yet (the caller falls back to the compiled-in default) and on by default.
func (db *DB) GetTasteFilter() (content string, enabled bool, err error) {
	err = db.QueryRow("SELECT content, enabled FROM taste_filter WHERE key = ?", tasteFilterKey).Scan(&content, &enabled)
	if err == sql.ErrNoRows {
		return "", true, nil
	}
	return content, enabled, err
}

// PutTasteFilter upserts the singleton row's rules and enabled flag together
// (the editor saves both at once).
func (db *DB) PutTasteFilter(content string, enabled bool) error {
	const q = `
INSERT INTO taste_filter (key, content, enabled, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, tasteFilterKey, content, enabled)
	return err
}
