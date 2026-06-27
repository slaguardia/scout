"""Tests for scout.store.contacts."""

import datetime

import pytest

from scout.store import contacts, outreach_template, postings
from scout.store.companies import Company, upsert_company
from scout.store.contacts import (
    ContactInput,
    DuplicateContact,
    OutreachEntryEdit,
    OutreachInput,
)
from scout.store.postings import PostingTracking
from scout.store.statuses import DEFAULT_OUTREACH_STATUSES


def _acme(db) -> str:
    return upsert_company(db, Company(source="test", name="Acme", domain="acme.com", raw_json="{}"))


def _job_row(db):
    rows = postings.list_job_rows(db)
    assert len(rows) == 1
    return rows[0]


def test_contacts_and_outreach_log(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")

    jane = contacts.create_contact(
        db, cid, ContactInput(name="Jane", role="Recruiter", email="Jane@Acme.com")
    )
    assert jane.email == "jane@acme.com"

    with pytest.raises(ValueError):
        contacts.create_contact(db, cid, ContactInput())
    with pytest.raises(DuplicateContact):
        contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))

    bob = contacts.create_contact(db, cid, ContactInput(name="Bob", email="bob@acme.com"))
    assert len(contacts.list_contacts(db, cid)) == 2

    past = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y-%m-%d")

    e1 = contacts.log_outreach(db, p.id, jane.id, OutreachInput(sent_at=past, followup_due_at=past))
    assert e1.followup_due_at == past and e1.followup_done_at == ""
    contacts.log_outreach(db, p.id, bob.id, OutreachInput())

    assert _job_row(db).outreach_count == 2
    assert _job_row(db).followups_due == 1

    contacts.update_outreach_entry(
        db, e1.id, OutreachEntryEdit(note="intro sent", followup_due_at=past, done=True)
    )
    assert _job_row(db).followups_due == 0

    contacts.log_outreach(db, p.id, jane.id, OutreachInput(sent_at=past, followup_due_at=past))
    assert _job_row(db).followups_due == 1

    assert len(contacts.list_outreach_for_posting(db, p.id)) == 3
    contacts.delete_outreach_entry(db, e1.id)
    assert len(contacts.list_outreach_for_posting(db, p.id)) == 2

    contacts.archive_contact(db, bob.id)
    assert len(contacts.list_contacts(db, cid)) == 1

    with pytest.raises(ValueError):
        contacts.log_outreach(db, p.id, "no-such-contact", OutreachInput())


# Verbatim INSERT from migration 0051, exercised against seeded legacy data.
_BACKFILL_CONTACTS = """INSERT OR IGNORE INTO contacts (id, company_id, name, role, email)
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
GROUP BY company_id, email"""


def test_contacts_backfill(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    p2 = postings.add_posting(db, cid, "https://acme.com/jobs/pm", "PM")

    db.execute("ALTER TABLE job_postings ADD COLUMN contacts TEXT")
    blob = '[{"position":"Recruiter","email":"R@Acme.com"},{"position":"","email":"cto@acme.com"},{"position":"no email"}]'
    db.execute("UPDATE job_postings SET contacts = ? WHERE id = ?", (blob, p.id))
    db.execute("UPDATE job_postings SET contacts = ? WHERE id = ?", ("jane@legacy.com, Bob", p2.id))

    db.execute(_BACKFILL_CONTACTS)

    cs = contacts.list_contacts(db, cid)
    assert len(cs) == 2
    by_email = {c.email: c for c in cs}
    assert "r@acme.com" in by_email and by_email["r@acme.com"].role == "Recruiter"
    assert "cto@acme.com" in by_email

    # Idempotent.
    db.execute(_BACKFILL_CONTACTS)
    assert len(contacts.list_contacts(db, cid)) == 2


def test_log_outreach_seeds_reply_status(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    jane = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))

    contacts.log_outreach(db, p.id, jane.id, OutreachInput())
    got = postings._read_posting(db, p.id)
    assert got.outreach_status == DEFAULT_OUTREACH_STATUSES[0]

    postings.update_posting_tracking(db, p.id, PostingTracking(outreach_status="replied"))
    contacts.log_outreach(db, p.id, jane.id, OutreachInput())
    got = postings._read_posting(db, p.id)
    assert got.outreach_status == "replied"


