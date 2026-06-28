"""Subject / signature / follow-up-subject editor endpoints + render (slice 6)."""
from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout.store import gmail as gmail_store
from scout.store import outreach_template


def _put(client, path, content):
    return client.put(path, json={"content": content})


def test_subject_default_and_roundtrip(tmp_path, monkeypatch):
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    assert client.get("/api/outreach-subject").json()["content"] == "Reaching out about the {{role}} role"
    assert _put(client, "/api/outreach-subject", "Re: {{role}} at {{company}}").status_code == 200
    assert client.get("/api/outreach-subject").json()["content"] == "Re: {{role}} at {{company}}"


def test_render_subject_substitutes(db):
    from scout.outreach import template

    assert template.render_subject(db, "Software Engineer", "Acme") == "Reaching out about the Software Engineer role"
    outreach_template.put_subject_template(db, "Re: {{role}} at {{company}}")
    assert template.render_subject(db, "SE", "Acme") == "Re: SE at Acme"


def test_autoflip_toggle_endpoint(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    assert client.get("/api/gmail/status").json()["autoflip"] is False

    r = client.put("/api/gmail/autoflip", json={"enabled": True})
    assert r.status_code == 200 and r.json()["autoflip"] is True
    con = open_db(db_path)
    assert gmail_store.autoflip(con) is True
    con.close()

    assert client.put("/api/gmail/autoflip", json={"enabled": False}).json()["autoflip"] is False
