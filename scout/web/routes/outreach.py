"""The outreach draft queue + the discovered-sources peek + draft edit/send.

The async pipeline is fire-and-forget:
the POST creates a draft row and calls state.outreach.draft(id, skip) — the runner
(the wired Engine, or a test fake) owns the background thread and its OWN
connection; the request connection here is only used for the gate + the draft-row
create/list. The panel polls the draft row for progress.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from scout import outreach as outreach_pkg
from scout.store import contacts, errors, outreach_drafts, outreach_sources

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


# --- knowledge sync ----------------------------------------------------------


def _ensure_outreach_knowledge(con, state: AppState) -> None:
    """Best-effort change-aware brain sync for the outreach knowledge bundle. A
    no-op when the brain isn't configured; any failure leaves the last-good cache
    in place (the caller re-checks the cache before gating)."""
    if state.brainbot is None or not state.brainbot.enabled():
        return
    state.ensure_anthropic_key(con)  # DB-over-env, so a dashboard key lights up discovery
    try:
        outreach_pkg.ensure_knowledge(state.brainbot, state.anthropic, con, "", None)
    except Exception:  # noqa: BLE001 - best-effort; serve the cache
        pass


def _experience_gate(con, state: AppState) -> Response | None:
    """The shared draft/answer honesty gate: an empty experience bundle triggers a
    one-shot brain sync, then (still empty) a 412 with need=experience. Returns the
    412 Response to send, or None when the gate passes."""
    exp = outreach_sources.outreach_knowledge(con, "experience")
    if exp.strip() != "":
        return None
    # Cold cache: sync from the brain once, then re-check before blocking.
    _ensure_outreach_knowledge(con, state)
    if outreach_sources.outreach_knowledge(con, "experience").strip() != "":
        return None
    return json_response(
        {
            "error": "no experience page found in your brain — add one; scout syncs it automatically",
            "need": "experience",
        },
        412,
    )


# --- the draft queue on one posting: /api/postings/{id}/outreach -------------


@router.get("/api/postings/{posting_id}/outreach")
def list_posting_outreach(posting_id: str, con=Depends(get_db)) -> Response:
    """The posting's drafts, newest first."""
    return json_response({"drafts": outreach_drafts.list_outreach_drafts(con, posting_id)})


@router.post("/api/postings/{posting_id}/outreach")
def start_posting_outreach(
    posting_id: str,
    request: Request,
    con=Depends(get_db),
    state: AppState = Depends(get_state),
) -> Response:
    """Start (or regenerate) a draft. Gates on the experience bundle (the honesty
    ground truth) and one active draft per posting; 503 when no engine is wired."""
    if state.outreach is None:
        return json_error("outreach pipeline not wired (no engine in this build)", 503)

    gate = _experience_gate(con, state)
    if gate is not None:
        return gate

    # Voice is soft: drafting proceeds without it (a less-voiced email).
    degraded: list[str] = []
    if outreach_sources.outreach_knowledge(con, "voice").strip() == "":
        degraded.append("voice")

    # ?research=0 skips the web-research stage for this draft (drafts from on-file
    # info only). Persisted on the row so the panel's progress bar can drop the
    # Research node across polls/reloads.
    skip_research = request.query_params.get("research") == "0"

    # ?regenerate=1 retires the current reviewable draft and starts a fresh run;
    # the default POST creates only when no draft is active (409 otherwise).
    create = outreach_drafts.create_outreach_draft
    if request.query_params.get("regenerate") == "1":
        create = outreach_drafts.regenerate_outreach_draft
    try:
        d = create(con, posting_id, skip_research)
    except errors.NotFound:
        return json_error("not found", 404)
    except ValueError as e:
        if "active draft" in str(e):
            return json_error(str(e), 409)
        raise

    state.outreach.draft(d.id, skip_research)
    return json_response({"draft": d, "degraded": degraded}, 202)


# --- discovered sources (read-only): /api/outreach/sources -------------------


@router.get("/api/outreach/sources")
def outreach_sources_endpoint(con=Depends(get_db)) -> Response:
    """The cached knowledge sources without their (large) content — the per-need
    pointers the UI renders. Read-only: the bundle auto-syncs from the brain."""
    srcs = outreach_sources.list_outreach_sources(con)
    lite = [
        {
            "need": s.need,
            "page_id": s.page_id,
            "title": s.title,
            "version": s.version,
            "resolved_at": s.resolved_at,
        }
        for s in srcs
    ]
    return json_response({"sources": lite, "needs": outreach_pkg.KNOWLEDGE_NEEDS})


# --- one draft: /api/outreach/drafts/{id}[/sent] -----------------------------


def _parse_int_id(raw_id: str) -> int | None:
    try:
        return int(raw_id)
    except (TypeError, ValueError):
        return None


