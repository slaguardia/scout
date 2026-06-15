-- scout schema, M48
-- Outreach reply status on a posting — a SEPARATE axis from the application
-- `response` (screening/interview/offer/rejected). It records whether the
-- outreach you sent got a reply, so the follow-up queue knows who has gone cold.
-- '' = none (never reached out / no status), 'awaiting' = sent, waiting on a
-- reply, 'replied' = they answered, 'no_response' = gave up. App-level validation
-- restricts writes to that set. Marking a draft sent flips '' -> 'awaiting'
-- (never over 'replied'); the rest is set by hand from the dashboard.
ALTER TABLE job_postings ADD COLUMN outreach_status TEXT NOT NULL DEFAULT '';
