-- Provenance for outreach knowledge rows. A brain sync may overwrite 'brain'
-- rows and never touches 'local' ones — the docs typed in Settings → Knowledge
-- (page_id 'local', one per need). Every pre-existing row came from the brain.
ALTER TABLE outreach_sources ADD COLUMN origin TEXT NOT NULL DEFAULT 'brain';
