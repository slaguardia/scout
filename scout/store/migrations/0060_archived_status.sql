-- scout schema, M60
-- "Archived" is now a first-class application_status value rather than a separate
-- archived_at flag: setting application_status = 'archived' hides the posting from
-- the active jobs list and silences its follow-up reminders (see store/statuses.py
-- and list_job_rows). Fold the old flag into the status, preserving when it was
-- archived, then drop the now-dead column.
UPDATE job_postings
   SET application_status = 'archived',
       application_status_at = archived_at
 WHERE archived_at IS NOT NULL;

ALTER TABLE job_postings DROP COLUMN archived_at;
