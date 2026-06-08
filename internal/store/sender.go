package store

import "database/sql"

// SenderIdentity is the outreach pipeline's "who am I writing for": the
// subject-line name, the verbatim sign-off, and the three prompt-framing lines
// (researcher lens, hook preferences, drafter arc). It is persisted only in the
// local DB and set from the UI — the repo ships a neutral compiled-in default,
// so a real identity is never committed.
type SenderIdentity struct {
	SubjectName string `json:"subject_name"`
	Signature   string `json:"signature"`
	Lens        string `json:"lens"`
	HookPrefs   string `json:"hook_prefs"`
	Arc         string `json:"arc"`
}

// senderKey is the fixed primary key of the singleton sender row.
const senderKey = "default"

// GetSenderIdentity returns the stored sender, or (nil, nil) when the UI has
// never set one — callers fall back to the compiled-in default.
func (db *DB) GetSenderIdentity() (*SenderIdentity, error) {
	const q = `SELECT subject_name, signature, lens, hook_prefs, arc
FROM outreach_sender WHERE key = ?`
	var s SenderIdentity
	err := db.QueryRow(q, senderKey).Scan(&s.SubjectName, &s.Signature, &s.Lens, &s.HookPrefs, &s.Arc)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// PutSenderIdentity upserts the singleton sender row.
func (db *DB) PutSenderIdentity(s SenderIdentity) error {
	const q = `
INSERT INTO outreach_sender (key, subject_name, signature, lens, hook_prefs, arc, updated_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
    subject_name = excluded.subject_name,
    signature    = excluded.signature,
    lens         = excluded.lens,
    hook_prefs   = excluded.hook_prefs,
    arc          = excluded.arc,
    updated_at   = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, senderKey, s.SubjectName, s.Signature, s.Lens, s.HookPrefs, s.Arc)
	return err
}
