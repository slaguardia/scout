-- Suggested outreach contacts (M45): who a candidate would report to or work
-- with, as read off the posting/web by the outreach researcher. Distinct from
-- `contacts` (the hand-curated mailto list) — this one is auto-seeded by a
-- draft run and freely overridable; the seed never clobbers a non-empty value.
ALTER TABLE job_postings ADD COLUMN suggested_contacts TEXT;
