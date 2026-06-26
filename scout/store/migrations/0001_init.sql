-- scout schema, M1
-- companies: raw ingest. raw_json preserves the original row untouched.
-- Known columns are pulled out for fast filtering.

CREATE TABLE IF NOT EXISTS companies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT NOT NULL,
    source_id    TEXT,
    name         TEXT NOT NULL,
    domain       TEXT,
    headcount    INTEGER,
    funding_stage TEXT,
    location     TEXT,
    vertical     TEXT,
    raw_json     TEXT NOT NULL,
    ingested_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_companies_name      ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_location  ON companies(location);
CREATE INDEX IF NOT EXISTS idx_companies_headcount ON companies(headcount);
CREATE INDEX IF NOT EXISTS idx_companies_vertical  ON companies(vertical);

-- status: per-company review state. Decoupled from ingest so re-ingesting doesn't reset it.
CREATE TABLE IF NOT EXISTS status (
    company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    state      TEXT NOT NULL DEFAULT 'new',  -- new | reviewed | tracked | dismissed
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_state ON status(state);
