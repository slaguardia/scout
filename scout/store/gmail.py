"""Gmail link: stored credentials, sync cursor, synced messages, notifications.

The OAuth refresh token, the connected address, the incremental-sync cursor
(Gmail historyId), the CSRF state, and the application-status autoflip toggle all
live as rows in the generic `settings` table — same place as the Anthropic key,
acceptable for a personal local DB. The OAuth *client* credentials (id/secret/
redirect) resolve DB-over-env, mirroring the Anthropic-key precedence.

The `gmail_messages` and `notifications` helpers below back the read-sync streams
(M55); the tables ship in migrations/0055_gmail.sql.
"""
from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass

from . import settings

# --- settings keys -----------------------------------------------------------

GMAIL_REFRESH_TOKEN_SETTING = "gmail_refresh_token"
GMAIL_ADDRESS_SETTING = "gmail_address"
GMAIL_CURSOR_SETTING = "gmail_sync_cursor"  # the last-seen Gmail historyId
GMAIL_OAUTH_STATE_SETTING = "gmail_oauth_state"  # in-flight CSRF nonce
GMAIL_AUTOFLIP_SETTING = "application_status_autoflip"  # "1" → auto-apply app status

# OAuth client config. A DB value wins over the env var (Anthropic-key precedence).
GMAIL_CLIENT_ID_SETTING = "gmail_client_id"
GMAIL_CLIENT_SECRET_SETTING = "gmail_client_secret"
GMAIL_REDIRECT_URI_SETTING = "gmail_redirect_uri"
GMAIL_CLIENT_ID_ENV = "GMAIL_CLIENT_ID"
GMAIL_CLIENT_SECRET_ENV = "GMAIL_CLIENT_SECRET"
GMAIL_REDIRECT_URI_ENV = "GMAIL_REDIRECT_URI"


def _db_or_env(con: sqlite3.Connection, key: str, env: str) -> str:
    """A stored setting, falling back to the environment when unset."""
    v = settings.get_setting(con, key)
    if v:
        return v
    return os.environ.get(env, "")


# --- OAuth client config (DB-over-env) ---------------------------------------


def oauth_client_id(con: sqlite3.Connection) -> str:
    return _db_or_env(con, GMAIL_CLIENT_ID_SETTING, GMAIL_CLIENT_ID_ENV)


def oauth_client_secret(con: sqlite3.Connection) -> str:
    return _db_or_env(con, GMAIL_CLIENT_SECRET_SETTING, GMAIL_CLIENT_SECRET_ENV)


def oauth_redirect_uri(con: sqlite3.Connection) -> str:
    """The configured redirect override, or "" to let the connect route derive it
    from the request base URL (works for both the dev and prod registered URIs)."""
    return _db_or_env(con, GMAIL_REDIRECT_URI_SETTING, GMAIL_REDIRECT_URI_ENV)


def set_oauth_config(
    con: sqlite3.Connection, client_id: str, client_secret: str = "", redirect_uri: str = ""
) -> None:
    """Store the Google OAuth client config entered from the dashboard (DB-over-env).
    The secret is write-only: a blank secret leaves any existing one intact, so the
    id or redirect can be edited without re-pasting the secret. A blank redirect
    clears the override (the connect route then derives it from the request host)."""
    cid = client_id.strip()
    if cid:
        settings.set_setting(con, GMAIL_CLIENT_ID_SETTING, cid)
    sec = client_secret.strip()
    if sec:
        settings.set_setting(con, GMAIL_CLIENT_SECRET_SETTING, sec)
    redir = redirect_uri.strip()
    if redir:
        settings.set_setting(con, GMAIL_REDIRECT_URI_SETTING, redir)
    else:
        settings.delete_setting(con, GMAIL_REDIRECT_URI_SETTING)


def clear_oauth_config(con: sqlite3.Connection) -> None:
    """Remove the dashboard-stored OAuth client config (falls back to env)."""
    settings.delete_setting(con, GMAIL_CLIENT_ID_SETTING)
    settings.delete_setting(con, GMAIL_CLIENT_SECRET_SETTING)
    settings.delete_setting(con, GMAIL_REDIRECT_URI_SETTING)


def oauth_config_source(con: sqlite3.Connection) -> str:
    """Where the OAuth client id+secret come from: "db", "env", or "" (unset).
    Drives the dashboard's "set here / from the environment" hint."""
    if settings.get_setting(con, GMAIL_CLIENT_ID_SETTING) and settings.get_setting(con, GMAIL_CLIENT_SECRET_SETTING):
        return "db"
    if os.environ.get(GMAIL_CLIENT_ID_ENV) and os.environ.get(GMAIL_CLIENT_SECRET_ENV):
        return "env"
    return ""


# --- stored credentials / cursor / toggle ------------------------------------


