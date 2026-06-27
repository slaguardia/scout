-- The outreach email template lives in the DB (a singleton row), not a file —
-- so a dashboard save can't clobber it and git never touches it. Empty/absent
-- means "use the compiled-in default" (scout.outreach.DEFAULT_TEMPLATE).
CREATE TABLE outreach_template (
    key        TEXT NOT NULL PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
