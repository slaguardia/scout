-- Editable outreach pipeline prompts (M46): one row per pipeline stage
-- (researcher | fill | humanizer | honesty | judge), holding a dashboard-edited
-- override of that stage's system prompt. Empty/absent → the compiled-in default
-- for that stage. Supersedes outreach_doctrine: the writing doctrine became the
-- Writer (fill) stage's default prompt, so the separate doctrine row is no
-- longer read (the table is left in place, unused).
-- `enabled` lets a stage be toggled off (skipped) from the dashboard — every
-- stage but the Writer (fill) is optional. content='' means "use the compiled
-- default prompt"; a row may exist purely to hold enabled=0 with no override.
CREATE TABLE prompt_overrides (
    stage      TEXT NOT NULL PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    enabled    INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
