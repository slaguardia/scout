-- Free-form, human-only notes on a job posting — the jobs-view counterpart to a
-- company's notes. Set only via the tracking PUT (UpdatePostingTracking); no
-- capture / ATS / outreach path writes it, so a re-capture never clobbers what
-- the user wrote. NULL = none.
ALTER TABLE job_postings ADD COLUMN notes TEXT;
