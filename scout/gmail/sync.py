"""The Gmail read-sync poller: history.list → route → write, every 150s.

A daemon thread in cmd_serve (mirrors criteria.reconcile_loop), plus an on-demand
POST /api/gmail/sync and `scout gmail sync`. Cursor-based + incremental; a 404 on
the cursor (historyId too old) falls back to a bounded re-list and resets it. Only
messages matching a tracked contact (outreach) or — via classify.py (slice 4) — a
tracked company/ATS (application) are stored; the general inbox is never ingested.
"""
from __future__ import annotations

import datetime
from collections.abc import Callable

from scout.store import contacts as contacts_store
from scout.store import gmail as gmail_store
from scout.store import postings as postings_store
from scout.store import statuses as statuses_store
from scout.store._helpers import tx
from scout.store.db import connect

from . import match, oauth
from .client import GmailClient, HistoryExpired

_RELIST_CAP = 50  # bounded re-list size when the cursor has expired
_STARTUP_DELAY = 20.0  # let the server finish coming up before the first pass


def _noop(_msg: str) -> None:
    pass


def _now_utc() -> str:
    """UTC wall-clock in the same 'YYYY-MM-DD HH:MM:SS' shape SQLite's
    CURRENT_TIMESTAMP uses, so it round-trips with the other stored timestamps."""
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")


def _date_from_internal(ms: int) -> str:
    """A Gmail internalDate (epoch ms) as a 'YYYY-MM-DD' UTC date, or "" when
    absent — so a synced/self-healed send carries the date it actually went out
    instead of today's. Empty falls back to log_outreach's today default."""
    if not ms:
        return ""
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).strftime("%Y-%m-%d")


def replied_label(labels: list[str]) -> str:
    """The configured "replied" label: a literal "replied" if present, else the
    third label (the default vocabulary's "replied" slot), else ""."""
    for label in labels:
        if label.strip().lower() == "replied":
            return label
    # No literal "replied" in a customized vocabulary → don't guess a positional
    # label (writing a wrong status is worse than not flipping); the reply still
    # gets its message row + notification, just no auto status change.
    return ""


def _flip_to_replied(con, posting_id: str) -> None:
    """Flip a posting's outreach_status to the replied label while it's still in
    the awaiting phase (blank or the first label) — this silences the ⏰ follow-up
    nag. Never overwrites a hand-set later status."""
    labels = statuses_store.outreach_statuses(con)
    replied = replied_label(labels)
    if not replied:
        return
    first = labels[0] if labels else ""
    con.execute(
        "UPDATE job_postings SET outreach_status = ? "
        "WHERE id = ? AND (COALESCE(outreach_status, '') = '' OR outreach_status = ?)",
        (replied, posting_id, first),
    )


def _handle_outreach(con, routed: match.Routed, log: Callable[[str], None]) -> None:
    parsed = routed.parsed
    contact = routed.contact
    posting_id = match.resolve_posting(con, contact.company_id, parsed)

    if routed.direction == match.DIRECTION_INBOUND:
        who = contact.name or contact.email or parsed.from_email
        # One transaction so the message row (the dedupe key) and its reply
        # notification commit together — a notification failure can't leave the
        # message deduped-out with no alert.
        with tx(con):
            gmail_store.upsert_gmail_message(
                con,
                gmail_store.GmailMessage(
                    id=parsed.id, thread_id=parsed.thread_id, posting_id=posting_id, contact_id=contact.id,
                    from_email=parsed.from_email, subject=parsed.subject, snippet=parsed.snippet,
                    body=parsed.body, internal_date=parsed.internal_date,
                ),
            )
            if posting_id:
                _flip_to_replied(con, posting_id)
            gmail_store.add_notification(
                con,
                gmail_store.Notification(
                    kind=gmail_store.NOTIF_REPLY, posting_id=posting_id, gmail_message_id=parsed.id,
                    title=f"Reply from {who}", detail=parsed.subject or parsed.snippet,
                ),
            )
        log(f"gmail: reply from {who} on posting {posting_id or '(unlinked)'}")
    else:
        # An outbound send we made from Spark (not via scout): log it so tracking +
        # the follow-up arm. Our own scout sends are already in outreach_log and are
        # deduped before this call.
        if not posting_id:
            return
        contacts_store.log_outreach(
            con, posting_id, contact.id,
            contacts_store.OutreachInput(
                sent_at=_date_from_internal(parsed.internal_date),
                body=parsed.body, gmail_message_id=parsed.id, gmail_thread_id=parsed.thread_id,
            ),
        )
        log(f"gmail: synced an outbound send to {contact.email} on posting {posting_id}")


