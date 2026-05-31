-- Local cache of the brain's /profile-derived criteria text. Lets a CLI verdict
-- run, or a server restart, reuse the criteria without re-hitting the brain on
-- every invocation; refreshed on a TTL or by a manual refresh. Keyed by the
-- brain base URL (one row in practice). Disposable — it's a cache, not the
-- system of record; the brain remains authoritative.
CREATE TABLE brain_profile_cache (
    source_url   TEXT PRIMARY KEY,           -- brain base URL the body came from
    body         TEXT NOT NULL,              -- resolved criteria text (fact-derived grouped block)
    content_hash TEXT NOT NULL,              -- taste.Hash(body); == taste_version input
    fetched_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
