-- Discovered outreach knowledge: which brain pages feed the outreach/answers
-- pipeline, by need, with the page text cached whole (so drafting is fast and
-- survives the brain being down). Populated by the discovery pass (LLM over the
-- brain /map) and re-run from a Refresh button; the user can add/remove rows.
-- Replaces the old hand-pinned outreach_pins/outreach_blocks taxonomy.
CREATE TABLE outreach_sources (
    need        TEXT NOT NULL,          -- knowledge need: 'experience' | 'voice'
    page_id     TEXT NOT NULL,          -- brain stable page id (whole-fetched via /doc)
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '', -- cached whole-document text
    version     TEXT NOT NULL DEFAULT '',
    resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (need, page_id)
);
