-- scout schema, M23
-- Application lifecycle on postings: the jobs view takes over the user's
-- external application tracker. Applied-or-not and its date collapse into one
-- nullable applied_at; response is the furthest reply reached; outreach is a
-- count + last-contact date (the cadence — outreach *content* stays external).
-- This deliberately amends the old "no application status on postings"
-- posture: postings now carry lifecycle, companies still carry fit.

ALTER TABLE job_postings ADD COLUMN applied_at       DATE;    -- NULL = not applied
ALTER TABLE job_postings ADD COLUMN response         TEXT;    -- 'screening' | 'interview' | 'offer' | 'rejected'
ALTER TABLE job_postings ADD COLUMN outreach_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_postings ADD COLUMN last_outreach_at DATE;