def test_followup_alerts_gated_by_status(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    jane = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))

    def due():
        return _job_row(db).followups_due

    past = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y-%m-%d")
    contacts.log_outreach(db, p.id, jane.id, OutreachInput(sent_at=past, followup_due_at=past))
    assert due() == 1

    postings.update_posting_tracking(db, p.id, PostingTracking(outreach_status="replied"))
    assert due() == 0

    postings.update_posting_tracking(
        db, p.id, PostingTracking(outreach_status=DEFAULT_OUTREACH_STATUSES[0])
    )
    assert due() == 1


def test_outreach_entry_sent_at_round_trips(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    jane = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))
    e = contacts.log_outreach(db, p.id, jane.id, OutreachInput())  # sent_at defaults to today
    assert len(e.sent_at) == 10
    contacts.update_outreach_entry(
        db, e.id, OutreachEntryEdit(sent_at=e.sent_at, followup_due_at=e.followup_due_at, done=True)
    )


def test_followed_up_bumps_last_outreach(db):
    """Ticking 'followed up' counts as outreach, so last_outreach_at advances to
    the day it was ticked (followup_done_at) without disturbing the original send."""
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    jane = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))

    def last():
        return _job_row(db).last_outreach_at

    past = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y-%m-%d")
    e = contacts.log_outreach(db, p.id, jane.id, OutreachInput(sent_at=past, followup_due_at=past))
    assert last() == past

    # Tick "followed up" — last outreach now reflects the follow-up (today, UTC
    # from followup_done_at's CURRENT_TIMESTAMP), not the original send.
    contacts.update_outreach_entry(db, e.id, OutreachEntryEdit(followup_due_at=past, done=True))
    today = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d")
    assert last() == today


def test_outreach_escalation(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    jane = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))

    def due():
        return _job_row(db).followups_due

    today = datetime.date.today().strftime("%Y-%m-%d")
    past = (datetime.date.today() - datetime.timedelta(days=10)).strftime("%Y-%m-%d")

    e = contacts.log_outreach(db, p.id, jane.id, OutreachInput(sent_at=past, followup_due_at=past))
    assert due() == 1

    done = contacts.update_outreach_entry(
        db, e.id, OutreachEntryEdit(followup_due_at=past, done=True)
    )
    assert done.followup_done_at != ""
    assert done.followup_due_at > today
    assert due() == 0

    contacts.update_outreach_entry(db, e.id, OutreachEntryEdit(followup_due_at=past, done=True))
    assert due() == 1

    contacts.update_outreach_entry(db, e.id, OutreachEntryEdit(followup_due_at="", done=True))
    assert due() == 0


def test_outreach_body_persists(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    jane = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))

    e = contacts.log_outreach(
        db, p.id, jane.id, OutreachInput(body="Hi Jane, intro re SE", note="first touch")
    )
    assert e.body == "Hi Jane, intro re SE"
    entries = contacts.list_outreach_for_posting(db, p.id)
    assert len(entries) == 1 and entries[0].body == "Hi Jane, intro re SE"

    upd = contacts.update_outreach_entry(
        db, e.id, OutreachEntryEdit(body=e.body, note=e.note, followup_due_at=e.followup_due_at)
    )
    assert upd.body == "Hi Jane, intro re SE"


def test_followup_template_singleton(db):
    assert outreach_template.get_followup_template(db) == ""
    outreach_template.put_followup_template(db, "Hi {{contact_name}}")
    outreach_template.put_outreach_template(db, "email body")
    assert outreach_template.get_followup_template(db) == "Hi {{contact_name}}"
    assert outreach_template.get_outreach_template(db) == "email body"
