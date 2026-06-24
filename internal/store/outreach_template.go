package store

import "database/sql"

// outreachTemplateKey is the fixed primary key of the singleton email-template
// row; followupTemplateKey is the parallel singleton for the follow-up template
// (M53) — both live in outreach_template, keyed apart.
const (
	outreachTemplateKey = "default"
	followupTemplateKey = "followup"
)

// GetOutreachTemplate returns the saved email template, or "" when none has been
// saved (the caller falls back to the compiled-in default).
func (db *DB) GetOutreachTemplate() (string, error) {
	var c string
	err := db.QueryRow("SELECT content FROM outreach_template WHERE key = ?", outreachTemplateKey).Scan(&c)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return c, err
}

// PutOutreachTemplate upserts the singleton template row.
func (db *DB) PutOutreachTemplate(content string) error {
	return db.putTemplate(outreachTemplateKey, content)
}

// GetFollowupTemplate returns the saved follow-up template, or "" when none has
// been saved (the caller falls back to the compiled-in default).
func (db *DB) GetFollowupTemplate() (string, error) {
	var c string
	err := db.QueryRow("SELECT content FROM outreach_template WHERE key = ?", followupTemplateKey).Scan(&c)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return c, err
}

// PutFollowupTemplate upserts the singleton follow-up template row.
func (db *DB) PutFollowupTemplate(content string) error {
	return db.putTemplate(followupTemplateKey, content)
}

func (db *DB) putTemplate(key, content string) error {
	const q = `
INSERT INTO outreach_template (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, key, content)
	return err
}
