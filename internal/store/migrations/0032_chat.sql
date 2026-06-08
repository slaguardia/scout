-- Chat (scout-local, disposable). Two tables backing the two chat surfaces —
-- the global tracking agent and the per-entity research chat — sharing one
-- engine. Content is stored as the RAW content-block JSON array (not plain
-- text) so tool_use / tool_result / thinking blocks round-trip verbatim into the
-- next API turn (the reason anthropic.ContentBlock.Raw exists). Never written to
-- the brain; deleting a thread cascades its messages.

CREATE TABLE chat_threads (
    id         TEXT PRIMARY KEY,           -- uuid
    scope      TEXT NOT NULL,              -- 'global' | 'company' | 'posting'
    scope_id   TEXT,                       -- company/posting id; NULL for global
    title      TEXT,                       -- first user line, or model-generated
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- One thread per (scope, scope_id): a panel reuses its thread across visits, so
-- the company/posting chat accumulates. Global rows collapse to one (scope_id
-- normalized to '' in the index) — open-or-create returns the existing thread.
CREATE UNIQUE INDEX idx_chat_threads_scope ON chat_threads(scope, COALESCE(scope_id, ''));

CREATE TABLE chat_messages (
    id         TEXT PRIMARY KEY,           -- uuid
    thread_id  TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,              -- 'user' | 'assistant'
    content    TEXT NOT NULL,              -- JSON: the full content-block array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id);
