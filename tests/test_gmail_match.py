"""Message parsing + stream routing + posting resolution (slice 3)."""
from __future__ import annotations

from gmail_fakes import gmail_message
from scout.gmail import match
from scout.store import contacts, postings
from scout.store.companies import Company, upsert_company
from scout.store.contacts import ContactInput, OutreachInput


def test_parse_message_extracts_fields():
    full = gmail_message("m1", "Pat Lee <pat@acme.com>", "me@gmail.com", "Re: SE", "Body text here", thread="t9")
    p = match.parse_message(full)
    assert p.id == "m1" and p.thread_id == "t9"
    assert p.from_email == "pat@acme.com"
    assert p.to_emails == ["me@gmail.com"]
    assert p.subject == "Re: SE"
    assert "Body text here" in p.body
    assert p.internal_date == 170000000000


def _seed(db):
    cid = upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/j", "Software Engineer")
    c = contacts.create_contact(db, cid, ContactInput(name="Pat", email="pat@acme.com"))
    return cid, p, c


def test_route_inbound_from_contact_is_outreach(db):
    _seed(db)
    parsed = match.parse_message(gmail_message("m1", "pat@acme.com", "me@gmail.com", "hi", "hello"))
    r = match.route_message(db, parsed, "me@gmail.com")
    assert r.stream == match.STREAM_OUTREACH
    assert r.direction == match.DIRECTION_INBOUND
    assert r.contact.email == "pat@acme.com"


def test_route_outbound_to_contact_is_outreach(db):
    _seed(db)
    parsed = match.parse_message(gmail_message("m2", "me@gmail.com", "pat@acme.com", "hi", "hello"))
    r = match.route_message(db, parsed, "me@gmail.com")
    assert r.stream == match.STREAM_OUTREACH
    assert r.direction == match.DIRECTION_OUTBOUND
    assert r.counterparty == "pat@acme.com"


def test_route_inbound_non_contact_is_application(db):
    _seed(db)
    parsed = match.parse_message(gmail_message("m3", "no-reply@greenhouse.io", "me@gmail.com", "Got it", "received"))
    r = match.route_message(db, parsed, "me@gmail.com")
    assert r.stream == match.STREAM_APPLICATION
    assert r.counterparty == "no-reply@greenhouse.io"


def test_route_outbound_to_stranger_drops(db):
    _seed(db)
    parsed = match.parse_message(gmail_message("m4", "me@gmail.com", "friend@example.com", "lunch", "hey"))
    r = match.route_message(db, parsed, "me@gmail.com")
    assert r.stream == match.STREAM_DROP


def test_resolve_posting_thread_then_role_then_recent(db):
    cid, p, c = _seed(db)
    p2 = postings.add_posting(db, cid, "https://acme.com/j2", "Product Manager")

    # 1. thread-id wins: a prior send pinned thread "tA" to posting p.
    contacts.log_outreach(db, p.id, c.id, OutreachInput(gmail_message_id="s1", gmail_thread_id="tA"))
    parsed = match.parse_message(gmail_message("x", "pat@acme.com", "me@gmail.com", "anything", "x", thread="tA"))
    assert match.resolve_posting(db, cid, parsed) == p.id

    # 2. no pinned thread, role named in the subject → that posting.
    parsed = match.parse_message(gmail_message("y", "pat@acme.com", "me@gmail.com", "the Product Manager role", "x", thread="tNEW"))
    assert match.resolve_posting(db, cid, parsed) == p2.id

    # 3. no thread, no role → most-recent posting (p2 was added last).
    parsed = match.parse_message(gmail_message("z", "pat@acme.com", "me@gmail.com", "unrelated", "x", thread="tNEW2"))
    assert match.resolve_posting(db, cid, parsed) == p2.id


def test_match_role_prefers_longest_title(db):
    cid, p, c = _seed(db)  # "Software Engineer"
    p2 = postings.add_posting(db, cid, "https://acme.com/j2", "Senior Software Engineer")
    ps = postings.list_postings(db, cid)
    assert match.match_role_in_text(ps, "about the Senior Software Engineer position") == p2.id
