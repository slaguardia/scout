package store

import "database/sql"

// BrainProfile is a cached copy of the brain's profile-derived criteria text.
// FetchedAt is the raw SQLite datetime (UTC); AgeSeconds is now-minus-fetched_at
// computed in SQL so callers don't parse timestamps to judge freshness.
//
// Cursor + VerifiedAt back the change-aware cost cascade (see internal/criteria):
// Cursor is the brain's opaque /changes stamp at the last confirmed-current
// check (equality-compare only); VerifiedAt is when the brief was last CONFIRMED
// current against the brain (a fresh distill, a Tier 0 no-op, or a Tier 1 basis
// match) — distinct from FetchedAt, which only moves when the body is rewritten.
// VerifiedAgeSeconds is now-minus-verified_at in SQL, with the sentinel -1 when
// verified_at IS NULL (a pre-0037 / never-verified row) so callers never parse
// timestamps.
type BrainProfile struct {
	SourceURL          string `json:"source_url"`
	Body               string `json:"body"`
	ContentHash        string `json:"content_hash"`
	FetchedAt          string `json:"fetched_at"`
	AgeSeconds         int64  `json:"age_seconds"`
	Cursor             string `json:"cursor"`
	VerifiedAt         string `json:"verified_at"`
	VerifiedAgeSeconds int64  `json:"verified_age_seconds"`
}

// GetBrainProfile returns the cached profile for sourceURL, or (nil, nil) when
// nothing is cached.
func (db *DB) GetBrainProfile(sourceURL string) (*BrainProfile, error) {
	const q = `
SELECT source_url, body, content_hash, fetched_at,
       CAST(strftime('%s','now') - strftime('%s', fetched_at) AS INTEGER) AS age_seconds,
       cursor,
       COALESCE(verified_at, '') AS verified_at,
       CASE WHEN verified_at IS NULL THEN -1
            ELSE CAST(strftime('%s','now') - strftime('%s', verified_at) AS INTEGER)
       END AS verified_age_seconds
FROM brain_profile_cache WHERE source_url = ?`
	var p BrainProfile
	err := db.QueryRow(q, sourceURL).Scan(
		&p.SourceURL, &p.Body, &p.ContentHash, &p.FetchedAt, &p.AgeSeconds,
		&p.Cursor, &p.VerifiedAt, &p.VerifiedAgeSeconds,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// PutBrainProfile upserts the cached profile for sourceURL — the full write,
// used by a fresh distill (cold path / Tier 2 re-distill / Refresh). It stamps
// BOTH fetched_at and verified_at to now (a fresh distill is by definition
// confirmed-current) and stores the brain's current change cursor.
//
// content_hash is the caller's stable change-detection / version key — for the
// brain brief that's the distill basis hash (synthesis prompt + recalled
// chunks), NOT a hash of the body, so a cosmetically-drifted brief over the same
// inputs keeps the same key. cursor is the brain's opaque /changes stamp at write
// time; the resolver compares it for equality on the next resolve.
func (db *DB) PutBrainProfile(sourceURL, body, contentHash, cursor string) error {
	const q = `
INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at, cursor, verified_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
ON CONFLICT(source_url) DO UPDATE SET
    body         = excluded.body,
    content_hash = excluded.content_hash,
    fetched_at   = CURRENT_TIMESTAMP,
    cursor       = excluded.cursor,
    verified_at  = CURRENT_TIMESTAMP`
	_, err := db.Exec(q, sourceURL, body, contentHash, cursor)
	return err
}

// TouchBrainProfile records "confirmed unchanged as of now" WITHOUT rewriting
// the brief: it updates cursor + verified_at = now only, leaving body /
// content_hash / fetched_at untouched. It is the Tier 0 (changed=false) and
// Tier 1 (basis unchanged) stamp — the whole point of the cascade is that these
// no-op confirmations never wobble the cached body or its version.
//
// If no row exists for sourceURL it is a no-op (zero rows affected, nil error):
// there is nothing to confirm-current yet, and the cold path will write a full
// row on the next resolve, so a missing row is not an error here.
func (db *DB) TouchBrainProfile(sourceURL, cursor string) error {
	const q = `
UPDATE brain_profile_cache
SET cursor = ?, verified_at = CURRENT_TIMESTAMP
WHERE source_url = ?`
	_, err := db.Exec(q, cursor, sourceURL)
	return err
}
