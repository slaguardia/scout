-- scout schema, M2
-- enrichment: cached about/landing page text per company.
-- Keyed 1:1 by company_id. Re-fetch only when companies.ingested_at > enrichment.fetched_at.

CREATE TABLE IF NOT EXISTS enrichment (
    company_id      INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    website_url     TEXT,             -- the URL we actually fetched
    website_summary TEXT,             -- stripped text, truncated
    fetch_status    TEXT NOT NULL,    -- 'ok' | 'no_domain' | 'http_<code>' | 'timeout' | 'error'
    fetch_error     TEXT,             -- detail if status != ok
    fetched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enrichment_status ON enrichment(fetch_status);