def refresh_token(con: sqlite3.Connection) -> str:
    return settings.get_setting(con, GMAIL_REFRESH_TOKEN_SETTING)


def address(con: sqlite3.Connection) -> str:
    return settings.get_setting(con, GMAIL_ADDRESS_SETTING)


def is_connected(con: sqlite3.Connection) -> bool:
    """A refresh token present means the user has granted access at least once."""
    return refresh_token(con) != ""


def store_credentials(con: sqlite3.Connection, refresh: str, addr: str) -> None:
    """Persist the connection after a successful code exchange. A blank refresh is
    NOT written (Google omits it on a re-consent that reuses a prior grant), so an
    existing token survives a reconnect; the address always updates."""
    if refresh:
        settings.set_setting(con, GMAIL_REFRESH_TOKEN_SETTING, refresh)
    if addr:
        settings.set_setting(con, GMAIL_ADDRESS_SETTING, addr)


def clear_credentials(con: sqlite3.Connection) -> None:
    """Disconnect: drop the token, address, and cursor (the OAuth client config and
    autoflip preference are left intact)."""
    settings.delete_setting(con, GMAIL_REFRESH_TOKEN_SETTING)
    settings.delete_setting(con, GMAIL_ADDRESS_SETTING)
    settings.delete_setting(con, GMAIL_CURSOR_SETTING)


def cursor(con: sqlite3.Connection) -> str:
    return settings.get_setting(con, GMAIL_CURSOR_SETTING)


def set_cursor(con: sqlite3.Connection, history_id: str) -> None:
    settings.set_setting(con, GMAIL_CURSOR_SETTING, history_id)


def set_oauth_state(con: sqlite3.Connection, state: str) -> None:
    settings.set_setting(con, GMAIL_OAUTH_STATE_SETTING, state)


def oauth_state(con: sqlite3.Connection) -> str:
    return settings.get_setting(con, GMAIL_OAUTH_STATE_SETTING)


def clear_oauth_state(con: sqlite3.Connection) -> None:
    settings.delete_setting(con, GMAIL_OAUTH_STATE_SETTING)


def autoflip(con: sqlite3.Connection) -> bool:
    """Whether application-status changes are auto-applied (default off)."""
    return settings.get_setting(con, GMAIL_AUTOFLIP_SETTING) == "1"


def set_autoflip(con: sqlite3.Connection, on: bool) -> None:
    settings.set_setting(con, GMAIL_AUTOFLIP_SETTING, "1" if on else "0")


# --- synced inbound messages (M55) -------------------------------------------


@dataclass
class GmailMessage:
    id: str = ""
    thread_id: str = ""
    posting_id: str = ""
    contact_id: str = ""
    from_email: str = ""
    subject: str = ""
    snippet: str = ""
    body: str = ""
    internal_date: int = 0
    synced_at: str = ""


_GMAIL_MSG_COLS = (
    "id, thread_id, COALESCE(posting_id, ''), COALESCE(contact_id, ''), from_email, "
    "subject, snippet, body, internal_date, synced_at"
)


def _scan_gmail_message(row) -> GmailMessage:
    return GmailMessage(
        id=row[0], thread_id=row[1], posting_id=row[2], contact_id=row[3],
        from_email=row[4], subject=row[5], snippet=row[6], body=row[7],
        internal_date=row[8], synced_at=row[9],
    )


def message_exists(con: sqlite3.Connection, message_id: str) -> bool:
    """Whether a Gmail message id has already been synced as inbound (idempotent poll)."""
    return con.execute(
        "SELECT 1 FROM gmail_messages WHERE id = ?", (message_id,)
    ).fetchone() is not None


def outreach_log_has_message(con: sqlite3.Connection, message_id: str) -> bool:
    """Whether a logged send already carries this Gmail message id — so our own
    sends (and re-seen mailbox messages) aren't double-logged by the poller."""
    if not message_id:
        return False
    return con.execute(
        "SELECT 1 FROM outreach_log WHERE gmail_message_id = ?", (message_id,)
    ).fetchone() is not None


def upsert_gmail_message(con: sqlite3.Connection, m: GmailMessage) -> None:
    """Insert (or replace) a synced inbound message keyed by its Gmail id."""
    con.execute(
        "INSERT INTO gmail_messages "
        "(id, thread_id, posting_id, contact_id, from_email, subject, snippet, body, internal_date) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET "
        "thread_id=excluded.thread_id, posting_id=excluded.posting_id, contact_id=excluded.contact_id, "
        "from_email=excluded.from_email, subject=excluded.subject, snippet=excluded.snippet, "
        "body=excluded.body, internal_date=excluded.internal_date",
        (
            m.id, m.thread_id, m.posting_id or None, m.contact_id or None, m.from_email,
            m.subject, m.snippet, m.body, m.internal_date,
        ),
    )


