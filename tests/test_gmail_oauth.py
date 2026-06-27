"""OAuth helpers: consent URL build + code exchange / token refresh (mocked)."""
from __future__ import annotations

import base64
import json
from urllib.parse import parse_qs, urlparse

import pytest

from httpstub import http_server
from scout.gmail import oauth


def _id_token(email: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"email": email}).encode()).decode().rstrip("=")
    return "header." + payload + ".sig"


def test_consent_url_carries_scopes_and_state():
    cfg = oauth.OAuthConfig(client_id="cid", client_secret="sec",
                            redirect_uri="https://app.example/api/gmail/callback")
    url = oauth.consent_url(cfg, "xyz-state")
    assert url.startswith(oauth.GOOGLE_AUTH_URL + "?")
    q = parse_qs(urlparse(url).query)
    assert q["client_id"] == ["cid"]
    assert q["redirect_uri"] == ["https://app.example/api/gmail/callback"]
    assert q["response_type"] == ["code"]
    assert q["access_type"] == ["offline"]
    assert q["prompt"] == ["consent"]
    assert q["state"] == ["xyz-state"]
    scopes = q["scope"][0].split(" ")
    assert len(scopes) == 4 and set(scopes) == set(oauth.SCOPES)


def test_exchange_code_parses_tokens_and_email():
    captured: list = []

    def handle(req):
        captured.append(req)
        return 200, {"Content-Type": "application/json"}, json.dumps({
            "access_token": "at", "refresh_token": "rt", "expires_in": 3599,
            "scope": "openid email", "id_token": _id_token("me@gmail.com"),
        })

    with http_server(handle) as base:
        cfg = oauth.OAuthConfig(client_id="cid", client_secret="sec",
                                redirect_uri="https://app/cb", token_url=base + "/token")
        tok = oauth.exchange_code(cfg, "the-code")

    assert tok.access_token == "at"
    assert tok.refresh_token == "rt"
    assert tok.email == "me@gmail.com"
    body = parse_qs(captured[0].body.decode())
    assert body["grant_type"] == ["authorization_code"]
    assert body["code"] == ["the-code"]
    assert body["client_secret"] == ["sec"]
    assert body["redirect_uri"] == ["https://app/cb"]


def test_refresh_access_token():
    def handle(req):
        body = parse_qs(req.body.decode())
        assert body["grant_type"] == ["refresh_token"]
        assert body["refresh_token"] == ["rt"]
        return 200, {"Content-Type": "application/json"}, json.dumps({"access_token": "fresh", "expires_in": 3599})

    with http_server(handle) as base:
        cfg = oauth.OAuthConfig(client_id="cid", client_secret="sec", token_url=base + "/token")
        assert oauth.refresh_access_token(cfg, "rt") == "fresh"


def test_refresh_raises_on_revoked_grant():
    def handle(req):
        return 400, {"Content-Type": "application/json"}, '{"error":"invalid_grant"}'

    with http_server(handle) as base:
        cfg = oauth.OAuthConfig(client_id="c", client_secret="s", token_url=base + "/token")
        with pytest.raises(oauth.GmailAuthError):
            oauth.refresh_access_token(cfg, "rt")


def test_id_token_email_handles_garbage():
    assert oauth.id_token_email("") == ""
    assert oauth.id_token_email("not-a-jwt") == ""
    assert oauth.id_token_email(_id_token("a@b.com")) == "a@b.com"
