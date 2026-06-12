package store

import "database/sql"

// outreachDoctrineKey is the fixed primary key of the singleton doctrine row.
const outreachDoctrineKey = "default"

// GetOutreachDoctrine returns the saved outreach writing doctrine, or "" when
// none has been saved (the caller falls back to the compiled-in default).
func (db *DB) GetOutreachDoctrine() (string, error) {
	var c string
	err := db.QueryRow("SELECT content FROM outreach_doctrine WHERE key = ?", outreachDoctrineKey).Scan(&c)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return c, err
}

// PutOutreachDoctrine upserts the singleton doctrine row.
func (db *DB) PutOutreachDoctrine(content string) error {
	const q = `
INSERT INTO outreach_doctrine (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, outreachDoctrineKey, content)
	return err
}
