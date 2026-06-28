-- scout schema, M56
-- When did the application stage last change? A single timestamp on the posting,
-- bumped by the app layer only when application_status actually moves to a new
-- value (an outreach-status or notes edit through the same update leaves it
-- alone). NULL = never changed since this column landed; it self-populates on the
-- next stage change. No backfill — we don't know the historical change dates, so
-- inventing one would be worse than an honest blank.
ALTER TABLE job_postings ADD COLUMN application_status_at TEXT;
