-- scout schema, brain-first (read-only brain)
-- Drop the per-company review-state table. The triage "status" workflow
-- (new/reviewed/tracked/dismissed) has been removed from scout — there is no
-- status column, filter, stats, buttons, or write-back endpoint anymore.
-- The index idx_status_state goes away with the table.

DROP TABLE IF EXISTS status;
