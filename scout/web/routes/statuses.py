"""The two user-configurable status vocabularies (the jobs view dropdowns).

GET → {statuses}; PUT/POST {statuses}
replaces the list (empty/garbage rejected as 400 — the store's "statuses …"
ValueError → global 400). DB singletons, no Runner involved.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout.store import statuses

from ..deps import get_db
from ..responses import json_error, json_response
from .core import decode_json, raw_body

router = APIRouter()


def _set_status_list(raw: bytes, con, get, set_) -> Response:
    body = decode_json(raw)
    lst = body.get("statuses")
    if lst is None:
        lst = []
    if not isinstance(lst, list) or not all(isinstance(x, str) for x in lst):
        return json_error("invalid JSON: statuses must be an array of strings", 400)
    set_(con, lst)  # validation → "statuses …" ValueError → global 400
    return json_response({"statuses": get(con)})


# --- outreach statuses (the reply axis) --------------------------------------


@router.get("/api/outreach-statuses")
def get_outreach_statuses(con=Depends(get_db)) -> Response:
    return json_response({"statuses": statuses.outreach_statuses(con)})


@router.api_route("/api/outreach-statuses", methods=["PUT", "POST"])
def set_outreach_statuses(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    return _set_status_list(raw, con, statuses.outreach_statuses, statuses.set_outreach_statuses)


# --- application stages (the application axis) -------------------------------


@router.get("/api/application-stages")
def get_application_stages(con=Depends(get_db)) -> Response:
    return json_response({"statuses": statuses.application_stages(con)})


@router.api_route("/api/application-stages", methods=["PUT", "POST"])
def set_application_stages(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    return _set_status_list(raw, con, statuses.application_stages, statuses.set_application_stages)
