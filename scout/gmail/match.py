"""Route a synced Gmail message to a stream and resolve which posting it touches.

The two streams never collide because they're to/from different addresses:
  - OUTREACH    — the counterparty is a known contact (contacts.email): a reply
                  the contact sent us, or a send we made to them.
  - APPLICATION — an inbound message from a NON-contact address (ATS no-reply,
                  company HR). Acted on by the application stream (classify.py).

Posting resolution for the outreach stream: thread-id first (a prior send or
synced message already pinned the thread), then the role named in the email vs
the company's postings, then the most-recent non-rejected posting. A miss is left
unlinked — the notifications panel's "link to role" control covers it.
"""
from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from email.utils import getaddresses

from scout.store import contacts as contacts_store
from scout.store import gmail as gmail_store
from scout.store import postings as postings_store

STREAM_OUTREACH = "outreach"
STREAM_APPLICATION = "application"
STREAM_DROP = "drop"

DIRECTION_INBOUND = "inbound"
DIRECTION_OUTBOUND = "outbound"


@dataclass
class ParsedMessage:
    id: str = ""
    thread_id: str = ""
    from_email: str = ""
    to_emails: list[str] = field(default_factory=list)
    cc_emails: list[str] = field(default_factory=list)
    subject: str = ""
    snippet: str = ""
    body: str = ""
    internal_date: int = 0


@dataclass
class Routed:
    stream: str
    parsed: ParsedMessage
    contact: contacts_store.Contact | None = None
    direction: str = ""
    counterparty: str = ""  # the other party's email address


def _decode_b64(data: str) -> str:
    if not data:
        return ""
    data += "=" * (-len(data) % 4)  # Gmail strips base64url padding
    try:
        return base64.urlsafe_b64decode(data.encode()).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def _disposition(payload: dict) -> str:
    for h in payload.get("headers", []) or []:
        if str(h.get("name", "")).lower() == "content-disposition":
            return str(h.get("value", "") or "").split(";")[0].strip().lower()
    return ""


def _find_body(payload: dict, want: str) -> str:
    """First body part of mime type `want` in the tree, skipping attachments."""
    if _disposition(payload) == "attachment":
        return ""
    mime = payload.get("mimeType", "") or ""
    body = payload.get("body", {}) or {}
    if mime == want and body.get("data"):
        return _decode_b64(body["data"])
    for p in payload.get("parts") or []:
        t = _find_body(p, want)
        if t:
            return t
    return ""


def _extract_text(payload: dict) -> str:
    """The message body: a real text/plain part wins anywhere in the tree; only when
    there is none do we fall back to text/html (decoded, not stripped). Attachments
    (a .txt/.csv part) are never returned as the body."""
    return _find_body(payload, "text/plain") or _find_body(payload, "text/html")


def _headers(payload: dict) -> dict:
    out: dict = {}
    for h in payload.get("headers", []) or []:
        out[str(h.get("name", "")).lower()] = str(h.get("value", "") or "")
    return out


def _addrs(raw: str) -> list[str]:
    """Every email address in a recipient header, lowercased (handles commas inside
    display names via getaddresses)."""
    return [a.strip().lower() for _, a in getaddresses([raw or ""]) if a.strip()]


def _addr(raw: str) -> str:
    addrs = _addrs(raw)
    return addrs[0] if addrs else ""


def parse_message(full: dict) -> ParsedMessage:
    """Flatten a messages.get(full) response into the fields routing needs."""
    payload = full.get("payload", {}) or {}
    hdrs = _headers(payload)
    to_emails = _addrs(hdrs.get("to", ""))
    cc_emails = _addrs(hdrs.get("cc", ""))
    body = _extract_text(payload) or full.get("snippet", "") or ""
    try:
        internal = int(full.get("internalDate", 0) or 0)
    except (TypeError, ValueError):
        internal = 0
    return ParsedMessage(
        id=full.get("id", "") or "",
        thread_id=full.get("threadId", "") or "",
        from_email=_addr(hdrs.get("from", "")),
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject=hdrs.get("subject", ""),
        snippet=full.get("snippet", "") or "",
        body=body,
        internal_date=internal,
    )


def route_message(con, parsed: ParsedMessage, our_address: str) -> Routed:
    """Decide the stream + counterparty. Our own address as the sender means an
    outbound send; otherwise inbound. For an outbound message, EVERY recipient
    (To + Cc) is checked against contacts so a recruiter who is cc'd (or not the
    first To) still routes to the outreach stream; for inbound, the sender is."""
    our = (our_address or "").strip().lower()
    outbound = bool(our) and parsed.from_email == our
    if outbound:
        direction = DIRECTION_OUTBOUND
        counterparty = parsed.to_emails[0] if parsed.to_emails else ""
        for addr in parsed.to_emails + parsed.cc_emails:
            contact = contacts_store.find_contact_by_email(con, addr)
            if contact is not None:
                return Routed(STREAM_OUTREACH, parsed, contact=contact, direction=direction, counterparty=addr)
        # An outbound message to no tracked contact isn't something we track.
        return Routed(STREAM_DROP, parsed, direction=direction, counterparty=counterparty)

    direction = DIRECTION_INBOUND
    counterparty = parsed.from_email
    contact = contacts_store.find_contact_by_email(con, counterparty) if counterparty else None
    if contact is not None:
        return Routed(STREAM_OUTREACH, parsed, contact=contact, direction=direction, counterparty=counterparty)
    # An inbound message from a non-contact is an application-stream candidate.
    if parsed.from_email:
        return Routed(STREAM_APPLICATION, parsed, direction=direction, counterparty=parsed.from_email)
    return Routed(STREAM_DROP, parsed, direction=direction, counterparty=counterparty)


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


def contains_phrase(hay: str, needle: str) -> bool:
    """Whether `needle` occurs in `hay` (both pre-normalized to lowercase,
    single-spaced) delimited by non-alphanumerics — so a short name like "On"
    doesn't match inside "constellation"."""
    if not needle:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", hay) is not None


def match_role_in_text(postings: list, text: str) -> str:
    """The posting whose title appears (as a delimited phrase) in the email text —
    longest title first so "Senior Engineer" beats "Engineer". "" on no match."""
    hay = _norm(text)
    best_id, best_len = "", 0
    for p in postings:
        title = _norm(p.title)
        if title and len(title) > best_len and contains_phrase(hay, title):
            best_id, best_len = p.id, len(title)
    return best_id


def resolve_posting(con, company_id: str, parsed: ParsedMessage) -> str:
    """Which posting this outreach message is about: thread-id → role-in-email →
    most-recent non-rejected posting. "" when nothing resolves (manual link covers it)."""
    pinned = gmail_store.thread_posting(con, parsed.thread_id)
    if pinned:
        return pinned

    postings = postings_store.list_postings(con, company_id)  # newest first
    if not postings:
        return ""

    by_role = match_role_in_text(postings, f"{parsed.subject}\n{parsed.body}")
    if by_role:
        return by_role

    open_postings = [p for p in postings if (p.application_status or "").lower() != "rejected"]
    pool = open_postings or postings
    return pool[0].id