def _lint_body(email: str) -> str:
    """Drop a leading "Subject:" line before the voice flag, since the subject's
    em dash ("Name — intro") is intentional and not a violation."""
    if email.startswith("Subject:"):
        i = email.find("\n")
        if i >= 0:
            return email[i + 1 :]
    return email


@router.get("/api/outreach/drafts/{raw_id}")
def get_draft(raw_id: str, con=Depends(get_db)) -> Response:
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    d = outreach_drafts.get_outreach_draft(con, id)
    if d is None:
        return json_error("not found", 404)
    return json_response(d)


@router.put("/api/outreach/drafts/{raw_id}")
def save_draft_edit(raw_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Save the user's edit. Only awaiting_review/needs_work/no_hook drafts are
    editable (a sent draft is the record of what was emailed; a researching one is
    pipeline-owned) → 409 otherwise."""
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    body = decode_json(raw)
    edited = _s(body, "edited")

    cur = outreach_drafts.get_outreach_draft(con, id)
    editable = (
        outreach_drafts.DRAFT_AWAITING_REVIEW,
        outreach_drafts.DRAFT_NEEDS_WORK,
        outreach_drafts.DRAFT_NO_HOOK,
    )
    if cur is not None and cur.status not in editable:
        return json_error(
            f"draft is {cur.status} — only awaiting_review/needs_work/no_hook drafts are editable",
            409,
        )

    # Re-run the deterministic voice flag (body only) + the word-count check.
    findings = outreach_pkg.voice_findings(_lint_body(edited)) + outreach_pkg.length_findings(
        edited
    )
    lint_json = json.dumps(
        [{"code": f.code, "message": f.message} for f in findings], separators=(",", ":")
    )
    outreach_drafts.set_outreach_draft_edited(con, id, edited, lint_json)
    d = outreach_drafts.get_outreach_draft(con, id)
    if d is None:
        return json_error("draft vanished", 500)
    return json_response(d)


@router.post("/api/outreach/drafts/{raw_id}/sent")
def mark_draft_sent(raw_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Mark a draft sent (idempotent). 404 unknown.

    With a {"contact_id": ...} body, also log the send against that contact —
    arming its follow-up and seeding the posting's outreach_status — so a send
    you made by hand is tracked exactly like a Gmail send, minus the live thread
    link. Without a contact_id it stays a bare status flip (back-compat).

    An already-sent draft can be reused to reach out to *another* contact: it logs
    the new contact, leaving the terminal status intact. A contact already on this
    posting's log is skipped (idempotent re-mark; no duplicate send)."""
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    body = decode_json(raw) if raw.strip() else {}
    contact_id = _s(body, "contact_id").strip()
    if contact_id:
        d = outreach_drafts.get_outreach_draft(con, id)
        if d is None:
            return json_error("not found", 404)
        # Log the send unless this contact was already logged for the posting —
        # the contact-level guard (replacing the old "already sent → skip") is what
        # lets a sent draft be reused for someone else while staying idempotent.
        prior = contacts.list_outreach_for_posting(con, d.posting_id)
        if not any(e.contact_id == contact_id for e in prior):
            contact = contacts.get_contact(con, contact_id)
            recipient = (contact.name or "").strip().split(" ")[0] if contact else ""
            draft_text = d.edited if d.edited.strip() else d.draft
            if recipient:
                draft_text = draft_text.replace("[Recipient]", recipient)
            try:
                contacts.log_outreach(
                    con, d.posting_id, contact_id, contacts.OutreachInput(body=draft_text)
                )
            except ValueError as e:
                return json_error(str(e), 400)
    out = outreach_drafts.mark_outreach_draft_sent(con, id)
    return json_response(out)


@router.post("/api/outreach/drafts/{raw_id}/cancel")
def cancel_draft(raw_id: str, con=Depends(get_db)) -> Response:
    """Cancel a running (researching) draft — delete its row so the posting's
    active-draft slot frees up and the panel can start over. 200 with
    {"cancelled": bool}; false when the draft already finished (nothing to cancel).
    The background pipeline thread finishes on its own; its writes no-op once the
    row is gone."""
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    cancelled = outreach_drafts.cancel_outreach_draft(con, id)
    return json_response({"cancelled": cancelled})


@router.delete("/api/outreach/drafts/{raw_id}")
def delete_draft(raw_id: str, con=Depends(get_db)) -> Response:
    """Delete a draft from the queue/history (any status). 200 with
    {"deleted": bool}; false when the id is already gone. A researching draft is
    deleted too — same as cancel — so the background thread's writes then no-op."""
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    deleted = outreach_drafts.delete_outreach_draft(con, id)
    return json_response({"deleted": deleted})
