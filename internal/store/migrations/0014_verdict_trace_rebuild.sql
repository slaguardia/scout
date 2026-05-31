-- Rebuild verdict_trace to reconcile DBs that applied an OLDER 0012. The runner
-- (store.go migrate()) skips migrations recorded in schema_migrations BY NAME,
-- so a DB that already applied the original 0012 keeps its old verdict_trace
-- schema (brain_status NOT NULL, brain_query/brain_facts/brain_episodes/
-- brain_error) — editing 0012 in place never re-runs it. Against that old shape
-- the current 7-column InsertVerdictTrace hits a NOT NULL violation that
-- writeTrace silently swallows.
--
-- This migration is a fresh filename, so it always runs once. It DROPs the table
-- and recreates it with the CURRENT schema (matching 0012). On a fresh DB it
-- drops the table 0012 just made and recreates it identically (idempotent); on
-- an old-schema DB it repairs the columns. Dropping existing rows is acceptable:
-- the trail is a disposable debugging aid, not a result of record.
DROP TABLE IF EXISTS verdict_trace;

CREATE TABLE verdict_trace (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    run_id          TEXT,              -- UI run uuid; NULL for CLI runs
    model           TEXT NOT NULL,
    taste_version   TEXT NOT NULL,
    criteria_source TEXT,              -- where 'what the user wants' came from (brain profile vs taste.md)
    verdict         TEXT NOT NULL,
    reason          TEXT NOT NULL,
    scored_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verdict_trace_company ON verdict_trace(company_id, scored_at);
CREATE INDEX IF NOT EXISTS idx_verdict_trace_run     ON verdict_trace(run_id);
