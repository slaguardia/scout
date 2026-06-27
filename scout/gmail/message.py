"""Build an outbound Gmail message (stdlib `email`) → base64url raw, and split a
draft's leading "Subject:" line out of its body.

Pure functions — no network, no DB — so the MIME shape is unit-testable on its own.
"""
from __future__ import annotations

import base64
from email.message import EmailMessage
from email.utils import make_msgid


def split_subject(text: str, default_subject: str) -> tuple[str, str]:
    """If the draft body opens with a "Subject:" line (the current template embeds
    one), use it as the subject and drop it from the body. Otherwise return the
    given default subject and the body unchanged."""
    stripped = text.lstrip("\n")
    if stripped.startswith("Subject:"):
        nl = stripped.find("\n")
        if nl < 0:
            return stripped[len("Subject:"):].strip(), ""
        subject = stripped[len("Subject:"):nl].strip()
        body = stripped[nl + 1:].lstrip("\n")
        return subject, body
    return default_subject, text


def build_raw(
    from_addr: str,
    to_addr: str,
    subject: str,
    body: str,
    in_reply_to: str = "",
    references: str = "",
    message_id: str = "",
) -> tuple[str, str]:
    """An RFC 2822 plain-text message, base64url-encoded for messages.send.
    in_reply_to/references thread a follow-up onto the prior message's Message-ID.
    Returns (raw_b64, message_id)."""
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    mid = message_id or make_msgid()
    msg["Message-ID"] = mid
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    msg.set_content(body)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return raw, mid


def header_value(message: dict, name: str) -> str:
    """Read one header from a messages.get payload (case-insensitive). "" if absent."""
    lname = name.lower()
    for h in (message.get("payload", {}) or {}).get("headers", []) or []:
        if str(h.get("name", "")).lower() == lname:
            return str(h.get("value", "") or "")
    return ""
