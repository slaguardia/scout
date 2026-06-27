-- The outreach writing doctrine (how emails get written) lives in the DB (a
-- singleton row), not a file — so a dashboard save can't clobber it and git
-- never touches it, same as the playbook. Empty/absent means "use the
-- compiled-in default".
CREATE TABLE outreach_doctrine (
    key        TEXT NOT NULL PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
