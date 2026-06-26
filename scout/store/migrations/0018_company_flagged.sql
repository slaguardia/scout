-- flagged_at marks a company the user flagged from the dashboard — a simple
-- hand-set bookmark, orthogonal to both the verdict and the reviewed state.
-- NULL = not flagged. Filterable in the UI; preserved across re-ingest, since
-- UpsertCompany never writes this column.
ALTER TABLE companies ADD COLUMN flagged_at DATETIME;
