-- Structured posting details, filled by the ATS resolver (capture's no-LLM
-- path for ashby/greenhouse/lever links — the platform's public posting API
-- states these outright, no extraction needed). All optional; the LLM capture
-- path leaves them NULL and the upsert never lets an empty re-capture erase
-- a value a previous resolve filled.
ALTER TABLE job_postings ADD COLUMN posted_at DATE;          -- when the role was published
ALTER TABLE job_postings ADD COLUMN employment_type TEXT;    -- "Full-time", "Contract", ...
ALTER TABLE job_postings ADD COLUMN workplace_type TEXT;     -- "Remote" | "Hybrid" | "On-site"
ALTER TABLE job_postings ADD COLUMN department TEXT;         -- the ATS's department/team label
ALTER TABLE job_postings ADD COLUMN comp_range TEXT;         -- published salary range, pre-formatted
ALTER TABLE job_postings ADD COLUMN description TEXT;        -- full posting text, plain
