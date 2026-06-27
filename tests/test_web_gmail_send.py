"""POST /api/outreach/drafts/{id}/send-gmail (slice 2)."""
from __future__ import annotations

import base64
import json

from httpstub import http_server
from scout.store import contacts, gmail as gmail_store, outreach_drafts, postings
from scout.store.contacts import ContactInput, OutreachInput
from web_helpers import new_test_app, open_db


def _oauth_env(monkeypatch, base: str | None = None):
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    if base:
        monkeypatch.setenv("GMAIL_TOKEN_URL", base + "/token")
        monkeypatch.setenv("GMAIL_API_BASE", base)


def _seed(db_path, *, with_subject=True, email="recruiter@acme.com", connect=True):
    con = open_db(db_path)
    cid = con.execute("SELECT id FROM companies LIMIT 1").fetchone()[0]
    p = postings.add_posting(con, cid, "https://acme.com/jobs/se", "Software Engineer")
    c = contacts.create_contact(con, cid, ContactInput(name="Pat", role="Recruiter", email=email))
    d = outreach_drafts.create_outreach_draft(con, p.id)
    text = (
        "Subject: Pat | Steven — intro re Software Engineer\n\nHi Pat,\n\nbody here.\n\nThanks,\nSteven"
        if with_subject
        else "Hi Pat,\n\nbody here.\n\nThanks,\nSteven"
    )
    outreach_drafts.set_outreach_draft_result(
        con, d.id, outreach_drafts.DRAFT_AWAITING_REVIEW, "", "", text, "[]", "[]", "", ""
    )
    if connect:
        gmail_store.store_credentials(con, "rt", "me@gmail.com")
    con.close()
    return cid, p.id, c.id, d.id


def _stub(captured):
    def handle(req):
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT"})
        if req.path.endswith("/messages/send"):
            captured["send"] = json.loads(req.body)
            return 200, {"Content-Type": "application/json"}, json.dumps({"id": "sentmsg1", "threadId": "thr1"})
        if "/messages/" in req.path:  # get_message metadata (threading)
            return 200, {"Content-Type": "application/json"}, json.dumps(
                {"id": "prev", "payload": {"headers": [{"name": "Message-Id", "value": "<prev@mail>"}]}}
            )
        return 404, {}, "{}"

    return handle


def test_send_requires_connection(tmp_path, monkeypatch):
    _oauth_env(monkeypatch)
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, _pid, contact_id, did = _seed(db_path, connect=False)
    r = client.post(f"/api/outreach/drafts/{did}/send-gmail", json={"contact_id": contact_id})
    assert r.status_code == 412


def test_send_happy_path(tmp_path, monkeypatch):
    captured: dict = {}
    with http_server(_stub(captured)) as base:
        _oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        _cid2, pid, contact_id, did = _seed(db_path)
        r = client.post(f"/api/outreach/drafts/{did}/send-gmail", json={"contact_id": contact_id})

    assert r.status_code == 200, r.text
    j = r.json()
    assert j["sent"] is True and j["gmail_message_id"] == "sentmsg1" and j["thread_id"] == "thr1"
    assert j["subject"].startswith("Pat | Steven")  # from the draft's Subject line

    mime = base64.urlsafe_b64decode(captured["send"]["raw"]).decode()
    assert "To: recruiter@acme.com" in mime and "From: me@gmail.com" in mime
    assert "Subject:" not in mime.split("\n\n", 1)[1]  # subject not duplicated into the body

    con = open_db(db_path)
    rows = con.execute(
        "SELECT gmail_message_id, gmail_thread_id, body, followup_due_at FROM outreach_log WHERE posting_id=?",
        (pid,),
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "sentmsg1" and rows[0][1] == "thr1"
    assert rows[0][3]  # follow-up armed
    assert outreach_drafts.get_outreach_draft(con, did).status == "sent"
    con.close()


def test_send_defaults_to_first_emailable_contact(tmp_path, monkeypatch):
    captured: dict = {}
    with http_server(_stub(captured)) as base:
        _oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        _cid2, _pid, contact_id, did = _seed(db_path)
        r = client.post(f"/api/outreach/drafts/{did}/send-gmail", json={})  # no contact_id
    assert r.status_code == 200, r.text
    assert r.json()["contact_id"] == contact_id


def test_send_no_subject_uses_default_template(tmp_path, monkeypatch):
    captured: dict = {}
    with http_server(_stub(captured)) as base:
        _oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        _cid2, _pid, contact_id, did = _seed(db_path, with_subject=False)
        r = client.post(f"/api/outreach/drafts/{did}/send-gmail", json={"contact_id": contact_id})
    assert r.status_code == 200, r.text
    assert r.json()["subject"] == "Reaching out about the Software Engineer role"


def test_send_threads_followup(tmp_path, monkeypatch):
    captured: dict = {}
    with http_server(_stub(captured)) as base:
        _oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        _cid2, pid, contact_id, did = _seed(db_path)
        con = open_db(db_path)
        contacts.log_outreach(
            con, pid, contact_id, OutreachInput(body="earlier", gmail_message_id="prev", gmail_thread_id="thr1")
        )
        con.close()
        r = client.post(f"/api/outreach/drafts/{did}/send-gmail", json={"contact_id": contact_id})

    assert r.status_code == 200, r.text
    assert captured["send"]["threadId"] == "thr1"
    mime = base64.urlsafe_b64decode(captured["send"]["raw"]).decode()
    assert "In-Reply-To: <prev@mail>" in mime


def test_send_already_sent_returns_409(tmp_path, monkeypatch):
    _oauth_env(monkeypatch)
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    _cid2, _pid, contact_id, did = _seed(db_path)
    con = open_db(db_path)
    outreach_drafts.mark_outreach_draft_sent(con, did)
    con.close()
    r = client.post(f"/api/outreach/drafts/{did}/send-gmail", json={"contact_id": contact_id})
    assert r.status_code == 409
