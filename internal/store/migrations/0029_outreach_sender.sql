-- The outreach sender identity: who the cold-email pipeline writes for
-- (subject-line name, sign-off, and the three prompt-framing lines). A
-- singleton, keyed on a fixed 'default'. It lives only in the local DB and is
-- set from the UI, so no personal identity is baked into the repo — the
-- compiled-in default is neutral and a real identity never reaches git.
CREATE TABLE outreach_sender (
    key          TEXT NOT NULL PRIMARY KEY,
    subject_name TEXT NOT NULL DEFAULT '',
    signature    TEXT NOT NULL DEFAULT '',
    lens         TEXT NOT NULL DEFAULT '',
    hook_prefs   TEXT NOT NULL DEFAULT '',
    arc          TEXT NOT NULL DEFAULT '',
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
