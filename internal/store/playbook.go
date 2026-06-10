package store

import "database/sql"

// playbookKey is the fixed primary key of the singleton playbook row.
const playbookKey = "default"

// GetPlaybook returns the saved verdict playbook, or "" when none has been saved
// (the caller falls back to the compiled-in default).
func (db *DB) GetPlaybook() (string, error) {
	var c string
	err := db.QueryRow("SELECT content FROM playbook WHERE key = ?", playbookKey).Scan(&c)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return c, err
}

// PutPlaybook upserts the singleton playbook row.
func (db *DB) PutPlaybook(content string) error {
	const q = `
INSERT INTO playbook (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, playbookKey, content)
	return err
}
