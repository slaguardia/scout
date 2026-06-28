"""Notifications feed + seen/apply/link routes (slice 5)."""
from __future__ import annotations

import datetime

from web_helpers import new_test_app, open_db

from scout.store import contacts, postings
from scout.store import gmail as gmail_store
from scout.store.contacts import ContactInput, OutreachInput


def _seed_posting(db_path):
    con = open_db(db_path)
    cid = con.execute("SELECT id FROM companies LIMIT 1").fetchone()[0]
    p = postings.add_posting(con, cid, "https://acme.com/jobs/se", "Software Engineer")
    con.close()
    return cid, p.id


def test_notifications_empty(tmp_path, monkeypatch):
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    assert client.get("/api/notifications").json() == {"notifications": [], "unread": 0, "followups": []}


def test_notifications_list_and_seen(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    nid = gmail_store.add_notification(
        con, gmail_store.Notification(kind="reply", posting_id=pid, gmail_message_id="r1",
                                      title="Reply from Pat", detail="Re: SE")
    )
    con.close()

    j = client.get("/api/notifications").json()
    assert j["unread"] == 1
    item = j["notifications"][0]
    assert item["id"] == nid and item["company"] == "Acme" and item["role"] == "Software Engineer"
    assert item["seen"] is False

    r = client.post(f"/api/notifications/{nid}/seen")
    assert r.status_code == 200 and r.json()["unread"] == 0
    assert client.get("/api/notifications").json()["notifications"][0]["seen"] is True


def test_notification_apply_sets_status(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    nid = gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="a1",
                                      title="Suggested: interview", detail="...", suggested_status="interview")
    )
    con.close()

    r = client.post(f"/api/notifications/{nid}/apply")
    assert r.status_code == 200 and r.json()["applied"] == "interview"
    con = open_db(db_path)
    assert postings.get_posting(con, pid).application_status == "interview"
    n = gmail_store.get_notification(con, nid)
    assert n.actioned_at != "" and n.seen_at != ""
    con.close()


def test_redundant_suggestion_is_hidden_and_uncounted(tmp_path, monkeypatch):
    # A suggestion for a status the posting already has (e.g. marked by hand after
    # the email landed) is noise — dropped from the feed and cleared from the badge.
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    postings.set_application_status(con, pid, "applied")
    nid = gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="a1",
                                      title="Suggested status: applied", suggested_status="applied")
    )
    con.close()

    j = client.get("/api/notifications").json()
    assert j["notifications"] == [] and j["unread"] == 0
    con = open_db(db_path)
    assert gmail_store.get_notification(con, nid).seen_at != ""  # marked seen, not actioned
    assert gmail_store.get_notification(con, nid).actioned_at == ""
    con.close()


def test_duplicate_suggestions_collapse_to_newest(tmp_path, monkeypatch):
    # A meeting thread surfaces several emails that all classify the same way —
    # only one suggestion should show (the newest), the rest collapsed.
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    older = gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="m1",
                                      title="Suggested status: interview", suggested_status="interview")
    )
    newer = gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="m2",
                                      title="Suggested status: interview", suggested_status="interview")
    )
    con.close()

    j = client.get("/api/notifications").json()
    assert [n["id"] for n in j["notifications"]] == [newer]  # only the newest survives
    assert j["unread"] == 1
    con = open_db(db_path)
    assert gmail_store.get_notification(con, older).seen_at != ""  # collapsed: seen, not actioned
    assert gmail_store.get_notification(con, older).actioned_at == ""
    con.close()


def test_distinct_status_suggestions_both_show(tmp_path, monkeypatch):
    # Two pending suggestions for the same posting but DIFFERENT statuses are not
    # duplicates — both stay (e.g. a thread that escalated interview -> offer).
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="m1",
                                      title="Suggested status: interview", suggested_status="interview")
    )
    gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="m2",
                                      title="Suggested status: offer", suggested_status="offer")
    )
    con.close()

    statuses = {n["suggested_status"] for n in client.get("/api/notifications").json()["notifications"]}
    assert statuses == {"interview", "offer"}


def test_non_redundant_suggestion_still_shows(tmp_path, monkeypatch):
    # A suggestion that would actually move the posting stays actionable.
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    postings.set_application_status(con, pid, "applied")
    gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id=pid, gmail_message_id="a2",
                                      title="Suggested status: interview", suggested_status="interview")
    )
    con.close()

    j = client.get("/api/notifications").json()
    assert len(j["notifications"]) == 1 and j["notifications"][0]["suggested_status"] == "interview"
    assert j["unread"] == 1


def test_notification_apply_guards(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, pid = _seed_posting(db_path)
    con = open_db(db_path)
    n_nopost = gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", title="x", suggested_status="interview")
    )
    n_nosug = gmail_store.add_notification(
        con, gmail_store.Notification(kind="reply", posting_id=pid, title="y")
    )
    con.close()
    assert client.post(f"/api/notifications/{n_nopost}/apply").status_code == 400
    assert client.post(f"/api/notifications/{n_nosug}/apply").status_code == 400


def test_notification_link_repoints_message_and_enables_apply(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    cid, _pid = _seed_posting(db_path)
    con = open_db(db_path)
    p2 = postings.add_posting(con, cid, "https://acme.com/jobs/pm", "Product Manager")
    nid = gmail_store.add_notification(
        con, gmail_store.Notification(kind="app_status", posting_id="", gmail_message_id="a1",
                                      title="Suggested", suggested_status="applied")
    )
    gmail_store.upsert_gmail_message(
        con, gmail_store.GmailMessage(id="a1", thread_id="t", posting_id="", from_email="x@acme.com", internal_date=1)
    )
    con.close()

    # Apply fails while unlinked, then the manual link points it at p2.
    assert client.post(f"/api/notifications/{nid}/apply").status_code == 400
    r = client.post(f"/api/notifications/{nid}/link", json={"posting_id": p2.id})
    assert r.status_code == 200

    con = open_db(db_path)
    assert gmail_store.get_notification(con, nid).posting_id == p2.id
    assert con.execute("SELECT posting_id FROM gmail_messages WHERE id='a1'").fetchone()[0] == p2.id
    con.close()
    assert client.post(f"/api/notifications/{nid}/apply").status_code == 200


def test_notification_link_unknown_posting_404(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    nid = gmail_store.add_notification(con, gmail_store.Notification(kind="reply", title="x"))
    con.close()
    assert client.post(f"/api/notifications/{nid}/link", json={"posting_id": "nope"}).status_code == 404


def test_notifications_fold_in_followups(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    cid, pid = _seed_posting(db_path)
    con = open_db(db_path)
    c = contacts.create_contact(con, cid, ContactInput(name="Pat", email="pat@acme.com"))
    past = (datetime.date.today() - datetime.timedelta(days=3)).strftime("%Y-%m-%d")
    contacts.log_outreach(con, pid, c.id, OutreachInput(sent_at=past, followup_due_at=past))
    con.close()

    fu = client.get("/api/notifications").json()["followups"]
    assert len(fu) == 1
    assert fu[0]["posting_id"] == pid and fu[0]["contact_name"] == "Pat" and fu[0]["role"] == "Software Engineer"
