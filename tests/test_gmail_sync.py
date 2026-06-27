"""The read-sync engine: bootstrap, incremental routing, dedupe, status flip,
cursor advance, 404 re-list fallback (mocked Gmail)."""
from __future__ import annotations

from gmail_fakes import FakeGmail, gmail_message, oauth_env
from httpstub import http_server
from outreach_fakes import FakeAnthropic
from scout import anthropic
from scout.gmail import sync
from scout.store import contacts, gmail as gmail_store, postings
from scout.store.companies import Company, upsert_company
from scout.store.contacts import ContactInput, OutreachInput


def _seed(db, *, connect=True, cursor="100"):
    cid = upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/j", "Software Engineer")
    c = contacts.create_contact(db, cid, ContactInput(name="Pat", email="pat@acme.com"))
    if connect:
        gmail_store.store_credentials(db, "rt", "me@gmail.com")
    if cursor:
        gmail_store.set_cursor(db, cursor)
    return cid, p, c


def test_bootstrap_records_cursor_and_address(db, monkeypatch):
    upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    gmail_store.store_credentials(db, "rt", "")  # connected, no address, no cursor
    fg = FakeGmail(profile_history_id="500")
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        res = sync.sync_once(db)
    assert res["bootstrapped"] is True
    assert gmail_store.cursor(db) == "500"
    assert gmail_store.address(db) == "me@gmail.com"


def test_inbound_reply_writes_message_notification_and_flips_status(db, monkeypatch):
    cid, p, c = _seed(db)
    # A prior send pins thread "thread1" to p and seeds outreach_status to "initial contact".
    contacts.log_outreach(db, p.id, c.id, OutreachInput(body="hi", gmail_message_id="sent1", gmail_thread_id="thread1"))
    assert db.execute("SELECT outreach_status FROM job_postings WHERE id=?", (p.id,)).fetchone()[0] == "initial contact"

    reply = gmail_message("r1", "Pat <pat@acme.com>", "me@gmail.com", "Re: SE", "Thanks for reaching out!", thread="thread1")
    fg = FakeGmail(profile_history_id="200", history=["r1"], messages={"r1": reply})
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        res = sync.sync_once(db)

    assert res["replies"] == 1 and res["cursor"] == "200"
    row = db.execute("SELECT posting_id, contact_id, from_email, body FROM gmail_messages WHERE id='r1'").fetchone()
    assert row[0] == p.id and row[1] == c.id and row[2] == "pat@acme.com" and "Thanks" in row[3]
    assert db.execute("SELECT outreach_status FROM job_postings WHERE id=?", (p.id,)).fetchone()[0] == "replied"
    n = db.execute("SELECT kind, posting_id FROM notifications WHERE gmail_message_id='r1'").fetchone()
    assert n[0] == "reply" and n[1] == p.id
    assert gmail_store.cursor(db) == "200"


def test_outbound_spark_send_is_logged(db, monkeypatch):
    cid, p, c = _seed(db)
    out = gmail_message("o1", "me@gmail.com", "pat@acme.com", "Software Engineer — intro", "hello", thread="t-o1")
    fg = FakeGmail(profile_history_id="200", history=["o1"], messages={"o1": out})
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        res = sync.sync_once(db)
    assert res["sends"] == 1
    row = db.execute(
        "SELECT gmail_message_id, gmail_thread_id, followup_due_at FROM outreach_log WHERE posting_id=?", (p.id,)
    ).fetchone()
    assert row[0] == "o1" and row[1] == "t-o1" and row[2]  # follow-up armed


def test_dedupes_our_own_send(db, monkeypatch):
    cid, p, c = _seed(db)
    contacts.log_outreach(db, p.id, c.id, OutreachInput(gmail_message_id="o1", gmail_thread_id="t-o1"))
    out = gmail_message("o1", "me@gmail.com", "pat@acme.com", "x", "body", thread="t-o1")
    fg = FakeGmail(profile_history_id="200", history=["o1"], messages={"o1": out})
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        res = sync.sync_once(db)
    assert res["sends"] == 0
    assert db.execute("SELECT COUNT(*) FROM outreach_log WHERE posting_id=?", (p.id,)).fetchone()[0] == 1


