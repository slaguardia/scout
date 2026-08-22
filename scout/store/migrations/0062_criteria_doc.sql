-- The locally-authored company-fit criteria (Settings → Knowledge → Criteria),
-- a DB singleton on the playbook pattern. A non-empty doc is the criteria the
-- verdict stage feeds the LLM, outright — the brain's distilled brief
-- (brain_profile_cache) is only consulted when this is empty. Replaces the
-- taste.md file.
CREATE TABLE criteria_doc (
    key        TEXT NOT NULL PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
