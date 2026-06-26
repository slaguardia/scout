-- Decision trail for the verdict stage. APPEND-ONLY — unlike `verdicts`, which
-- keeps only the latest row per company, this records one row per scoring pass.
-- The per-company timeline therefore survives re-scores: each time the criteria
-- version changes (or a forced re-score runs) a new row is appended, so you can
-- see how the verdict moved as the criteria or the playbook changed.
--
-- This is a deliberate, scoped exception to scout's snapshot-only model (see
-- data-model.md). It records which criteria (source + version) and model drove
-- each verdict, for testing/tuning the scorer. (The brain is consulted only for
-- the profile-derived criteria, not per company, so there's no per-company brain
-- Q&A to record.)
CREATE TABLE IF NOT EXISTS verdict_trace (
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
