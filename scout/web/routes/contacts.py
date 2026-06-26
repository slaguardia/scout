"""Company contacts + per-contact outreach log + the follow-up interval (M51).

Faithful port of internal/web/contacts.go. Go's handleCompany/handlePosting
prefix dispatch becomes explicit FastAPI routes (the contact/outreach-log paths
are deeper than core's company/posting routes, so they coexist — FastAPI matches
the most specific). Int-id paths parse the segment by hand so a non-numeric id is
a 404 (Go's strconv.ParseInt → http.NotFound), not FastAPI's default 422.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout.store import contacts

from ..deps import get_db
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


def _parse_int_id(raw_id: str) -> int | None:
    """The int64 id from a path segment, or None when it isn't a clean integer."""
    try:
        return int(raw_id)
    except (TypeError, ValueError):
        return None


# --- company contacts: /api/companies/{id}/contacts --------------------------


@router.get("/api/companies/{company_id}/contacts")
def list_company_contacts(company_id: str, con=Depends(get_db)) -> Response:
    """A company's active contacts (M51)."""
    return json_response(contacts.list_contacts(con, company_id))


@router.post("/api/companies/{company_id}/contacts")
def create_company_contact(
    company_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)
) -> Response:
    """Create a contact {name, role, email}. 404 unknown company, 409 duplicate
    email, 400 validation (the store's "contact …" ValueError → global 400)."""
    body = decode_json(raw)
    try:
        c = contacts.create_contact(
            con, company_id,
            contacts.ContactInput(name=_s(body, "name"), role=_s(body, "role"), email=_s(body, "email")),
        )
    except contacts.DuplicateContact as e:
        return json_error(str(e), 409)
    return json_response(c)


# --- one contact: /api/contacts/{id} -----------------------------------------


@router.put("/api/contacts/{contact_id}")
def update_contact(contact_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    body = decode_json(raw)
    try:
        c = contacts.update_contact(
            con, contact_id,
            contacts.ContactInput(name=_s(body, "name"), role=_s(body, "role"), email=_s(body, "email")),
        )
    except contacts.DuplicateContact as e:
        return json_error(str(e), 409)
    return json_response(c)


@router.delete("/api/contacts/{contact_id}")
def archive_contact(contact_id: str, con=Depends(get_db)) -> Response:
    """Soft-delete a contact. 404 for an unknown/already-archived id."""
    contacts.archive_contact(con, contact_id)
    return json_response({"id": contact_id})


# --- per-posting outreach log: /api/postings/{id}/outreach-log ---------------


@router.get("/api/postings/{posting_id}/outreach-log")
def list_outreach_log(posting_id: str, con=Depends(get_db)) -> Response:
    """A posting's per-contact send log, newest first."""
    return json_response(contacts.list_outreach_for_posting(con, posting_id))


@router.post("/api/postings/{posting_id}/outreach-log")
def log_outreach(posting_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Log a send {contact_id, sent_at?, body?, note?, followup_due_at?, no_followup?}.
    contact_id is required (400); the contact/date validation maps to 400."""
    body = decode_json(raw)
    contact_id = _s(body, "contact_id")
    if contact_id.strip() == "":
        return json_error("contact_id is required", 400)
    e = contacts.log_outreach(
        con, posting_id, contact_id,
        contacts.OutreachInput(
            sent_at=_s(body, "sent_at"), body=_s(body, "body"), note=_s(body, "note"),
            followup_due_at=_s(body, "followup_due_at"), no_followup=bool(body.get("no_followup")),
        ),
    )
    return json_response(e)


# --- one logged send: /api/outreach-log/{id} ---------------------------------


@router.put("/api/outreach-log/{raw_id}")
def update_outreach_entry(raw_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    body = decode_json(raw)
    out = contacts.update_outreach_entry(
        con, id,
        contacts.OutreachEntryEdit(
            sent_at=_s(body, "sent_at"), body=_s(body, "body"), note=_s(body, "note"),
            followup_due_at=_s(body, "followup_due_at"), done=bool(body.get("done")),
        ),
    )
    return json_response(out)


@router.delete("/api/outreach-log/{raw_id}")
def delete_outreach_entry(raw_id: str, con=Depends(get_db)) -> Response:
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    contacts.delete_outreach_entry(con, id)
    return json_response({"id": id})


# --- follow-up interval: /api/followup-interval ------------------------------


@router.get("/api/followup-interval")
def get_followup_interval(con=Depends(get_db)) -> Response:
    return json_response({"days": contacts.followup_interval_days(con)})


@router.put("/api/followup-interval")
def set_followup_interval(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Store the default follow-up interval in business days (0–90; 0 disables
    auto-arm). Out-of-range → 400 (the store ValueError → global 400)."""
    body = decode_json(raw)
    days = body.get("days", 0)
    if isinstance(days, bool) or not isinstance(days, int):
        return json_error("invalid JSON: days must be an integer", 400)
    contacts.set_followup_interval_days(con, days)
    return json_response({"days": days})
