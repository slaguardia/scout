-- The outreach redesign replaces the hand-pinned block taxonomy with a
-- scout-local email template + brain-discovered knowledge sources
-- (outreach_sources, M35). The old block/pin tables, the outreach sender
-- identity, and the lint/structure config knobs are gone. Drafts
-- (outreach_drafts) and answers (posting_answers) are unaffected.
DROP TABLE IF EXISTS outreach_pins;
DROP TABLE IF EXISTS outreach_blocks;
DROP TABLE IF EXISTS outreach_sender;
DROP TABLE IF EXISTS outreach_config;
