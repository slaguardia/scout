-- scout schema, M59
-- archived_at marks a posting the user has stopped pursuing — a soft "put to
-- rest" that drops it out of the active jobs list and silences all its follow-up
-- reminders, while keeping the row (and its outreach history) recoverable. Unlike
-- delete this is reversible; unlike the "rejected" stage it hides the row and
-- kills the nags. NULL = active.
ALTER TABLE job_postings ADD COLUMN archived_at DATETIME;
