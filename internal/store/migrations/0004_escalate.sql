-- scout schema, B1
-- escalated_model: the second-pass model (e.g. Sonnet) that re-scored a
-- 'maybe' from the first pass. NULL = no escalation has happened for this
-- row at the current taste_version. Idempotency for the escalation pass
-- keys on (verdict='maybe', escalated_model IS NULL OR != requested model).

ALTER TABLE verdicts ADD COLUMN escalated_model TEXT;
