"""The outreach-side editors: email template, follow-up template, and the
per-stage pipeline prompts.

Partial port of internal/web/editor.go — only the outreach editors (the
taste/playbook/pre-filter editors live elsewhere). Each is a DB singleton (a save
can't clobber it and git never touches it); the engine re-reads at draft time, so
there is no reload and no taste_version on these.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout import outreach as outreach_pkg
from scout.store import outreach_template, prompt_overrides

from ..deps import get_db
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


# --- email template: /api/outreach-template ----------------------------------


@router.get("/api/outreach-template")
def get_outreach_template(con=Depends(get_db)) -> Response:
    content = outreach_template.get_outreach_template(con) or outreach_pkg.DEFAULT_TEMPLATE
    return json_response({"kind": "outreach-template", "content": content})


@router.put("/api/outreach-template")
def put_outreach_template(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    content = _s(decode_json(raw), "content")
    outreach_template.put_outreach_template(con, content)
    return json_response({"kind": "outreach-template", "content": content})


# --- email subject + signature: /api/outreach-{subject,signature} (M55) ------


@router.get("/api/outreach-subject")
def get_outreach_subject(con=Depends(get_db)) -> Response:
    content = outreach_template.get_subject_template(con) or outreach_pkg.DEFAULT_SUBJECT
    return json_response({"kind": "outreach-subject", "content": content})


@router.put("/api/outreach-subject")
def put_outreach_subject(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    content = _s(decode_json(raw), "content")
    outreach_template.put_subject_template(con, content)
    return json_response({"kind": "outreach-subject", "content": content})


@router.get("/api/outreach-signature")
def get_outreach_signature(con=Depends(get_db)) -> Response:
    content = outreach_template.get_signature_template(con) or outreach_pkg.DEFAULT_SIGNATURE
    return json_response({"kind": "outreach-signature", "content": content})


@router.put("/api/outreach-signature")
def put_outreach_signature(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    content = _s(decode_json(raw), "content")
    outreach_template.put_signature_template(con, content)
    return json_response({"kind": "outreach-signature", "content": content})


# --- follow-up template + subject: /api/followup-{template,subject} -----------


@router.get("/api/followup-template")
def get_followup_template(con=Depends(get_db)) -> Response:
    content = outreach_template.get_followup_template(con) or outreach_pkg.DEFAULT_FOLLOWUP_TEMPLATE
    return json_response({"kind": "followup-template", "content": content})


@router.put("/api/followup-template")
def put_followup_template(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    content = _s(decode_json(raw), "content")
    outreach_template.put_followup_template(con, content)
    return json_response({"kind": "followup-template", "content": content})


@router.get("/api/followup-subject")
def get_followup_subject(con=Depends(get_db)) -> Response:
    content = outreach_template.get_followup_subject_template(con) or outreach_pkg.DEFAULT_FOLLOWUP_SUBJECT
    return json_response({"kind": "followup-subject", "content": content})


@router.put("/api/followup-subject")
def put_followup_subject(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    content = _s(decode_json(raw), "content")
    outreach_template.put_followup_subject_template(con, content)
    return json_response({"kind": "followup-subject", "content": content})


# --- pipeline prompts: /api/outreach-prompts[/{stage}] -----------------------


@router.get("/api/outreach-prompts")
def list_outreach_prompts(con=Depends(get_db)) -> Response:
    """The editable pipeline stages (titles, descriptions, on/off + override
    status). Content is fetched per-stage."""
    out = []
    for st in outreach_pkg.stages():
        content, enabled = prompt_overrides.get_stage(con, st.stage)
        out.append(
            {
                "stage": st.stage, "title": st.title, "description": st.description,
                "enabled": enabled, "skippable": st.stage != "fill",
                "is_overridden": content.strip() != "",
            }
        )
    return json_response({"prompts": out})


def _stage_payload(con, stage: str, st) -> Response:
    """One stage's effective prompt + flags (GET, and the PUT round-trip)."""
    content, enabled = prompt_overrides.get_stage(con, stage)
    overridden = content.strip() != ""
    if not overridden:
        content = st.default
    return json_response(
        {
            "kind": "outreach-prompts/" + stage, "content": content,
            "enabled": enabled, "skippable": stage != "fill", "is_overridden": overridden,
        }
    )


@router.get("/api/outreach-prompts/{stage}")
def get_outreach_prompt(stage: str, con=Depends(get_db)) -> Response:
    st = outreach_pkg.stage_by_key(stage)
    if st is None:
        return json_error("unknown stage: " + stage, 404)
    return _stage_payload(con, stage, st)


@router.put("/api/outreach-prompts/{stage}")
def put_outreach_prompt(stage: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """PUT {content} saves an override, {enabled} toggles the stage, {reset:true}
    reverts to the compiled default. The Writer (fill) can't be disabled."""
    st = outreach_pkg.stage_by_key(stage)
    if st is None:
        return json_error("unknown stage: " + stage, 404)
    body = decode_json(raw)
    if bool(body.get("reset")):
        prompt_overrides.reset_stage_content(con, stage)
    else:
        prompt_overrides.put_prompt_override(con, stage, _s(body, "content"))
    enabled = body.get("enabled")
    if enabled is not None and stage != "fill":
        prompt_overrides.set_stage_enabled(con, stage, bool(enabled))
    return _stage_payload(con, stage, st)