def _handle_application(con, routed: match.Routed, anthropic_client, model: str, log) -> bool:
    """Application stream: classify the email (Haiku) into an application stage,
    match it to a posting, then either auto-set the status (autoflip on + a
    confident match) or write a one-click 'suggested' notification. Returns whether
    it acted. A missing/keyless Anthropic client drops the message (board dark)."""
    if anthropic_client is None or not anthropic_client.has_key():
        return False
    from . import classify

    parsed = routed.parsed
    labels = statuses_store.application_stages(con)
    try:
        label, conf = classify.classify_application(anthropic_client, model, parsed.subject, parsed.body, labels)
    except Exception as e:  # noqa: BLE001 - a classifier failure must not sink the pass
        log(f"gmail: application classify failed: {e}")
        return False
    if not label:
        return False

    posting_id = classify.match_application(con, parsed)
    want_auto = gmail_store.autoflip(con) and bool(posting_id) and conf >= classify.AUTOFLIP_CONF_THRESHOLD

    # Message row + status change + notification commit together (the dedupe key and
    # the alert can't diverge). A failed auto-apply falls back to a suggestion so the
    # user can still act, rather than an "already applied" message that misleads.
    applied = False
    with tx(con):
        gmail_store.upsert_gmail_message(
            con,
            gmail_store.GmailMessage(
                id=parsed.id, thread_id=parsed.thread_id, posting_id=posting_id, contact_id="",
                from_email=parsed.from_email, subject=parsed.subject, snippet=parsed.snippet,
                body=parsed.body, internal_date=parsed.internal_date,
            ),
        )
        if want_auto:
            try:
                postings_store.set_application_status(con, posting_id, label)
                applied = True
            except Exception as e:  # noqa: BLE001 - fall back to a suggestion below
                log(f"gmail: set application_status failed: {e}")
        if applied:
            gmail_store.add_notification(
                con,
                gmail_store.Notification(
                    kind=gmail_store.NOTIF_APP_STATUS, posting_id=posting_id, gmail_message_id=parsed.id,
                    title=f"Application status → {label}", detail=parsed.subject or parsed.snippet,
                    suggested_status="",  # FYI: already applied, no pending action
                ),
            )
        else:
            gmail_store.add_notification(
                con,
                gmail_store.Notification(
                    kind=gmail_store.NOTIF_APP_STATUS, posting_id=posting_id, gmail_message_id=parsed.id,
                    title=f"Suggested status: {label}", detail=parsed.subject or parsed.snippet,
                    suggested_status=label,
                ),
            )
    if applied:
        log(f"gmail: auto-set application_status={label} on posting {posting_id}")
    else:
        log(f"gmail: suggested application_status={label} for posting {posting_id or '(unlinked)'}")
    return True


def _collect_history(gc, cursor: str):
    """Walk messageAdded history since the cursor; return (message_ids, new_cursor)."""
    ids: list[str] = []
    page = ""
    new_cursor = cursor
    while True:
        resp = gc.list_history(cursor, page_token=page)
        new_cursor = str(resp.get("historyId", new_cursor) or new_cursor)
        for h in resp.get("history", []) or []:
            for added in h.get("messagesAdded", []) or []:
                mid = (added.get("message", {}) or {}).get("id")
                if mid:
                    ids.append(mid)
        page = resp.get("nextPageToken", "") or ""
        if not page:
            break
    return list(dict.fromkeys(ids)), new_cursor


def _bounded_relist(gc):
    """Cursor expired: reset to the profile's current historyId and re-scan a
    bounded slice of recent messages (the mailbox is go-forward, so this catches
    anything since the lost cursor without backfilling the whole inbox)."""
    prof = gc.get_profile()
    new_cursor = str(prof.get("historyId", "") or "")
    resp = gc.list_messages(max_results=_RELIST_CAP)
    ids = [m.get("id") for m in (resp.get("messages", []) or []) if m.get("id")]
    return ids, new_cursor


