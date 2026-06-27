"""Hand-rolled Google OAuth 2.0 for the Gmail link (no SDK).

The web (server) OAuth flow in three pure functions over an OAuthConfig:
  - consent_url(cfg, state) — the URL the browser is sent to (no HTTP call).
  - exchange_code(cfg, code) — POST the returned code for the token set.
  - refresh_access_token(cfg, refresh_token) — POST the refresh token for a fresh
    short-lived access token.

Two POSTs to oauth2.googleapis.com/token cover exchange + refresh, matching the
"direct HTTP, no SDK" house style (scout/anthropic/client.py). The token endpoint
is injectable (cfg.token_url, overridable via the GMAIL_TOKEN_URL env) so tests
point it at a local httpstub.
"""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# The four scopes the consent screen requests: send + read + identity.
SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]


class GmailAuthError(Exception):
    """An OAuth/token failure: a bad code, a revoked refresh token, a transport
    error, or a non-2xx token endpoint response. The poller treats this as "auth
    is gone" — the inbound board goes dark while send may still work."""


@dataclass
class OAuthConfig:
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = ""
    token_url: str = GOOGLE_TOKEN_URL
    auth_url: str = GOOGLE_AUTH_URL

    def configured(self) -> bool:
        """Whether the OAuth client credentials are present (the redirect can be
        derived from the request, so it isn't part of the gate)."""
        return bool(self.client_id and self.client_secret)


@dataclass
class TokenResponse:
    access_token: str = ""
    refresh_token: str = ""
    expires_in: int = 0
    scope: str = ""
    id_token: str = ""
    email: str = ""  # parsed from the id_token's email claim


def load_config(con, redirect_uri: str = "") -> OAuthConfig:
    """Build an OAuthConfig from the DB-over-env client credentials. redirect_uri,
    when given, overrides the configured one (the connect route derives it from the
    request base URL). token_url/auth_url honor env overrides for tests."""
    from scout.store import gmail as gmail_store

    return OAuthConfig(
        client_id=gmail_store.oauth_client_id(con),
        client_secret=gmail_store.oauth_client_secret(con),
        redirect_uri=redirect_uri or gmail_store.oauth_redirect_uri(con),
        token_url=os.environ.get("GMAIL_TOKEN_URL") or GOOGLE_TOKEN_URL,
        auth_url=os.environ.get("GMAIL_AUTH_URL") or GOOGLE_AUTH_URL,
    )


def consent_url(cfg: OAuthConfig, state: str) -> str:
    """The Google consent URL: offline access (so a refresh token is issued),
    prompt=consent (so one is issued even on a re-grant), the CSRF state, and the
    four scopes."""
    params = {
        "client_id": cfg.client_id,
        "redirect_uri": cfg.redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    return cfg.auth_url + "?" + urlencode(params)


def _post_token(cfg: OAuthConfig, data: dict, http: httpx.Client | None = None) -> dict:
    own = http is None
    client = http or httpx.Client(timeout=30.0)
    try:
        try:
            resp = client.post(cfg.token_url, data=data)
        except httpx.RequestError as e:
            raise GmailAuthError(f"token request failed: {e}")
        if resp.status_code != 200:
            raise GmailAuthError(f"token endpoint HTTP {resp.status_code}: {resp.text}")
        try:
            return resp.json()
        except ValueError as e:
            raise GmailAuthError(f"token decode: {e}")
    finally:
        if own:
            client.close()


def exchange_code(cfg: OAuthConfig, code: str, http: httpx.Client | None = None) -> TokenResponse:
    """Exchange an authorization code for the token set (access + refresh + id)."""
    raw = _post_token(
        cfg,
        {
            "code": code,
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
            "redirect_uri": cfg.redirect_uri,
            "grant_type": "authorization_code",
        },
        http=http,
    )
    tr = TokenResponse(
        access_token=raw.get("access_token", "") or "",
        refresh_token=raw.get("refresh_token", "") or "",
        expires_in=int(raw.get("expires_in", 0) or 0),
        scope=raw.get("scope", "") or "",
        id_token=raw.get("id_token", "") or "",
    )
    tr.email = id_token_email(tr.id_token)
    return tr


def refresh_access_token(cfg: OAuthConfig, refresh_token: str, http: httpx.Client | None = None) -> str:
    """Trade the stored refresh token for a fresh access token. Raises
    GmailAuthError when the grant is gone (the caller degrades to send-only)."""
    raw = _post_token(
        cfg,
        {
            "refresh_token": refresh_token,
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
            "grant_type": "refresh_token",
        },
        http=http,
    )
    token = raw.get("access_token", "") or ""
    if not token:
        raise GmailAuthError("token refresh returned no access_token")
    return token


def id_token_email(id_token: str) -> str:
    """The `email` claim from a Google id_token (a JWT). The token came straight
    from Google's token endpoint over TLS, so the payload is read without
    re-verifying the signature. "" when absent/unparseable."""
    if not id_token:
        return ""
    parts = id_token.split(".")
    if len(parts) != 3:
        return ""
    payload = parts[1]
    payload += "=" * (-len(payload) % 4)  # restore base64url padding
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
    except Exception:  # noqa: BLE001 - any malformed token → no email
        return ""
    return str(data.get("email", "") or "")