def latest_send_thread(con: sqlite3.Connection, posting_id: str, contact_id: str) -> tuple[str, str]:
    """(gmail_thread_id, gmail_message_id) of the most recent logged send on this
    (posting, contact) carrying Gmail ids — so a follow-up threads onto it. ("","")
    when there's no prior threaded send."""
    row = con.execute(
        "SELECT gmail_thread_id, gmail_message_id FROM outreach_log "
        "WHERE posting_id = ? AND contact_id = ? AND gmail_thread_id <> '' "
        "ORDER BY id DESC LIMIT 1",
        (posting_id, contact_id),
    ).fetchone()
    return (row[0], row[1]) if row is not None else ("", "")


def thread_posting(con: sqlite3.Connection, thread_id: str) -> str:
    """The posting a thread is already pinned to, via a prior send (outreach_log)
    or a prior synced message; "" when the thread is unseen."""
    row = con.execute(
        "SELECT posting_id FROM outreach_log WHERE gmail_thread_id = ? AND gmail_thread_id <> '' "
        "ORDER BY id DESC LIMIT 1",
        (thread_id,),
    ).fetchone()
    if row is not None:
        return row[0]
    row = con.execute(
        "SELECT posting_id FROM gmail_messages WHERE thread_id = ? AND COALESCE(posting_id,'') <> '' "
        "ORDER BY internal_date DESC LIMIT 1",
        (thread_id,),
    ).fetchone()
    return row[0] if row is not None and row[0] else ""


# --- notifications feed (M55) ------------------------------------------------

NOTIF_REPLY = "reply"
NOTIF_APP_STATUS = "app_status"


@dataclass
class Notification:
    id: int = 0
    kind: str = ""
    posting_id: str = ""
    gmail_message_id: str = ""
    title: str = ""
    detail: str = ""
    suggested_status: str = ""
    created_at: str = ""
    seen_at: str = ""
    actioned_at: str = ""


_NOTIF_COLS = (
    "id, kind, COALESCE(posting_id, ''), gmail_message_id, title, detail, suggested_status, "
    "created_at, COALESCE(seen_at, ''), COALESCE(actioned_at, '')"
)


def _scan_notification(row) -> Notification:
    return Notification(
        id=row[0], kind=row[1], posting_id=row[2], gmail_message_id=row[3], title=row[4],
        detail=row[5], suggested_status=row[6], created_at=row[7], seen_at=row[8], actioned_at=row[9],
    )


def add_notification(con: sqlite3.Connection, n: Notification) -> int:
    """Append a notification; returns its new id."""
    cur = con.execute(
        "INSERT INTO notifications (kind, posting_id, gmail_message_id, title, detail, suggested_status) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (n.kind, n.posting_id or None, n.gmail_message_id, n.title, n.detail, n.suggested_status),
    )
    return cur.lastrowid


def list_notifications(con: sqlite3.Connection, limit: int = 100) -> list[Notification]:
    """The feed, newest first."""
    rows = con.execute(
        f"SELECT {_NOTIF_COLS} FROM notifications ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [_scan_notification(r) for r in rows]


def get_notification(con: sqlite3.Connection, id: int) -> Notification | None:
    row = con.execute(f"SELECT {_NOTIF_COLS} FROM notifications WHERE id = ?", (id,)).fetchone()
    return _scan_notification(row) if row is not None else None


def unread_count(con: sqlite3.Connection) -> int:
    """Notifications not yet marked seen (drives the bell badge)."""
    return con.execute("SELECT COUNT(1) FROM notifications WHERE seen_at IS NULL").fetchone()[0]


def mark_seen(con: sqlite3.Connection, id: int) -> None:
    con.execute(
        "UPDATE notifications SET seen_at = CURRENT_TIMESTAMP WHERE id = ? AND seen_at IS NULL", (id,)
    )


def mark_actioned(con: sqlite3.Connection, id: int) -> None:
    """Stamp a suggestion as acted on (also marks it seen)."""
    con.execute(
        "UPDATE notifications SET actioned_at = CURRENT_TIMESTAMP, "
        "seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP) WHERE id = ?",
        (id,),
    )


def relink_notification(con: sqlite3.Connection, id: int, posting_id: str) -> None:
    """Re-point a mis-matched notification (and its synced message) at a posting."""
    cur = con.execute("UPDATE notifications SET posting_id = ? WHERE id = ?", (posting_id, id))
    if cur.rowcount == 0:
        return
    # The synced message (if any) follows the notification to the new posting. The
    # subquery yields the notification's gmail id, or NULL when it has none → no-op.
    con.execute(
        "UPDATE gmail_messages SET posting_id = ? WHERE id = "
        "(SELECT gmail_message_id FROM notifications WHERE id = ? AND gmail_message_id <> '')",
        (posting_id, id),
    )