def sync_once(
    con, anthropic=None, model: str = "", log: Callable[[str], None] | None = None,
    reconcile: bool = False,
) -> dict:
    """Run one sync pass. Returns a small summary dict. Raises GmailAuthError when
    the grant is gone (the caller degrades to send-only).

    reconcile=True treats Gmail as the source of truth: it re-lists a bounded
    slice of recent messages (cursor-independent) and re-adds any send/reply that
    is in the mailbox but missing from the log — self-healing a send that was
    deleted from a contact. The incremental cursor is left untouched so the next
    forward pass still picks up the gap. The default forward-only pass never
    re-examines an already-seen message, which is why a delete doesn't return."""
    log = log or _noop
    if not gmail_store.is_connected(con):
        return {"skipped": "not connected"}

    cfg = oauth.load_config(con)
    refresh = gmail_store.refresh_token(con)
    with GmailClient(cfg, refresh) as gc:
        our = gmail_store.address(con)
        cursor = gmail_store.cursor(con)

        # Bootstrap: no cursor → record the current historyId and go forward only.
        if not cursor:
            prof = gc.get_profile()
            if not our:
                our = prof.get("emailAddress", "") or ""
                gmail_store.store_credentials(con, "", our)
            hid = str(prof.get("historyId", "") or "")
            gmail_store.set_cursor(con, hid)
            gmail_store.set_last_sync_at(con, _now_utc())
            return {"bootstrapped": True, "cursor": hid}

        if reconcile:
            # Source-of-truth pass: re-scan recent messages without advancing the
            # incremental cursor, so missing sends/replies are re-added.
            ids, _ = _bounded_relist(gc)
            new_cursor, relisted = "", True
        else:
            try:
                ids, new_cursor = _collect_history(gc, cursor)
                relisted = False
            except HistoryExpired:
                ids, new_cursor = _bounded_relist(gc)
                relisted = True

        replies = sends = apps = 0
        for mid in ids:
            # Idempotent: skip a message already synced inbound or already a logged send.
            if gmail_store.message_exists(con, mid) or gmail_store.outreach_log_has_message(con, mid):
                continue
            full = gc.get_message(mid)
            parsed = match.parse_message(full)
            routed = match.route_message(con, parsed, our)
            if routed.stream == match.STREAM_OUTREACH:
                _handle_outreach(con, routed, log)
                if routed.direction == match.DIRECTION_INBOUND:
                    replies += 1
                else:
                    sends += 1
            elif routed.stream == match.STREAM_APPLICATION:
                if _handle_application(con, routed, anthropic, model, log):
                    apps += 1
            # STREAM_DROP: a message matching neither stream is ignored, never stored.

        if new_cursor:
            gmail_store.set_cursor(con, new_cursor)
        gmail_store.set_last_sync_at(con, _now_utc())
        return {
            "scanned": len(ids), "replies": replies, "sends": sends,
            "apps": apps, "relisted": relisted, "cursor": new_cursor,
        }


def sync_loop(stop, interval, db_path, anthropic=None, model="", log=None):
    """Periodically run sync_once until stop is set (the cmd_serve daemon thread).
    Mirrors criteria.reconcile_loop: a short startup delay, then every interval. A
    failing pass is logged and the loop continues; the cursor only advances on a
    clean pass, so a transient failure just retries idempotently next time."""
    log = log or _noop
    if interval <= 0:
        return
    if stop.wait(_STARTUP_DELAY):
        return
    while True:
        con = connect(db_path)
        try:
            if gmail_store.is_connected(con):
                sync_once(con, anthropic=anthropic, model=model, log=log)
        except oauth.GmailAuthError as e:
            log(f"gmail sync: auth gone ({e}); inbound board dark until reconnect")
        except Exception as e:  # noqa: BLE001 - never let the poller thread die
            log(f"gmail sync: {e}")
        finally:
            con.close()
        if stop.wait(interval):
            return
