"""Application stream: classify an inbound non-contact email into an application
stage (Haiku), and match it to a tracked posting by company/ATS + the role named.

Driven by the read-sync poller (scout/gmail/sync.py) when a Gmail account is
connected AND an Anthropic key is set; otherwise the application board stays dark
(graceful — send + the outreach stream are unaffected).
"""
from __future__ import annotations

import json
import re

from scout import anthropic
from scout.store import postings as postings_store

from . import match as match_mod

# Below this confidence the classifier's call stays a *suggestion* even when
# autoflip is on — we never silently set a wrong stage.
AUTOFLIP_CONF_THRESHOLD = 0.7

_RE_JSON = re.compile(r"\{.*\}", re.S)

_CLASSIFY_SYSTEM = """You read a single job-application email (from an ATS or a company's recruiting/HR address) and decide which stage of the application pipeline it signals.

Reply ONLY with valid JSON, no preamble, no markdown fences:
  {{"status": "<one of the stages below, or "none">", "confidence": 0.0-1.0}}

The stages, in order:
  {labels}

Guidance: an automated "we received your application" → the FIRST stage; an invitation to a recruiter screen or an interview → the matching interview stage; a rejection ("unfortunately", "moved forward with other candidates") → the rejection stage; an offer → the offer stage. If the email is not about an application's status (a newsletter, generic marketing), use "none" with low confidence."""


def _parse_json(s: str) -> dict:
    s = (s or "").strip()
    candidates = [s]
    m = _RE_JSON.search(s)
    if m:
        candidates.insert(0, m.group(0))
    for c in candidates:
        try:
            v = json.loads(c)
        except (ValueError, json.JSONDecodeError):
            continue
        if isinstance(v, dict):
            return v
    return {}


def classify_application(client, model: str, subject: str, body: str, labels: list[str]) -> tuple[str, float]:
    """(label, confidence). label is "" when the email isn't an application-status
    update (or the model is unsure); it is validated against `labels`."""
    if not labels:
        return "", 0.0
    system = _CLASSIFY_SYSTEM.format(labels="\n  ".join(f"- {label}" for label in labels))
    user = f"Subject: {subject}\n\n{(body or '')[:4000]}"
    resp = client.send(
        anthropic.Request(
            model=model or anthropic.DEFAULT_MODEL,
            system=system,
            max_tokens=128,
            messages=[anthropic.Message("user", user)],
        )
    )
    d = _parse_json(resp.text())
    raw = str(d.get("status", "")).strip().lower()
    try:
        conf = float(d.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    if raw in ("", "none"):
        return "", conf
    for label in labels:
        if label.strip().lower() == raw:
            return label, conf
    return "", conf


# --- company / ATS + role matching -------------------------------------------


def _company_by_domain(con, domain: str) -> str:
    """A tracked company whose domain equals — or is the registrable suffix of —
    the sender's domain (so jobs.acme.com matches acme.com). "" on no match."""
    d = (domain or "").lower().removeprefix("www.")
    if not d:
        return ""
    row = con.execute(
        "SELECT id FROM companies WHERE domain IS NOT NULL AND domain != '' "
        "AND (lower(domain) = ? OR ? LIKE '%.' || lower(domain)) LIMIT 1",
        (d, d),
    ).fetchone()
    return row[0] if row is not None else ""


def _company_by_name_in_text(con, text: str) -> str:
    """A tracked company whose name appears as a delimited phrase in the email —
    the fallback when the sender is an ATS host, not the company's own domain.
    Word-boundary matched so a short name ("On", "Ramp") doesn't hit inside an
    unrelated word. Longest name wins. "" on no match."""
    hay = " ".join((text or "").lower().split())
    best_id, best_len = "", 0
    for row in con.execute("SELECT id, name FROM companies WHERE name IS NOT NULL AND name != ''"):
        name = " ".join((row[1] or "").lower().split())
        if name and len(name) > best_len and match_mod.contains_phrase(hay, name):
            best_id, best_len = row[0], len(name)
    return best_id


def match_application(con, parsed) -> str:
    """The posting an application email is about: company by sender domain, else by
    company name in the email (ATS senders); then role-in-email, else the company's
    most-recent posting. "" when no company resolves (manual link covers it)."""
    domain = parsed.from_email.rsplit("@", 1)[1].lower() if "@" in parsed.from_email else ""
    company_id = _company_by_domain(con, domain)
    if not company_id:
        company_id = _company_by_name_in_text(con, f"{parsed.subject}\n{parsed.body}")
    if not company_id:
        return ""
    ps = postings_store.list_postings(con, company_id)
    if not ps:
        return ""
    by_role = match_mod.match_role_in_text(ps, f"{parsed.subject}\n{parsed.body}")
    return by_role or ps[0].id
