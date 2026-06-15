-- The application lifecycle collapses from two columns (applied_at DATE +
-- response enum) into ONE configurable "application stage" with a dated history:
-- an ordered JSON array of {stage, date} on the posting, current stage = last
-- entry. This mirrors the opaque-JSON `contacts` column — the UI owns the shape,
-- the backend stores it verbatim. Stage labels are user-configurable (the
-- application_stages setting), so there is no enum here.
--
-- Backfill the history from the old columns so no tracking is lost: an applied
-- date seeds an "applied" entry; a response seeds an entry named after it (dated
-- to the apply date, or the row's creation date when never applied). Then drop
-- the two legacy columns.
ALTER TABLE job_postings ADD COLUMN stage_history TEXT;

UPDATE job_postings
SET stage_history = (
    SELECT json_group_array(json(j)) FROM (
        SELECT 1 AS ord,
               json_object('stage', 'applied', 'date', applied_at) AS j
            WHERE applied_at IS NOT NULL AND applied_at <> ''
        UNION ALL
        SELECT 2 AS ord,
               json_object('stage', response,
                           'date', COALESCE(NULLIF(applied_at, ''), date(created_at))) AS j
            WHERE response IS NOT NULL AND response <> ''
        ORDER BY ord
    )
)
WHERE (applied_at IS NOT NULL AND applied_at <> '')
   OR (response IS NOT NULL AND response <> '');

ALTER TABLE job_postings DROP COLUMN applied_at;
ALTER TABLE job_postings DROP COLUMN response;
