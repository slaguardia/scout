-- The reviewed/unreviewed triage state is gone — the flag (flagged_at) is the
-- one hand-set mark. Drop the column rather than leave a dead field behind.
ALTER TABLE companies DROP COLUMN reviewed_at;
