-- scout schema, M11
-- job_postings: links to actual job/role postings found at a company.
-- One-to-many (companies 1 — 0..N job_postings), unlike the 0..1
-- enrichment/verdicts tables. uuid PK like runs. company_id is the company's
-- deterministic TEXT uuid (see 0010_company_uuid.sql).

CREATE TABLE IF NOT EXISTS job_postings (
    id         TEXT PRIMARY KEY,        -- uuid
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    title      TEXT,                     -- optional label
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company_id);
