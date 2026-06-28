"""POST /api/postings/{id}/send-followup — reply on the contact's Gmail thread."""
from __future__ import annotations

import base64
import json

from httpstub import http_server
from web_helpers import new_test_app, open_db

from scout.store import contacts, postings
from scout.store import gmail as gmail_store
from scout.store.contacts import ContactInput, OutreachInput


def _oauth_env(monkeypatch, base: str | None = None):
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    if base:
        monkeypatch.setenv("GMAIL_TOKEN_URL", base + "/token")
        monkeypatch.setenv("GMAIL_API_BASE", base)


def _seed(db_path, *, threaded=True, connect=True, email="recruiter@acme.com"):
    con = open_db(db_path)
    cid = con.execute("SELECT id FROM companies LIMIT 1").fetchone()[0]
    p = postings.add_posting(con, cid, "https://acme.com/jobs/se", "Software Engineer")
    c = contacts.create_contact(con, cid, ContactInput(name="Pat", role="Recruiter", email=email))
    # A prior send the follow-up threads onto (Gmail ids ⇒ latest_send_thread finds it).
    contacts.log_outreach(
        con, p.id, c.id,
        OutreachInput(body="first email", gmail_message_id="m0",
                      gmail_thread_id="thr1" if threaded else ""),
    )
    if connect:
        gmail_store.store_credentials(con, "rt", "me@gmail.com")
    con.close()
    return cid, p.id, c.id


def _stub(captured):
    def handle(req):
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT"})
        if req.path.endswith("/messages/send"):
            captured["send"] = json.loads(req.body)
            return 200, {"Content-Type": "application/json"}, json.dumps({"id": "fmsg1", "threadId": "thr1"})
        if "/messages/" in req.path:  # get_message metadata (threading + subject)
            return 200, {"Content-Type": "application/json"}, json.dumps(
                {"id": "m0", "payload": {"headers": [
                    {"name": "Message-Id", "value": "<prev@mail>"},
                    {"name": "Subject", "value": "Intro re Software Engineer"},
                ]}}
            )
        return 404, {}, "{}"

    return handle


def test_send_followup_requires_connection(tmp_path, monkeypatch):
    _oauth_env(monkeypatch)
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _c, pid, contact_id = _seed(db_path, connect=False)
    r = client.post(f"/api/postings/{pid}/send-followup", json={"contact_id": contact_id, "body": "ping"})
    assert r.status_code == 412


def test_send_followup_requires_a_thread(tmp_path, monkeypatch):
    captured: dict = {}
    with http_server(_stub(captured)) as base:
        _oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        _c, pid, contact_id = _seed(db_path, threaded=False)
        r = client.post(f"/api/postings/{pid}/send-followup", json={"contact_id": contact_id, "body": "ping"})
    assert r.status_code == 400  # nothing in Gmail to reply onto


def test_send_followup_happy_path(tmp_path, monkeypatch):
    captured: dict = {}
    with http_server(_stub(captured)) as base:
        _oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        _c, pid, contact_id = _seed(db_path)
        r = client.post(f"/api/postings/{pid}/send-followup",
                        json={"contact_id": contact_id, "body": "Just following up, Pat."})

    assert r.status_code == 200, r.text
    j = r.json()
    assert j["sent"] is True and j["gmail_message_id"] == "fmsg1" and j["thread_id"] == "thr1"
    assert j["subject"].lower().startswith("re:")  # reply subject

    assert captured["send"].get("threadId") == "thr1"  # same thread
    mime = base64.urlsafe_b64decode(captured["send"]["raw"]).decode()
    assert "To: recruiter@acme.com" in mime and "From: me@gmail.com" in mime
    assert "In-Reply-To: <prev@mail>" in mime
    assert "Just following up, Pat." in mime

    con = open_db(db_path)
    rows = con.execute(
        "SELECT gmail_message_id, gmail_thread_id, body, followup_due_at FROM outreach_log "
        "WHERE posting_id=? ORDER BY id DESC", (pid,)
    ).fetchall()
    con.close()
    assert rows[0][0] == "fmsg1" and rows[0][1] == "thr1"
    assert rows[0][2] == "Just following up, Pat."
    assert rows[0][3]  # the next follow-up auto-armed
