-- scout schema, company UUID pkey (cross-source dedup)
-- Re-key companies on a DETERMINISTIC UUID derived from the company's identity:
-- the normalized domain, or 'name:<name>' when there's no domain. The same
-- company arriving from two different sources now collapses to one row — the
-- primary key IS the dedup key, so the ingest upsert conflicts on it directly.
-- The old surrogate INTEGER id and the UNIQUE(source, source_id) constraint are
-- both gone; (source, source_id) is now just provenance (last writer wins).
--
-- SQLite can't change a column's type or a primary key in place, and the
-- deterministic UUID can't be computed in pure SQL (there's no UUIDv5 function),
-- so the old integer-keyed rows can't be mechanically re-keyed here — and under
-- domain dedup some of them would have to MERGE, which has no clean automatic
-- resolution. scout.db is a disposable working set (the brain is the system of
-- record), so we rebuild the company tables empty and re-ingest. The children
-- (enrichment/verdicts) FK the new TEXT id, so they're rebuilt too.
--
-- Drop children before the parent (FK), recreate the parent before the children.

DROP TABLE IF EXISTS verdicts;
DROP TABLE IF EXISTS enrichment;
DROP TABLE IF EXISTS companies;

CREATE TABLE companies (
    id            TEXT PRIMARY KEY,   -- uuidv5(scout namespace, domain | 'name:'+lower(name))
    source        TEXT NOT NULL,
    source_id     TEXT,
    name          TEXT NOT NULL,
    domain        TEXT,
    headcount     INTEGER,
    funding_stage TEXT,
    location      TEXT,
    vertical      TEXT,
    raw_json      TEXT NOT NULL,
    ingested_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_name      ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_location  ON companies(location);
CREATE INDEX IF NOT EXISTS idx_companies_headcount ON companies(headcount);
CREATE INDEX IF NOT EXISTS idx_companies_vertical  ON companies(vertical);

CREATE TABLE enrichment (
    company_id      TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    website_url     TEXT,
    website_summary TEXT,
    fetch_status    TEXT NOT NULL,
    fetch_error     TEXT,
    fetched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enrichment_status ON enrichment(fetch_status);

CREATE TABLE verdicts (
    company_id    TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    verdict       TEXT NOT NULL,        -- 'yes' | 'maybe' | 'no'
    reason        TEXT NOT NULL,        -- one-line justification
    taste_version TEXT NOT NULL,        -- sha256[:12] of criteria + playbook
    model         TEXT NOT NULL,        -- e.g. 'claude-haiku-4-5'
    scored_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_verdicts_verdict ON verdicts(verdict);
CREATE INDEX IF NOT EXISTS idx_verdicts_taste   ON verdicts(taste_version);
