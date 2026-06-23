-- scout schema, M51
-- The application axis collapses from a dated history (the M50 stage_history
-- JSON array of {stage, date}) to a single configurable label, mirroring the
-- outreach_status column exactly — the dates carried no weight, so the jobs
-- view now tracks the current application stage as one dropdown value. '' = none.
--
-- Backfill from the current stage (the last entry of the history) so no live
-- tracking is lost, then drop the history column. Rows with no/blank/invalid
-- history keep the '' default.
ALTER TABLE job_postings ADD COLUMN application_status TEXT NOT NULL DEFAULT '';

UPDATE job_postings
SET application_status = COALESCE(
    json_extract(stage_history, '$[' || (json_array_length(stage_history) - 1) || '].stage'),
    '')
WHERE stage_history IS NOT NULL AND stage_history <> ''
  AND json_valid(stage_history) AND json_array_length(stage_history) > 0;

ALTER TABLE job_postings DROP COLUMN stage_history;
