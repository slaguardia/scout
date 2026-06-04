-- scout schema, M21
-- Outreach contacts on postings: a free-form text field for the people the
-- user can reach out to about this role ("Jane Doe <jane@acme.com>, cto@…").
-- Deliberately not a contacts table — one tracker column, comma-separated;
-- the UI renders email-shaped tokens as mailto links.

ALTER TABLE job_postings ADD COLUMN contacts TEXT;
