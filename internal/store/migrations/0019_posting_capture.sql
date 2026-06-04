-- scout schema, M19
-- Link capture: job_postings grows the fields the capture agent pass extracts
-- from a pasted posting URL (location, summary) plus provenance — how the row
-- got here (source), how the fetch went (fetch_status), and when the agent
-- pass last filled it (captured_at). Hand-added links keep NULLs here; rows
-- predating this migration read as source 'manual' via COALESCE.

ALTER TABLE job_postings ADD COLUMN location     TEXT;
ALTER TABLE job_postings ADD COLUMN summary      TEXT;
ALTER TABLE job_postings ADD COLUMN source       TEXT;     -- 'manual' | 'capture'
ALTER TABLE job_postings ADD COLUMN fetch_status TEXT;     -- capture fetch taxonomy; NULL for manual adds
ALTER TABLE job_postings ADD COLUMN captured_at  DATETIME; -- last agent-pass fill
