-- scout schema, brain-first
-- Re-key episode write-back dedup on the DECISION CONTENT, not taste_version.
--
-- The criteria version is now brain-derived: it changes whenever the brain
-- changes. Keying episodes_sent on (company_id, taste_version) would therefore
-- re-capture every verdict on each brain update. Key on a content hash of the
-- decision (verdict + reason) instead, so scout only captures a verdict back
-- to the brain when the decision itself is new or changed.
--
-- SQLite can't alter a primary key in place; rebuild the table. Prior sent
-- markers don't map onto the new key, so they're dropped — at most a one-time
-- re-capture of existing verdicts (the brain dedups on its side anyway).

DROP TABLE IF EXISTS episodes_sent;

CREATE TABLE episodes_sent (
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    verdict_hash TEXT NOT NULL,   -- sha256[:12] of verdict + "\n" + reason
    sent_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, verdict_hash)
);
