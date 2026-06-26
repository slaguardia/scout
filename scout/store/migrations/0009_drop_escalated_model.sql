-- The Sonnet "escalate maybes" second pass was removed. Drop its column.
-- Verdict/reason rows are untouched — only the escalation provenance marker
-- (which model re-scored a 'maybe') goes away. Migration 0004 added it.
ALTER TABLE verdicts DROP COLUMN escalated_model;
