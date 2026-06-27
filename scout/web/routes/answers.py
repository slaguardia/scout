"""Application-question answers: the per-posting queue, redetect, and per-answer
edit/regenerate/delete.

Detection (cheap, no key for ATS links)
runs synchronously on the request connection; generation (the LLM spend) is
fire-and-forget via state.answers.generate(posting_id), exactly like outreach
drafts — the runner owns the background thread + its own connection.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout import capture as capture_pkg
from scout.store import errors, posting_answers
from scout.store import postings as postings_store

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import decode_json, raw_body
from .outreach import _experience_gate

router = APIRouter()


def _answers_payload(
    con, posting_id: str, questions_status: str, status_code: int = 200
) -> Response:
    """The standard {answers, questions_status} payload at the given status."""
    return json_response(
        {
            "answers": posting_answers.list_answers(con, posting_id),
            "questions_status": questions_status,
        },
        status_code,
    )


def _parse_int_id(raw_id: str) -> int | None:
    try:
        return int(raw_id)
    except (TypeError, ValueError):
        return None


# --- the answers queue on one posting: /api/postings/{id}/answers ------------


@router.get("/api/postings/{posting_id}/answers")
def list_posting_answers(posting_id: str, con=Depends(get_db)) -> Response:
    p = postings_store.get_posting(con, posting_id)
    if p is None:
        return json_error("not found", 404)
    return _answers_payload(con, posting_id, p.questions_status)


@router.post("/api/postings/{posting_id}/answers")
def generate_posting_answers(
    posting_id: str, con=Depends(get_db), state: AppState = Depends(get_state)
) -> Response:
    """Detect-if-missing, then generate every unanswered question. 503 without an
    engine, 412 without the experience bundle (the honesty ground truth)."""
    if state.answers is None:
        return json_error("answer generation not wired (no engine in this build)", 503)
    p = postings_store.get_posting(con, posting_id)
    if p is None:
        return json_error("not found", 404)

    gate = _experience_gate(con, state)
    if gate is not None:
        return gate

    # Detect-if-missing: a posting never detected gets its questions resolved now.
    status = p.questions_status
    if status == "":
        c = capture_pkg.Capturer(db=con, client=state.anthropic)
        try:
            scan = c.detect_and_store_questions(posting_id, p.url)
        except Exception as e:  # noqa: BLE001
            return json_error("detect questions: " + str(e), 500)
        status = scan.status

    state.answers.generate(posting_id)
    return _answers_payload(con, posting_id, status, 202)


@router.post("/api/postings/{posting_id}/answers/redetect")
def redetect_posting_answers(
    posting_id: str, con=Depends(get_db), state: AppState = Depends(get_state)
) -> Response:
    """Force a fresh detection run: idempotent upsert (adds new questions, never
    clobbers existing answers). No key needed for ATS links."""
    p = postings_store.get_posting(con, posting_id)
    if p is None:
        return json_error("not found", 404)
    c = capture_pkg.Capturer(db=con, client=state.anthropic)
    try:
        scan = c.detect_and_store_questions(posting_id, p.url)
    except errors.NotFound:
        return json_error("not found", 404)
    except Exception as e:  # noqa: BLE001
        return json_error(str(e), 500)
    return _answers_payload(con, posting_id, scan.status)


# --- one answer: /api/answers/{id} -------------------------------------------


@router.delete("/api/answers/{raw_id}")
def delete_answer(raw_id: str, con=Depends(get_db)) -> Response:
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    posting_answers.delete_answer(con, id)
    return Response(status_code=204)


@router.put("/api/answers/{raw_id}")
def edit_or_regenerate_answer(
    raw_id: str,
    raw: bytes = Depends(raw_body),
    con=Depends(get_db),
    state: AppState = Depends(get_state),
) -> Response:
    """PUT {edited} inline-saves (200); PUT {regenerate:true} re-drafts this one
    question (202, async) — gated like the bulk POST (503/412)."""
    id = _parse_int_id(raw_id)
    if id is None:
        return json_error("not found", 404)
    body = decode_json(raw)

    if body.get("regenerate"):
        if state.answers is None:
            return json_error("answer generation not wired (no engine in this build)", 503)
        gate = _experience_gate(con, state)
        if gate is not None:
            return gate
        a = posting_answers.regenerate_answer(con, id)
        # RegenerateAnswer flipped just this row to `generating`; Generate re-drafts
        # every generating row for the posting (only this one).
        state.answers.generate(a.posting_id)
        return json_response(a, 202)

    edited = body.get("edited")
    a = posting_answers.edit_answer(con, id, edited if isinstance(edited, str) else "")
    return json_response(a)
