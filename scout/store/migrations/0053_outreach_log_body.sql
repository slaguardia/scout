-- scout schema, M53
-- Store the actual email body sent in each outreach_log entry, so a contact's
-- history is "here's exactly what I sent on the 10th," not just a date + note.
-- The follow-up template reads the latest body as {{last_message}} for quoting.
ALTER TABLE outreach_log ADD COLUMN body TEXT NOT NULL DEFAULT '';
