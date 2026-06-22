package store

import "database/sql"

// AnthropicKeySetting is the settings key holding the UI-stored Anthropic API key.
const AnthropicKeySetting = "anthropic_api_key"

// OutreachCursorSetting holds the brain's change cursor as of the last outreach-
// knowledge discovery. It drives the change-aware auto-sync (outreach.EnsureKnowledge):
// scout compares it against the brain's current cursor to re-discover only when
// the brain actually moved — no manual "Refresh sources" step.
const OutreachCursorSetting = "outreach_knowledge_cursor"

// GetSetting returns the stored value for key, or "" when unset.
func (db *DB) GetSetting(key string) (string, error) {
	var v string
	err := db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return v, err
}

// SetSetting upserts key = value.
func (db *DB) SetSetting(key, value string) error {
	const q = `
INSERT INTO settings (key, value, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, key, value)
	return err
}

// DeleteSetting removes key. No error if it was already absent.
func (db *DB) DeleteSetting(key string) error {
	_, err := db.Exec("DELETE FROM settings WHERE key = ?", key)
	return err
}
