"""Gmail link routes: OAuth connect/callback/status/disconnect (slice 1).

Send (slice 2), the read-sync trigger + notifications (slices 3–5) layer onto this
module as they land. OAuth is hand-rolled (scout/gmail/oauth.py); the refresh
token + address live in settings (scout/store/gmail.py). The callback rides the
existing oauth2-proxy session (the user is already signed in) — no edge change.
"""
from __future__ import annotations

import secrets
import sys

from fastapi import APIRouter, Depends, Request
from starlette.responses import RedirectResponse, Response

from scout.gmail import message as gmail_message
from scout.gmail import oauth
from scout.gmail import sync as gmail_sync
from scout.gmail.client import GmailClient, GmailError
from scout.outreach import template as outreach_template
from scout.store import (
    contacts,
    detail as detail_store,
    errors,
    gmail as gmail_store,
    outreach_drafts,
    postings as postings_store,
)

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


def _parse_int_id(raw_id: str) -> int | None:
    try:
        return int(raw_id)
    except (TypeError, ValueError):
        return None


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


@router.post("/api/gmail/sync")
def gmail_sync_now(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    """Run one read-sync pass on demand ("Sync now"). The 2.5-min poller does this
    on a schedule; this is the manual trigger."""
    if not gmail_store.is_connected(con):
        return json_error("connect Gmail first", 412)
    try:
        res = gmail_sync.sync_once(
            con, anthropic=state.anthropic, log=lambda m: print(m, file=sys.stderr)
        )
    except oauth.GmailAuthError as e:
        return json_error(f"Gmail auth failed — reconnect Gmail: {e}", 412)
    except GmailError as e:
        return json_error(f"Gmail sync failed: {e}", 502)
    return json_response(res)


# --- send a draft via Gmail (slice 2) ----------------------------------------


@router.post("/api/outreach/drafts/{raw_id}/send-gmail")
def send_draft_via_gmail(raw_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Send a reviewed draft from the connected Gmail account to a contact, log the
    send with its Gmail ids (the follow-up auto-arms via log_outreach), and mark the
    draft sent. Threads onto the most recent prior send to the same contact.

    Body: {"contact_id": "..."} — defaults to the company's first emailable contact.
    """
    draft_id = _parse_int_id(raw_id)
    if draft_id is None:
        return json_error("not found", 404)
    d = outreach_drafts.get_outreach_draft(con, draft_id)
    if d is None:
        return json_error("not found", 404)
    if d.status == outreach_drafts.DRAFT_SENT:
        return json_error("draft already sent", 409)
    if d.status == outreach_drafts.DRAFT_RESEARCHING:
        return json_error("draft is still being written", 409)

    if not gmail_store.is_connected(con):
        return json_error("connect Gmail first (Settings → Gmail)", 412)
    cfg = oauth.load_config(con)
    if not cfg.configured():
        return json_error("Gmail OAuth client not configured", 412)

    posting = postings_store.get_posting(con, d.posting_id)
    if posting is None:
        return json_error("posting not found", 404)

    body = decode_json(raw) if raw.strip() else {}
    contact_id = _s(body, "contact_id").strip()
    if not contact_id:
        cand = next((c for c in contacts.list_contacts(con, posting.company_id) if c.email), None)
        if cand is None:
            return json_error("no recipient — add a contact with an email to this company", 400)
        contact_id = cand.id
    contact = contacts.get_contact(con, contact_id)
    if contact is None:
        return json_error("contact not found", 404)
    if not contact.email:
        return json_error("that contact has no email address", 400)

    draft_text = d.edited if d.edited.strip() else d.draft
    if draft_text.strip() == "":
        return json_error("draft is empty", 400)

    company_name, _ = detail_store.get_company_name(con, posting.company_id)
    default_subject = outreach_template.render_subject(con, posting.title, company_name)
    subject, body_text = gmail_message.split_subject(draft_text, default_subject)
    signature = outreach_template.signature_or_default(con)
    if signature.strip():
        body_text = body_text.rstrip() + "\n\n" + signature.strip()

    thread_id, prior_msg = gmail_store.latest_send_thread(con, d.posting_id, contact_id)
    from_addr = gmail_store.address(con)
    refresh = gmail_store.refresh_token(con)

    try:
        with GmailClient(cfg, refresh) as gc:
            in_reply_to = ""
            if prior_msg:
                try:
                    meta = gc.get_message(prior_msg, fmt="metadata")
                    in_reply_to = gmail_message.header_value(meta, "Message-Id")
                except Exception:  # noqa: BLE001 - threading header is best-effort
                    in_reply_to = ""
            raw_b64, _mid = gmail_message.build_raw(
                from_addr, contact.email, subject, body_text, in_reply_to, in_reply_to
            )
            sent = gc.send_message(raw_b64, thread_id=thread_id)
    except oauth.GmailAuthError as e:
        return json_error(f"Gmail auth failed — reconnect Gmail: {e}", 412)
    except GmailError as e:
        return json_error(f"Gmail send failed: {e}", 502)

    msg_id = sent.get("id", "") or ""
    thr = sent.get("threadId", "") or thread_id
    contacts.log_outreach(
        con,
        d.posting_id,
        contact_id,
        contacts.OutreachInput(body=body_text, gmail_message_id=msg_id, gmail_thread_id=thr),
    )
    updated = outreach_drafts.mark_outreach_draft_sent(con, draft_id)
    return json_response(
        {
            "sent": True,
            "gmail_message_id": msg_id,
            "thread_id": thr,
            "contact_id": contact_id,
            "to": contact.email,
            "subject": subject,
            "draft": updated,
        }
    )


# --- notifications feed + manual link (slice 5) ------------------------------


def _notification_view(con, n: gmail_store.Notification) -> dict:
    """A notification enriched with its posting's company + role for display."""
    company = role = ""
    if n.posting_id:
        p = postings_store.get_posting(con, n.posting_id)
        if p is not None:
            role = p.title
            company = detail_store.get_company_name(con, p.company_id)[0]
    return {
        "id": n.id, "kind": n.kind, "posting_id": n.posting_id,
        "gmail_message_id": n.gmail_message_id, "title": n.title, "detail": n.detail,
        "suggested_status": n.suggested_status, "created_at": n.created_at,
        "seen": n.seen_at != "", "actioned": n.actioned_at != "",
        "company": company, "role": role,
    }


@router.get("/api/notifications")
def list_notifications(con=Depends(get_db)) -> Response:
    """The unified feed (replies + application-status), the unread count for the
    bell badge, and the follow-ups-due folded in (derived from outreach_log)."""
    notifs = [_notification_view(con, n) for n in gmail_store.list_notifications(con)]
    followups = [
        {
            "log_id": f.log_id, "posting_id": f.posting_id, "contact_id": f.contact_id,
            "contact_name": f.contact_name, "role": f.role, "company": f.company, "due_at": f.due_at,
        }
        for f in contacts.followups_due(con)
    ]
    return json_response(
        {"notifications": notifs, "unread": gmail_store.unread_count(con), "followups": followups}
    )


@router.post("/api/notifications/{raw_id}/seen")
def notification_seen(raw_id: str, con=Depends(get_db)) -> Response:
    """Mark a notification read (clears it from the unread badge count)."""
    nid = _parse_int_id(raw_id)
    if nid is None:
        return json_error("not found", 404)
    gmail_store.mark_seen(con, nid)
    return json_response({"unread": gmail_store.unread_count(con)})


@router.post("/api/notifications/{raw_id}/apply")
def notification_apply(raw_id: str, con=Depends(get_db)) -> Response:
    """Apply a suggested application status to the linked posting + stamp the
    notification actioned (the one-click confirm when autoflip is off)."""
    nid = _parse_int_id(raw_id)
    if nid is None:
        return json_error("not found", 404)
    n = gmail_store.get_notification(con, nid)
    if n is None:
        return json_error("not found", 404)
    if not n.posting_id:
        return json_error("no role linked — link this to a role first", 400)
    if not n.suggested_status:
        return json_error("nothing to apply", 400)
    try:
        postings_store.set_application_status(con, n.posting_id, n.suggested_status)
    except errors.NotFound:
        return json_error("posting no longer exists", 404)
    gmail_store.mark_actioned(con, nid)
    return json_response({"applied": n.suggested_status, "posting_id": n.posting_id})


@router.post("/api/notifications/{raw_id}/link")
def notification_link(raw_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Re-point a mis-matched notification (and its synced message) at the right
    posting — the manual-link control."""
    nid = _parse_int_id(raw_id)
    if nid is None:
        return json_error("not found", 404)
    if gmail_store.get_notification(con, nid) is None:
        return json_error("not found", 404)
    body = decode_json(raw) if raw.strip() else {}
    posting_id = _s(body, "posting_id").strip()
    if not posting_id:
        return json_error("posting_id is required", 400)
    if postings_store.get_posting(con, posting_id) is None:
        return json_error("posting not found", 404)
    gmail_store.relink_notification(con, nid, posting_id)
    return json_response({"id": nid, "posting_id": posting_id})
