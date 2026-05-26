-- scout schema, M3
-- verdicts: agent decision per company. taste_version pins the snapshot of
-- the taste context used; changing taste produces a different version and
-- triggers re-scoring on the next `scout verdict` run.

CREATE TABLE IF NOT EXISTS verdicts (
    company_id    INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    verdict       TEXT NOT NULL,        -- 'yes' | 'maybe' | 'no'
    reason        TEXT NOT NULL,        -- one-line justification
    taste_version TEXT NOT NULL,        -- sha256[:12] of taste block used
    model         TEXT NOT NULL,        -- e.g. 'claude-haiku-4-5'
    scored_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verdicts_verdict ON verdicts(verdict);
CREATE INDEX IF NOT EXISTS idx_verdicts_taste   ON verdicts(taste_version);

-- episodes_sent: dedup write-back to brainbot at M6. We record one row per
-- (company_id, taste_version) once the episode is acknowledged.
CREATE TABLE IF NOT EXISTS episodes_sent (
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    taste_version TEXT NOT NULL,
    sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, taste_version)
);