def test_history_404_falls_back_to_relist(db, monkeypatch):
    cid, p, c = _seed(db, cursor="1")
    contacts.log_outreach(db, p.id, c.id, OutreachInput(gmail_message_id="s0", gmail_thread_id="thread1"))
    reply = gmail_message("r9", "pat@acme.com", "me@gmail.com", "Re", "hi again", thread="thread1")
    fg = FakeGmail(profile_history_id="999", history_404=True, list_ids=["r9"], messages={"r9": reply})
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        res = sync.sync_once(db)
    assert res["relisted"] is True
    assert gmail_store.cursor(db) == "999"
    assert db.execute("SELECT 1 FROM gmail_messages WHERE id='r9'").fetchone() is not None


def test_application_sender_is_dropped_in_slice3(db, monkeypatch):
    _seed(db)
    ats = gmail_message("a1", "no-reply@greenhouse.io", "me@gmail.com", "Application received", "We got it")
    fg = FakeGmail(profile_history_id="200", history=["a1"], messages={"a1": ats})
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        res = sync.sync_once(db)
    assert res["apps"] == 0
    assert db.execute("SELECT COUNT(*) FROM gmail_messages").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] == 0


def test_not_connected_is_a_noop(db):
    res = sync.sync_once(db)
    assert res == {"skipped": "not connected"}


# --- application stream (slice 4) --------------------------------------------


def test_application_suggestion_when_autoflip_off(db, monkeypatch):
    cid, p, c = _seed(db)  # contact pat@acme.com; sender below is a non-contact ATS
    ats = gmail_message("a1", "no-reply@greenhouse.io", "me@gmail.com",
                        "Your application to Acme — Software Engineer", "We received your application.")
    fg = FakeGmail(profile_history_id="200", history=["a1"], messages={"a1": ats})
    fa = FakeAnthropic(['{"status":"applied","confidence":0.95}'])
    with http_server(fg.handle) as gbase, http_server(fa.handle) as abase:
        oauth_env(monkeypatch, gbase)
        client = anthropic.Client(api_key="k", endpoint=abase)
        res = sync.sync_once(db, anthropic=client)

    assert res["apps"] == 1
    # autoflip off (default): the status is NOT changed.
    assert db.execute("SELECT application_status FROM job_postings WHERE id=?", (p.id,)).fetchone()[0] == ""
    n = db.execute(
        "SELECT kind, posting_id, suggested_status FROM notifications WHERE gmail_message_id='a1'"
    ).fetchone()
    assert n[0] == "app_status" and n[1] == p.id and n[2] == "applied"
    assert db.execute("SELECT 1 FROM gmail_messages WHERE id='a1'").fetchone() is not None


def test_application_autoflip_on_sets_status(db, monkeypatch):
    cid, p, c = _seed(db)
    gmail_store.set_autoflip(db, True)
    ats = gmail_message("a2", "no-reply@greenhouse.io", "me@gmail.com",
                        "Software Engineer at Acme — interview", "We'd like to schedule an interview.")
    fg = FakeGmail(profile_history_id="200", history=["a2"], messages={"a2": ats})
    fa = FakeAnthropic(['{"status":"interview","confidence":0.92}'])
    with http_server(fg.handle) as gbase, http_server(fa.handle) as abase:
        oauth_env(monkeypatch, gbase)
        client = anthropic.Client(api_key="k", endpoint=abase)
        res = sync.sync_once(db, anthropic=client)

    assert res["apps"] == 1
    assert db.execute("SELECT application_status FROM job_postings WHERE id=?", (p.id,)).fetchone()[0] == "interview"
    # FYI notification: no pending suggestion to apply.
    assert db.execute("SELECT suggested_status FROM notifications WHERE gmail_message_id='a2'").fetchone()[0] == ""


def test_application_autoflip_low_confidence_stays_suggestion(db, monkeypatch):
    cid, p, c = _seed(db)
    gmail_store.set_autoflip(db, True)
    ats = gmail_message("a3", "careers@acme.com", "me@gmail.com", "Software Engineer", "Maybe.")
    fg = FakeGmail(profile_history_id="200", history=["a3"], messages={"a3": ats})
    fa = FakeAnthropic(['{"status":"screening","confidence":0.4}'])  # below the autoflip threshold
    with http_server(fg.handle) as gbase, http_server(fa.handle) as abase:
        oauth_env(monkeypatch, gbase)
        client = anthropic.Client(api_key="k", endpoint=abase)
        sync.sync_once(db, anthropic=client)

    assert db.execute("SELECT application_status FROM job_postings WHERE id=?", (p.id,)).fetchone()[0] == ""
    assert db.execute("SELECT suggested_status FROM notifications WHERE gmail_message_id='a3'").fetchone()[0] == "screening"
