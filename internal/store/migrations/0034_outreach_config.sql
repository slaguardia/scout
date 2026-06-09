-- The outreach pipeline's configurable knobs: the lint word window, the
-- subject-line format template, and the email structure (the ordered slots the
-- assembler renders). A singleton keyed on a fixed 'default', set from the UI's
-- outreach config editor. Defaults match the values that were hardcoded before
-- this table existed, so an un-set install behaves exactly as before.
--
-- `structure` is a JSON array of slots ({"kind":"model","source":"P1"} or
-- {"kind":"locked","block":"P2_LOCKED"}); an empty string means "use the
-- compiled-in default structure". The locked-slot integrity guarantee (verbatim
-- content + honesty checker over the whole email) is enforced in code, not here.
CREATE TABLE outreach_config (
    key            TEXT NOT NULL PRIMARY KEY,
    word_min       INTEGER NOT NULL DEFAULT 75,
    word_max       INTEGER NOT NULL DEFAULT 125,
    subject_format TEXT NOT NULL DEFAULT '[Name] | {sender} intro — {role}',
    structure      TEXT NOT NULL DEFAULT '',
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
