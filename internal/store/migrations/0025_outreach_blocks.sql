-- Outreach context blocks: pins bind a block slot to brain document ids;
-- blocks cache the assembled content keyed by the brain's version stamps.
-- See docs/outreach-agent.md ("Retrieval — the brain, not Notion").

CREATE TABLE outreach_pins (
    block      TEXT    NOT NULL,             -- slot name, e.g. P2_LOCKED
    position   INTEGER NOT NULL,             -- order within a multi-page pin
    page_id    TEXT    NOT NULL,             -- the brain's stable document id
    -- For locked-tier blocks: the version the user approved. A sync that sees
    -- a different upstream version halts the block instead of auto-adopting.
    -- Empty for pointed-at/derived tiers (silent refetch).
    approved_version TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (block, position)
);

CREATE TABLE outreach_blocks (
    block      TEXT NOT NULL PRIMARY KEY,    -- slot name
    content    TEXT NOT NULL,                -- assembled block text
    version    TEXT NOT NULL,                -- concat of constituent doc versions
    broken     TEXT NOT NULL DEFAULT '',     -- non-empty = block unusable; why
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
