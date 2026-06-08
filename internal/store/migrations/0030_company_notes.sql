-- Free-form, human-only notes on a company — a scratchpad in the company pane.
-- The app NEVER writes this column automatically: ingest/capture/enrich/verdict
-- all leave it alone (UpsertCompany doesn't list it, so re-ingest preserves it).
-- It is set only by the explicit PUT /api/companies/:id/notes edit. NULL = none.
ALTER TABLE companies ADD COLUMN notes TEXT;
