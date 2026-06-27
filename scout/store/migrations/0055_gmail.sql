-- scout schema, M55: Gmail link (send + read-sync + status tracking).

-- Tie each logged send to its Gmail message/thread (dedupe synced sends; thread follow-ups).
ALTER TABLE outreach_log ADD COLUMN gmail_message_id TEXT NOT NULL DEFAULT '';
ALTER TABLE outreach_log ADD COLUMN gmail_thread_id  TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_outreach_log_gmail_msg
    ON outreach_log(gmail_message_id) WHERE gmail_message_id <> '';

-- Inbound replies on tracked outreach threads (sends stay in outreach_log).
CREATE TABLE gmail_messages (
    id            TEXT PRIMARY KEY,                                  -- gmail message id
    thread_id     TEXT NOT NULL,
    posting_id    TEXT REFERENCES job_postings(id) ON DELETE CASCADE,
    contact_id    TEXT REFERENCES contacts(id)     ON DELETE SET NULL,
    from_email    TEXT NOT NULL DEFAULT '',
    subject       TEXT NOT NULL DEFAULT '',
    snippet       TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL DEFAULT '',
    internal_date INTEGER NOT NULL,
    synced_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_gmail_messages_thread  ON gmail_messages(thread_id);
CREATE INDEX idx_gmail_messages_posting ON gmail_messages(posting_id);

-- Unified notifications feed (replies, application-status suggestions/changes).
CREATE TABLE notifications (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kind             TEXT NOT NULL,                                  -- 'reply' | 'app_status'
    posting_id       TEXT REFERENCES job_postings(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    detail           TEXT NOT NULL DEFAULT '',
    suggested_status TEXT NOT NULL DEFAULT '',                       -- app_status suggestion (when autoflip off)
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    seen_at          DATETIME,                                       -- NULL = unread (drives the badge)
    actioned_at      DATETIME                                        -- NULL = suggestion still pending
);
