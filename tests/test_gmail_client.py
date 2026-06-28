"""Gmail REST client: lazy token refresh + getProfile / send / history (mocked)."""
from __future__ import annotations

import json

import pytest
from httpstub import http_server

from scout.gmail import oauth
from scout.gmail.client import GmailClient, GmailError, HistoryExpired


def _cfg(base: str) -> oauth.OAuthConfig:
    return oauth.OAuthConfig(client_id="c", client_secret="s", token_url=base + "/token")


def test_client_refreshes_then_gets_profile():
    seen: list = []

    def handle(req):
        seen.append((req.method, req.path))
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT", "expires_in": 3599})
        if req.path.endswith("/profile"):
            assert req.headers.get("Authorization") == "Bearer AT"
            return 200, {"Content-Type": "application/json"}, json.dumps({"emailAddress": "me@gmail.com", "historyId": "123"})
        return 404, {}, "{}"

    with http_server(handle) as base:
        with GmailClient(_cfg(base), "rt", api_base=base) as gc:
            prof = gc.get_profile()

    assert prof["emailAddress"] == "me@gmail.com"
    assert ("POST", "/token") in seen


def test_send_message_threads():
    sent: dict = {}

    def handle(req):
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT"})
        if req.path.endswith("/messages/send"):
            sent["body"] = json.loads(req.body)
            return 200, {"Content-Type": "application/json"}, json.dumps({"id": "m1", "threadId": "t1"})
        return 404, {}, "{}"

    with http_server(handle) as base:
        with GmailClient(_cfg(base), "rt", api_base=base) as gc:
            res = gc.send_message("RAWB64", thread_id="t1")

    assert res["id"] == "m1" and res["threadId"] == "t1"
    assert sent["body"] == {"raw": "RAWB64", "threadId": "t1"}


def test_history_404_raises_expired():
    def handle(req):
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT"})
        return 404, {}, '{"error":{"code":404}}'

    with http_server(handle) as base:
        with GmailClient(_cfg(base), "rt", api_base=base) as gc:
            with pytest.raises(HistoryExpired):
                gc.list_history("999")


def test_401_raises_auth_error():
    def handle(req):
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT"})
        return 401, {}, '{"error":"unauthorized"}'

    with http_server(handle) as base:
        with GmailClient(_cfg(base), "rt", api_base=base) as gc:
            with pytest.raises(oauth.GmailAuthError):
                gc.get_profile()


def test_403_surfaces_google_message():
    # The "API not enabled" 403: the GmailError carries Google's human message
    # (the actionable "Enable it by visiting …" line), not the raw error JSON.
    body = json.dumps({"error": {"code": 403, "message": "Gmail API has not been "
                       "used in project 441450104491 before or it is disabled. "
                       "Enable it by visiting … then retry."}})

    def handle(req):
        if req.path == "/token":
            return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "AT"})
        return 403, {"Content-Type": "application/json"}, body

    with http_server(handle) as base:
        with GmailClient(_cfg(base), "rt", api_base=base) as gc:
            with pytest.raises(GmailError) as ei:
                gc.get_profile()

    msg = str(ei.value)
    assert "Enable it by visiting" in msg
    assert '{"error"' not in msg  # the raw JSON blob is not leaked into the message
