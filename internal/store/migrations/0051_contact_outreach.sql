-- scout schema, M51
-- Per-contact outreach tracking. The old posting-level `contacts` column (M24)
-- was an opaque JSON blob — fine for listing mailto links, useless for "who did
-- I email, when, and who do I owe a follow-up." This promotes contacts to
-- first-class COMPANY-level rows (one recruiter, reused across that company's
-- roles), logs each send to a contact, and arms a follow-up date on the send so
-- a due-date query can drive the jobs-view "follow-ups due" banner.
--
-- Outreach + follow-ups are POSTING-scoped (you log from a posting's panel).
-- The per-contact send is now the SOURCE OF TRUTH for "how many / when last," so
-- the posting-level outreach_count + last_outreach_at columns (and the manual
-- stepper they backed) are dropped — those are derived from outreach_log now.

CREATE TABLE contacts (
    id          TEXT PRIMARY KEY,                                   -- uuid
    company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',                           -- person's name; "" allowed (email-only)
    role        TEXT NOT NULL DEFAULT '',                           -- "Recruiter", "VP Eng", …
    email       TEXT NOT NULL DEFAULT '',
    archived_at DATETIME,                                           -- soft-delete; NULL = active
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_contacts_company ON contacts(company_id);
-- Email is the contact's identity within a company (when set); name-only
-- contacts (email = '') are exempt so several can coexist.
CREATE UNIQUE INDEX idx_contacts_company_email ON contacts(company_id, email) WHERE email <> '';

-- One immutable row per outreach send to a contact. The follow-up fields ride
-- the send: each send carries "and follow up by X." The active follow-up for a
-- (contact, posting) thread is simply the LATEST send's, until it's marked done
-- (followup_done_at) or superseded by a newer send. Re-arming = logging again.
CREATE TABLE outreach_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id       TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    posting_id       TEXT NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    sent_at          DATE NOT NULL DEFAULT (DATE('now')),
    note             TEXT NOT NULL DEFAULT '',
    followup_due_at  DATE,                                          -- NULL = no follow-up wanted
    followup_done_at DATETIME,                                      -- NULL = still pending
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_outreach_log_contact ON outreach_log(contact_id);
CREATE INDEX idx_outreach_log_posting ON outreach_log(posting_id);

-- Backfill company-level contacts from the legacy posting-level JSON blob. Only
-- well-formed JSON arrays migrate (legacy free-form strings are left in the old
-- column for the user to re-add); email-less entries are skipped (an email is
-- the identity here), and duplicates collapse by (company, email).
INSERT OR IGNORE INTO contacts (id, company_id, name, role, email)
SELECT lower(hex(randomblob(16))), company_id, '', MIN(role), email
FROM (
    SELECT p.company_id AS company_id,
           COALESCE(json_extract(e.value, '$.position'), '') AS role,
           lower(json_extract(e.value, '$.email')) AS email
    FROM job_postings p
    JOIN json_each(CASE WHEN json_valid(p.contacts) AND json_type(p.contacts) = 'array'
                        THEN p.contacts ELSE '[]' END) e
    WHERE COALESCE(json_extract(e.value, '$.email'), '') <> ''
)
GROUP BY company_id, email;

-- Drop the now-derived posting-level outreach aggregate columns.
ALTER TABLE job_postings DROP COLUMN outreach_count;
ALTER TABLE job_postings DROP COLUMN last_outreach_at;

-- Drop the legacy free-form contacts blob now that it's backfilled into the
-- company-level contacts table (the jobs view derives its contacts column from
-- there). Done last so the backfill above still has it to read.
ALTER TABLE job_postings DROP COLUMN contacts;
