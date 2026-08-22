"""The typed knowledge docs behind Settings → Knowledge: one free-prose doc per
outreach need (experience / voice / logistics), stored as the need's 'local'
row in outreach_sources. The GET also returns the brain-synced pages for the
need (read-only here) so the editor can show the whole bundle the LLM gets.

The fourth doc, the company-fit criteria, has its own singleton at
/api/criteria (routes/config.py) because a save must re-fold the active
criteria version.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout import outreach as outreach_pkg
from scout.store import outreach_sources

from ..deps import get_db
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()

_NEEDS = {n.key for n in outreach_pkg.KNOWLEDGE_NEEDS}


def _payload(con, need: str) -> dict:
    brain = [
        {
            "page_id": s.page_id,
            "title": s.title,
            "content": s.content,
            "version": s.version,
            "resolved_at": s.resolved_at,
        }
        for s in outreach_sources.list_outreach_sources(con)
        if s.need == need and s.origin == outreach_sources.ORIGIN_BRAIN
    ]
    return {
        "kind": "knowledge",
        "need": need,
        "content": outreach_sources.get_local_source(con, need),
        "brain": brain,
    }


@router.get("/api/knowledge/{need}")
def get_knowledge(need: str, con=Depends(get_db)) -> Response:
    if need not in _NEEDS:
        return json_error("unknown knowledge need", 404)
    return json_response(_payload(con, need))


@router.put("/api/knowledge/{need}")
def put_knowledge(need: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Save the typed doc. Blank clears it. Brain-synced rows are never touched
    here, and a later sync never touches this row."""
    if need not in _NEEDS:
        return json_error("unknown knowledge need", 404)
    outreach_sources.put_local_source(con, need, _s(decode_json(raw), "content"))
    return json_response(_payload(con, need))
