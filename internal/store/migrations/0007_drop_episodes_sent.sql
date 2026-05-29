-- scout schema, brain-first (read-only brain)
-- Drop episode write-back dedup. Scout no longer writes verdicts back to the
-- brain — verdict data is scout-local, and the brain is read-only for scout
-- (profile + recall). The episodes_sent table (0003, rebuilt in 0006) is dead.

DROP TABLE IF EXISTS episodes_sent;
