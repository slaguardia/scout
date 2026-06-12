package store

import "database/sql"

// tasteFilterKey is the fixed primary key of the singleton pre-filter row.
const tasteFilterKey = "default"

// GetTasteFilter returns the saved pre-filter rules (raw TOML), or "" when none
// has been saved (the caller falls back to the compiled-in default).
func (db *DB) GetTasteFilter() (string, error) {
	var c string
	err := db.QueryRow("SELECT content FROM taste_filter WHERE key = ?", tasteFilterKey).Scan(&c)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return c, err
}

// PutTasteFilter upserts the singleton pre-filter row.
func (db *DB) PutTasteFilter(content string) error {
	const q = `
INSERT INTO taste_filter (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, tasteFilterKey, content)
	return err
}
