-- The "who to reach out to" feature (M45) is gone — the researcher no longer
-- emits suggested contacts and the panel no longer shows them. Drop the column
-- rather than leave a dead field behind. The hand-curated `contacts` list (M24)
-- stays — it now carries structured {position, email} entries.
ALTER TABLE job_postings DROP COLUMN suggested_contacts;
