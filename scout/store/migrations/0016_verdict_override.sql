-- verdict_override: a durable, append-only log of manual verdict overrides made
-- from the dashboard. Unlike verdict_trace (an explicitly disposable debug aid),
-- this is a record of intent — kept so the user's hand corrections can later
-- inform criteria tuning. Captures the delta (from → to), the user's reason, and
-- the criteria version in effect at the time. Scout-local only; never written
-- back to the brain.
CREATE TABLE IF NOT EXISTS verdict_override (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    from_verdict     TEXT,              -- prior verdict being replaced; NULL if the company was unscored
    to_verdict       TEXT NOT NULL,     -- the hand-set verdict (yes|maybe|no)
    reason           TEXT NOT NULL,     -- the user's reason text (may be empty)
    criteria_version TEXT,              -- taste/criteria version in effect at override time
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verdict_override_company ON verdict_override(company_id, created_at);
