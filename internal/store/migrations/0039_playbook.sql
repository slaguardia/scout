-- The verdict playbook (how scout judges) lives in the DB (a singleton row),
-- not a file — so a dashboard save can't clobber it and git never touches it,
-- same as the outreach template. Empty/absent means "use the compiled-in
-- default" (internal/playbook.DefaultPlaybook).
CREATE TABLE playbook (
    key        TEXT NOT NULL PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
