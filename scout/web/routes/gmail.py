"""Gmail link routes: OAuth connect/callback/status/disconnect (slice 1).

Send (slice 2), the read-sync trigger + notifications (slices 3–5) layer onto this
module as they land. OAuth is hand-rolled (scout/gmail/oauth.py); the refresh
token + address live in settings (scout/store/gmail.py). The callback rides the
existing oauth2-proxy session (the user is already signed in) — no edge change.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Request
from starlette.responses import RedirectResponse, Response

from scout.gmail import oauth
from scout.store import gmail as gmail_store

from ..deps import get_db
from ..responses import json_error, json_response

router = APIRouter()


def _effective_redirect(request: Request, cfg: oauth.OAuthConfig) -> str:
    """The configured redirect override, else one derived from this request's base
    URL. Connect and callback derive it identically (same host), so the value
    Google sees at exchange matches the one in the consent URL."""
    if cfg.redirect_uri:
        return cfg.redirect_uri
    return str(request.base_url).rstrip("/") + "/api/gmail/callback"


@router.get("/api/gmail/status")
def gmail_status(con=Depends(get_db)) -> Response:
    """Whether a Gmail account is connected, its address, whether the OAuth client
    is configured at all, and the application-status autoflip preference."""
    return json_response(
        {
            "connected": gmail_store.is_connected(con),
            "email": gmail_store.address(con),
            "configured": oauth.load_config(con).configured(),
            "autoflip": gmail_store.autoflip(con),
        }
    )


@router.get("/api/gmail/connect")
def gmail_connect(request: Request, con=Depends(get_db)) -> Response:
    """Start the OAuth flow: mint a CSRF state, store it, return the consent URL for
    the browser to navigate to. 412 when the OAuth client isn't configured."""
    cfg = oauth.load_config(con)
    if not cfg.configured():
        return json_error(
            "Gmail OAuth client not configured — set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET", 412
        )
    cfg.redirect_uri = _effective_redirect(request, cfg)
    state = secrets.token_urlsafe(24)
    gmail_store.set_oauth_state(con, state)
    return json_response({"auth_url": oauth.consent_url(cfg, state)})


@router.get("/api/gmail/callback")
def gmail_callback(
    request: Request, code: str = "", state: str = "", con=Depends(get_db)
) -> Response:
    """Google's redirect lands here (in the browser). Verify the CSRF state,
    exchange the code, store the refresh token + address, then bounce back to the
    SPA. Any failure redirects with ?gmail=error rather than dumping a raw error."""
    expected = gmail_store.oauth_state(con)
    if not code or not state or not expected or state != expected:
        return RedirectResponse("/?gmail=error", status_code=303)
    gmail_store.clear_oauth_state(con)

    cfg = oauth.load_config(con)
    cfg.redirect_uri = _effective_redirect(request, cfg)
    try:
        tok = oauth.exchange_code(cfg, code)
    except oauth.GmailAuthError:
        return RedirectResponse("/?gmail=error", status_code=303)

    email = tok.email
    if not email and tok.refresh_token:
        # No email claim in the id_token → fall back to the Gmail profile.
        try:
            from scout.gmail.client import GmailClient

            with GmailClient(cfg, tok.refresh_token, access_token=tok.access_token) as gc:
                email = gc.get_profile().get("emailAddress", "")
        except Exception:  # noqa: BLE001 - the address is best-effort; the token still connects
            email = ""

    gmail_store.store_credentials(con, tok.refresh_token, email)
    return RedirectResponse("/?gmail=connected", status_code=303)


@router.delete("/api/gmail/disconnect")
def gmail_disconnect(con=Depends(get_db)) -> Response:
    """Drop the stored token, address, and sync cursor. Send + read go dark; the
    synced data stays local. The OAuth client config + autoflip pref are kept."""
    gmail_store.clear_credentials(con)
    return json_response({"connected": False, "email": ""})
