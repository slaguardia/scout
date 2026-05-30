-- Decision trail for the verdict stage. APPEND-ONLY — unlike `verdicts`, which
-- keeps only the latest row per company, this records one row per scoring pass.
-- The per-company timeline therefore survives re-scores: each time the criteria
-- version changes (or a forced re-score runs) a new row is appended, so you can
-- see how the verdict moved as the brain learned or the playbook changed.
--
-- This is a deliberate, scoped exception to scout's snapshot-only model (see
-- data-model.md). It exists for testing/tuning the brain's intelligence: it
-- records what scout asked the brain, what came back (facts + scores + which
-- cleared the floor, plus episode bodies), which criteria source was live, and
-- the verdict it produced.
CREATE TABLE IF NOT EXISTS verdict_trace (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    run_id          TEXT,              -- UI run uuid; NULL for CLI runs
    model           TEXT NOT NULL,
    taste_version   TEXT NOT NULL,
    criteria_source TEXT,              -- where 'what the user wants' came from (brain vs taste.md)
    brain_query     TEXT,              -- the recall query (company name); empty if brain off
    brain_status    TEXT NOT NULL,     -- 'ok' | 'error' | 'empty' | 'disabled'
    brain_error     TEXT,              -- set when brain_status = 'error'
    brain_facts     TEXT,              -- JSON [{fact,name,score,used}]
    brain_episodes  TEXT,              -- JSON [{name,body}] returned by recall (not injected per-company)
    verdict         TEXT NOT NULL,
    reason          TEXT NOT NULL,
    scored_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verdict_trace_company ON verdict_trace(company_id, scored_at);
CREATE INDEX IF NOT EXISTS idx_verdict_trace_run     ON verdict_trace(run_id);
