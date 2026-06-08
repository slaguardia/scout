-- scout schema, M32
-- Application answers: free-text essay questions on a posting's application form
-- (detected at capture from the ATS), plus a drafted answer per question. One
-- row per question so each is independently editable / regenerable, modeled on
-- outreach_drafts. See docs/application-answers.md.
--
-- q_key is the ATS field id/path ('' when unknown) — kept NOT NULL so the
-- UNIQUE(posting_id, q_key, prompt) idempotency holds (SQLite treats NULLs as
-- distinct, which would let a re-detection duplicate a keyless question).
CREATE TABLE posting_answers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    posting_id  TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    q_key       TEXT NOT NULL DEFAULT '',       -- ATS field id/path; '' when unknown
    prompt      TEXT NOT NULL,                  -- the question text shown to the applicant
    max_length  INTEGER NOT NULL DEFAULT 0,     -- char limit the ATS declares; 0 = unknown
    answer      TEXT NOT NULL DEFAULT '',       -- generated answer
    edited      TEXT NOT NULL DEFAULT '',       -- user edit; wins when non-empty
    status      TEXT NOT NULL DEFAULT 'detected',
        -- detected | generating | ready | needs_review | failed
    fail_reason TEXT NOT NULL DEFAULT '',       -- human-readable cause for status=failed
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(posting_id, q_key, prompt)           -- idempotent re-detection
);

CREATE INDEX idx_posting_answers_posting ON posting_answers(posting_id);

-- Detection summary on the posting itself, so the jobs table/panel can show
-- the form state without joining (mirrors fetch_status/captured_at from M22):
-- questions_status is the QuestionScan.Status ('ok'|'none'|'unsupported'|fetch
-- status), questions_at the last detection run. NULL = never detected.
ALTER TABLE job_postings ADD COLUMN questions_status TEXT;
ALTER TABLE job_postings ADD COLUMN questions_at     DATETIME;
