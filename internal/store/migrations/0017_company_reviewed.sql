-- reviewed_at marks when the user triaged this company from the dashboard.
-- NULL = new / not yet reviewed — the UI shows a pulsing dot and a "mark
-- reviewed" control. It is independent of the verdict: a company can be
-- LLM-scored yet still un-reviewed by the user. Preserved across re-ingest,
-- since UpsertCompany never writes this column.
ALTER TABLE companies ADD COLUMN reviewed_at DATETIME;
