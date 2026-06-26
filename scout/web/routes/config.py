"""The criteria editors that live outside the outreach pipeline: the taste.md
narrative fallback (a file), the structured pre-filter rules (a DB singleton),
the verdict playbook (a DB singleton), and the read-only filter-options
vocabularies.

Faithful port of the taste/playbook/taste-filter/filter-options handlers in
internal/web/editor.go, filter_options.go, and server.go. None of these touch the
brain. A taste.md or playbook save re-folds the active criteria version
(state.reload_taste) so new verdicts use the edit immediately; the pre-filter is a
mechanical gate the verdict provenance hash doesn't track, so it has no version.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from scout import filter as filter_pkg
from scout import playbook as playbook_pkg
from scout.store import playbook as playbook_store
from scout.store import taste_filter as taste_filter_store

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


def _criteria_stamp(state: AppState, out: dict) -> dict:
    """Fold the effective (playbook-folded) taste version + source into a payload,
    so an editor can show what new scores would be stamped with."""
    tb = state.current_taste()
    if tb is not None:
        out["taste_version"] = tb.version
        out["taste_source"] = tb.source
    return out


# --- taste.md (the narrative fallback, a file) -------------------------------


@router.get("/api/taste")
def get_taste(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    path = state.config.taste_md_path
    if path == "":
        return json_error("taste path not configured", 503)
    content = ""
    try:
        with open(path, encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        content = ""
    except OSError as e:
        return json_error(str(e), 500)
    return json_response(_criteria_stamp(state, {"kind": "taste", "path": path, "content": content}))


@router.put("/api/taste")
def put_taste(raw: bytes = Depends(raw_body), con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    path = state.config.taste_md_path
    if path == "":
        return json_error("taste path not configured", 503)
    content = _s(decode_json(raw), "content")
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    except OSError as e:
        return json_error("write taste: " + str(e), 500)
    state.reload_taste()  # adopt the edited criteria for new scores immediately
    return json_response(_criteria_stamp(state, {"kind": "taste", "path": path, "content": content}))


# --- playbook (DB singleton) -------------------------------------------------


@router.get("/api/playbook")
def get_playbook(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    content = playbook_store.get_playbook(con) or playbook_pkg.DEFAULT_PLAYBOOK
    return json_response(_criteria_stamp(state, {"kind": "playbook", "content": content}))


@router.put("/api/playbook")
def put_playbook(raw: bytes = Depends(raw_body), con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    content = _s(decode_json(raw), "content")
    playbook_store.put_playbook(con, content)
    state.reload_taste()  # re-fold the provenance hash so new scores use the edit
    return json_response(_criteria_stamp(state, {"kind": "playbook", "content": content}))


# --- structured pre-filter rules (DB singleton) ------------------------------


def _taste_from_rules(d: dict) -> filter_pkg.Taste:
    """Build a Taste from the form's structured JSON (the inverse of the JSON the
    GET returns under `rules`)."""
    loc = d.get("location") or {}
    hc = d.get("headcount") or {}
    vert = d.get("verticals") or {}
    fund = d.get("funding_stage") or {}
    return filter_pkg.Taste(
        location=filter_pkg.Location(
            allowed=list(loc.get("allowed") or []), remote_ok=bool(loc.get("remote_ok", False))
        ),
        headcount=filter_pkg.Headcount(min=int(hc.get("min", 0) or 0), max=int(hc.get("max", 0) or 0)),
        verticals=filter_pkg.Verticals(
            allowed=list(vert.get("allowed") or []), excluded=list(vert.get("excluded") or [])
        ),
        funding_stage=filter_pkg.FundingStage(allowed=list(fund.get("allowed") or [])),
    )


@router.get("/api/taste-filter")
def get_taste_filter(request: Request, con=Depends(get_db)) -> Response:
    content, enabled = taste_filter_store.get_taste_filter(con)
    # ?default=1 serves the compiled-in default rules without touching the saved
    # row (the form's Reset-to-default); the master switch is unaffected.
    if content == "" or request.query_params.get("default") == "1":
        content = filter_pkg.DEFAULT_TASTE_TOML
    try:
        rules = filter_pkg.parse_taste(content)
    except Exception as e:  # noqa: BLE001 - a corrupt saved row, surfaced not swallowed
        return json_error("parse saved pre-filter: " + str(e), 500)
    return json_response({"kind": "taste-filter", "content": content, "rules": rules, "enabled": enabled})


@router.put("/api/taste-filter")
def put_taste_filter(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    body = decode_json(raw)
    # The form sends structured rules; re-encode them to the canonical TOML. A raw
    # `content` string is the legacy path.
    content = _s(body, "content")
    if body.get("rules") is not None:
        try:
            content = filter_pkg.encode_toml(_taste_from_rules(body["rules"]))
        except Exception as e:  # noqa: BLE001
            return json_error("encode pre-filter: " + str(e), 500)
    try:
        filter_pkg.parse_taste(content)
    except Exception as e:  # noqa: BLE001 - a broken filter would drop every company
        return json_error("invalid pre-filter TOML: " + str(e), 400)
    # Preserve the current master switch when the client omits it.
    enabled = True
    try:
        _, cur = taste_filter_store.get_taste_filter(con)
        enabled = cur
    except Exception:  # noqa: BLE001
        pass
    if body.get("enabled") is not None:
        enabled = bool(body["enabled"])
    taste_filter_store.put_taste_filter(con, content, enabled)
    rules = filter_pkg.parse_taste(content)
    return json_response({"kind": "taste-filter", "content": content, "rules": rules, "enabled": enabled})


# --- filter-options vocabularies (read-only) ---------------------------------


@router.get("/api/filter-options")
def filter_options(con=Depends(get_db)) -> Response:
    """The vertical tags + funding stages present in the company data (with counts),
    for the pre-filter form's multi-selects. Derived live; the vertical field is a
    comma-separated tag set, so whole tags are split and counted."""
    rows = con.execute("SELECT COALESCE(vertical,''), COALESCE(funding_stage,'') FROM companies").fetchall()

    vert_count: dict[str, int] = {}      # lowercased tag -> count
    vert_display: dict[str, str] = {}    # lowercased tag -> first-seen display casing
    stage_count: dict[str, int] = {}     # canonical stage -> count
    for v, st in rows:
        seen: set[str] = set()           # dedup tags within one company
        for p in v.split(","):
            p = p.strip()
            if p == "":
                continue
            lk = p.lower()
            if lk in seen:
                continue
            seen.add(lk)
            vert_count[lk] = vert_count.get(lk, 0) + 1
            if lk not in vert_display:
                vert_display[lk] = p
        cs = filter_pkg.normalize_stage(st)
        if cs != "":
            stage_count[cs] = stage_count.get(cs, 0) + 1

    verts = [{"value": vert_display[lk], "count": c} for lk, c in vert_count.items()]
    verts.sort(key=lambda o: (-o["count"], o["value"]))

    # Canonical stages first (count 0 if absent), then any non-canonical present.
    canonical = set(filter_pkg.CANONICAL_STAGES)
    stages = [{"value": cs, "count": stage_count.get(cs, 0)} for cs in filter_pkg.CANONICAL_STAGES]
    extra = [{"value": cs, "count": c} for cs, c in stage_count.items() if cs not in canonical]
    extra.sort(key=lambda o: -o["count"])
    stages.extend(extra)

    return json_response({"verticals": verts, "stages": stages})
