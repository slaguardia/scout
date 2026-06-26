-- scout schema, V3
-- runs: durable record of each pipeline run triggered from the UI (or CLI).
-- This is the "what did this run identify" history — which stage ran, when,
-- and a JSON summary of the outcome (e.g. verdict counts). Lines/progress are
-- ephemeral (in-memory during the run); only the summary persists here.

CREATE TABLE IF NOT EXISTS runs (
    id            TEXT PRIMARY KEY,        -- uuid
    stage         TEXT NOT NULL,           -- 'ingest' | 'enrich' | 'verdict' | 'episodes'
    status        TEXT NOT NULL,           -- 'running' | 'done' | 'failed' | 'canceled'
    started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at   DATETIME,
    taste_version TEXT,                     -- set for verdict runs
    summary       TEXT,                     -- JSON: stage-specific counts
    error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_stage   ON runs(stage);
