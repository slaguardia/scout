"""Build an outbound Gmail message (stdlib `email`) → base64url raw, and split a
draft's leading "Subject:" line out of its body.

Pure functions — no network, no DB — so the MIME shape is unit-testable on its own.
"""
from __future__ import annotations

import base64
import html
import re
from email.message import EmailMessage
from email.utils import make_msgid

# Markdown-style inline link: [label](url). Lets the user show "stevenlaguardia.me"
# as the visible text over a hidden https:// target — only expressible in HTML.
_MD_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def _to_plain(body: str) -> str:
    """Markdown links → "label (url)" so a text-only client still sees the URL
    (collapsed to just the url when label and url are identical)."""
    return _MD_LINK.sub(
        lambda m: m.group(2) if m.group(1) == m.group(2) else f"{m.group(1)} ({m.group(2)})",
        body,
    )


def _to_html(body: str) -> str:
    """Escape the body, turn markdown links into anchors, newlines into <br>."""
    linked = _MD_LINK.sub(
        lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', html.escape(body)
    )
    return "<html><body>" + linked.replace("\n", "<br>\n") + "</body></html>"


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
    """An RFC 2822 message, base64url-encoded for messages.send. Plain-text by
    default; when the body carries a markdown link the message becomes
    multipart/alternative (plain + HTML) so the label renders as a real anchor.
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
    if _MD_LINK.search(body):
        msg.set_content(_to_plain(body))
        msg.add_alternative(_to_html(body), subtype="html")
    else:
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
