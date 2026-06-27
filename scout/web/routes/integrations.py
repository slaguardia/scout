"""The dashboard's Anthropic-key integration.

    GET    /api/integrations/anthropic -> {has_key, key_source}   (never the key)
    PUT    /api/integrations/anthropic {key} -> verify, store, re-key the client
    DELETE /api/integrations/anthropic       -> remove the DB key, fall back to env

The key is write-only from the browser: stored but never echoed back. A UI-stored
key wins over ANTHROPIC_API_KEY; removing it falls back to the env. PUT validates
the key against the API before storing (a reject → 400) so a typo can't silently
disable scoring.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout import anthropic as anthropic_pkg
from scout.store import settings as settings_store

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


def _nullable(s: str):
    """ "" -> JSON null; any other string -> itself (key_source serializes as
    null / "db" / "env")."""
    return s if s != "" else None


@router.get("/api/integrations/anthropic")
def get_anthropic_key(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    _, source = state.active_anthropic_key(con)
    return json_response({"has_key": source != "", "key_source": _nullable(source)})


@router.put("/api/integrations/anthropic")
def put_anthropic_key(
    raw: bytes = Depends(raw_body), con=Depends(get_db), state: AppState = Depends(get_state)
) -> Response:
    try:
        key = _s(decode_json(raw), "key").strip()
    except ValueError:
        key = ""
    if key == "":
        return json_error("missing required field: key", 400)

    verify = state.key_verifier or anthropic_pkg.verify
    try:
        verify(key)
    except Exception as e:  # noqa: BLE001 - any rejection is a 400, not a 500
        return json_error("Anthropic rejected the key: " + str(e), 400)

    settings_store.set_setting(con, settings_store.ANTHROPIC_KEY_SETTING, key)
    if state.anthropic is not None:
        state.anthropic.set_api_key(key)
    return json_response({"has_key": True, "key_source": "db"})


@router.delete("/api/integrations/anthropic")
def delete_anthropic_key(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    settings_store.delete_setting(con, settings_store.ANTHROPIC_KEY_SETTING)
    key, source = state.active_anthropic_key(con)  # may fall back to env
    if state.anthropic is not None:
        state.anthropic.set_api_key(key)
    return json_response({"has_key": source != "", "key_source": _nullable(source)})
