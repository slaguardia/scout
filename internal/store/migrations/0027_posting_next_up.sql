-- next_up_at marks a posting the user queued as "next up for outreach" — a
-- hand-set to-do mark, like the company flag but with a completion semantic:
-- it clears automatically when the outreach actually goes out (anything that
-- bumps outreach_count — the manual +1 logger or a draft marked sent).
-- NULL = not queued.
ALTER TABLE job_postings ADD COLUMN next_up_at DATETIME;
