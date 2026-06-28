"""Gmail web routes: status / connect / callback / disconnect (slice 1)."""
from __future__ import annotations

import base64
import json
from urllib.parse import parse_qs, urlparse

from httpstub import http_server
from web_helpers import new_test_app, open_db

from scout.store import gmail as gmail_store


def _clear_oauth_env(monkeypatch):
    for k in ("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REDIRECT_URI", "GMAIL_TOKEN_URL"):
        monkeypatch.delenv(k, raising=False)


def test_status_unconfigured(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    r = client.get("/api/gmail/status")
    assert r.status_code == 200
    assert r.json() == {
        "connected": False, "email": "", "configured": False, "autoflip": False,
        "client_id": "", "redirect_uri": "", "config_source": "",
    }


def test_connect_requires_oauth_config(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    assert client.get("/api/gmail/connect").status_code == 412


def test_config_from_dashboard_lights_up_connect(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    # Unconfigured → connect 412.
    assert client.get("/api/gmail/connect").status_code == 412

    # Store creds from the dashboard → configured, connect works, secret never echoed.
    r = client.put("/api/gmail/config", json={"client_id": "abc.apps.googleusercontent.com", "client_secret": "shh"})
    assert r.status_code == 200 and r.json()["configured"] is True
    st = client.get("/api/gmail/status").json()
    assert st["configured"] is True and st["client_id"] == "abc.apps.googleusercontent.com"
    assert st["config_source"] == "db" and "client_secret" not in st
    assert client.get("/api/gmail/connect").status_code == 200

    # The secret is write-only: editing the id with a blank secret keeps connect working.
    assert client.put("/api/gmail/config", json={"client_id": "def.apps.googleusercontent.com"}).status_code == 200
    con = open_db(db_path)
    assert gmail_store.oauth_client_secret(con) == "shh"
    con.close()

    # Clearing reverts to env (none here) → 412.
    assert client.delete("/api/gmail/config").status_code == 200
    assert client.get("/api/gmail/connect").status_code == 412


def test_config_requires_client_id(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    assert client.put("/api/gmail/config", json={"client_secret": "shh"}).status_code == 400


def test_connect_builds_url_and_persists_state(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    r = client.get("/api/gmail/connect")
    assert r.status_code == 200
    q = parse_qs(urlparse(r.json()["auth_url"]).query)
    assert q["client_id"] == ["cid"]
    assert q["access_type"] == ["offline"]
    assert q["redirect_uri"][0].endswith("/api/gmail/callback")

    con = open_db(db_path)
    assert gmail_store.oauth_state(con) == q["state"][0]
    con.close()


def test_connect_redirect_uses_forwarded_headers(tmp_path, monkeypatch):
    # Behind the edge proxy, the public scheme/host arrive as X-Forwarded-*; the
    # redirect must use them, not the internal host (else redirect_uri_mismatch).
    _clear_oauth_env(monkeypatch)
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    r = client.get(
        "/api/gmail/connect",
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "scout.bingbong.cloud"},
    )
    q = parse_qs(urlparse(r.json()["auth_url"]).query)
    assert q["redirect_uri"] == ["https://scout.bingbong.cloud/api/gmail/callback"]


def test_callback_exchanges_and_stores(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")

    id_token = "h." + base64.urlsafe_b64encode(b'{"email":"me@gmail.com"}').decode().rstrip("=") + ".s"

    def handle(req):
        return 200, {"Content-Type": "application/json"}, json.dumps({
            "access_token": "at", "refresh_token": "rt", "expires_in": 3599, "id_token": id_token,
        })

    with http_server(handle) as base:
        monkeypatch.setenv("GMAIL_TOKEN_URL", base + "/token")
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        url = client.get("/api/gmail/connect").json()["auth_url"]
        state = parse_qs(urlparse(url).query)["state"][0]
        r = client.get(f"/api/gmail/callback?code=abc&state={state}", follow_redirects=False)

    assert r.status_code == 303
    assert "gmail=connected" in r.headers["location"]
    con = open_db(db_path)
    assert gmail_store.refresh_token(con) == "rt"
    assert gmail_store.address(con) == "me@gmail.com"
    assert gmail_store.oauth_state(con) == ""  # consumed
    con.close()


def test_callback_without_refresh_token_errors(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    id_token = "h." + base64.urlsafe_b64encode(b'{"email":"me@gmail.com"}').decode().rstrip("=") + ".s"

    def handle(req):
        # an access-only exchange — no refresh_token issued
        return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "at", "id_token": id_token})

    with http_server(handle) as base:
        monkeypatch.setenv("GMAIL_TOKEN_URL", base + "/token")
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        url = client.get("/api/gmail/connect").json()["auth_url"]
        state = parse_qs(urlparse(url).query)["state"][0]
        r = client.get(f"/api/gmail/callback?code=abc&state={state}", follow_redirects=False)

    assert r.status_code == 303
    assert "gmail=error" in r.headers["location"]
    con = open_db(db_path)
    assert not gmail_store.is_connected(con)
    con.close()


def test_callback_rejects_bad_state(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "sec")
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    client.get("/api/gmail/connect")  # seeds a state

    r = client.get("/api/gmail/callback?code=abc&state=WRONG", follow_redirects=False)
    assert r.status_code == 303
    assert "gmail=error" in r.headers["location"]
    con = open_db(db_path)
    assert not gmail_store.is_connected(con)
    con.close()


def test_sync_now_requires_connection(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    assert client.post("/api/gmail/sync").status_code == 412


def test_sync_now_runs_a_pass(tmp_path, monkeypatch):
    from gmail_fakes import FakeGmail, oauth_env

    fg = FakeGmail(profile_history_id="700")  # no cursor yet → bootstrap pass
    with http_server(fg.handle) as base:
        oauth_env(monkeypatch, base)
        client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
        con = open_db(db_path)
        gmail_store.store_credentials(con, "rt", "me@gmail.com")
        con.close()
        r = client.post("/api/gmail/sync")
    assert r.status_code == 200, r.text
    assert r.json().get("bootstrapped") is True


def test_disconnect_clears(tmp_path, monkeypatch):
    _clear_oauth_env(monkeypatch)
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    gmail_store.store_credentials(con, "rt", "me@gmail.com")
    gmail_store.set_cursor(con, "999")
    con.close()

    r = client.delete("/api/gmail/disconnect")
    assert r.status_code == 200
    assert r.json()["connected"] is False
    con = open_db(db_path)
    assert not gmail_store.is_connected(con)
    assert gmail_store.cursor(con) == ""
    con.close()
