package store

import "database/sql"

// BrainProfile is a cached copy of the brain's profile-derived criteria text.
// FetchedAt is the raw SQLite datetime (UTC); AgeSeconds is now-minus-fetched_at
// computed in SQL so callers don't parse timestamps to judge freshness.
type BrainProfile struct {
	SourceURL   string `json:"source_url"`
	Body        string `json:"body"`
	ContentHash string `json:"content_hash"`
	FetchedAt   string `json:"fetched_at"`
	AgeSeconds  int64  `json:"age_seconds"`
}

// GetBrainProfile returns the cached profile for sourceURL, or (nil, nil) when
// nothing is cached.
func (db *DB) GetBrainProfile(sourceURL string) (*BrainProfile, error) {
	const q = `
SELECT source_url, body, content_hash, fetched_at,
       CAST(strftime('%s','now') - strftime('%s', fetched_at) AS INTEGER) AS age_seconds
FROM brain_profile_cache WHERE source_url = ?`
	var p BrainProfile
	err := db.QueryRow(q, sourceURL).Scan(&p.SourceURL, &p.Body, &p.ContentHash, &p.FetchedAt, &p.AgeSeconds)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// PutBrainProfile upserts the cached profile for sourceURL, stamping fetched_at
// to now. content_hash is taste.Hash(body) (computed by the caller).
func (db *DB) PutBrainProfile(sourceURL, body, contentHash string) error {
	const q = `
INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(source_url) DO UPDATE SET
    body         = excluded.body,
    content_hash = excluded.content_hash,
    fetched_at   = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, sourceURL, body, contentHash)
	return err
}
