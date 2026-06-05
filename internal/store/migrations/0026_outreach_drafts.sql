-- scout schema, M26
-- Outreach drafts: one row per pipeline run against a posting. The jobs-panel
-- outreach section is the review queue (docs/outreach-agent.md, "Scope & UI").
-- Draft history is kept per posting (Touch-2 follow-ups need send dates);
-- "active" means status in (researching, awaiting_review, no_hook).

CREATE TABLE outreach_drafts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    posting_id  TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'researching',
        -- researching | awaiting_review | no_hook | sent | failed
    research    TEXT NOT NULL DEFAULT '',  -- researcher output JSON
    hook        TEXT NOT NULL DEFAULT '',  -- hook-selector output JSON
    draft       TEXT NOT NULL DEFAULT '',  -- pipeline-assembled email
    edited      TEXT NOT NULL DEFAULT '',  -- user-edited text ('' = none; wins when set)
    lint        TEXT NOT NULL DEFAULT '',  -- lint findings JSON for the current text
    violations  TEXT NOT NULL DEFAULT '',  -- honesty-checker violations JSON (last fail)
    fail_reason TEXT NOT NULL DEFAULT '',  -- human-readable cause for status=failed
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at     DATETIME                   -- set by "mark sent"
);

CREATE INDEX idx_outreach_drafts_posting ON outreach_drafts(posting_id);
