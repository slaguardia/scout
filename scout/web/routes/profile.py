"""The brain-profile view: the locally-cached criteria the verdict stage feeds the
LLM, read-only, plus an on-demand refresh.

Faithful port of internal/web/profile.go. These never write the brain — refresh
only re-reads /profile (distill) and updates the local cache. profile_payload makes
at most ONE cheap Tier 0 /changes probe (same cost class as /health), so the GET
stays a cheap read; criteria_state classifies the panel badge from already-cheap
signals and is pure.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import Response

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response

router = APIRouter()


def within_ttl_ceiling(verified_age_seconds: int, age_seconds: int, ttl_seconds: float) -> bool:
    """The resolver's demoted-TTL ceiling: time since the brief was last CONFIRMED
    current (verified_at), or — for a never-verified legacy row — since it was
    fetched. A non-positive TTL means "no ceiling"."""
    if ttl_seconds <= 0:
        return True
    age = verified_age_seconds
    if age < 0:
        age = age_seconds
    return age < ttl_seconds


def criteria_state(
    cursor_present: bool, verified_age_seconds: int, age_seconds: int, ttl_seconds: float,
    changed: bool, probed: bool,
) -> str:
    """Derive the Criteria-panel badge (current | changed | unverified) from cheap
    signals. probed reports whether a fresh /changes result is available; changed
    is only meaningful when probed. Pure/display-only — never runs a recall."""
    if not cursor_present or verified_age_seconds < 0:
        return "unverified"
    if probed:
        return "changed" if changed else "current"
    if within_ttl_ceiling(verified_age_seconds, age_seconds, ttl_seconds):
        return "current"
    return "unverified"


def profile_payload(state: AppState, con, skip_health: bool) -> dict:
    """Assemble the profile view: configuration + reachability, the cached body +
    freshness, and the currently-active criteria source/version. skip_health avoids
    a redundant liveness probe right after a successful refresh."""
    brain = state.brainbot
    configured = brain is not None and brain.enabled()
    out: dict = {"configured": configured}
    reachable = False
    if configured:
        out["source_url"] = brain.base_url
        reachable = skip_health or state.brain_healthy()
        out["reachable"] = reachable

    resolver = state.resolver
    if resolver is not None:
        resolver.store = con  # the read-only cache read uses this connection
        ttl = resolver.ttl
        out["ttl_seconds"] = int(ttl)
        cp = None
        try:
            cp = resolver.cached()
        except Exception:  # noqa: BLE001
            cp = None
        if cp is not None:
            out["body"] = cp.body
            out["chars"] = len(cp.body)
            out["fetched_at"] = cp.fetched_at
            out["age_seconds"] = cp.age_seconds
            out["verified_at"] = cp.verified_at
            out["verified_age_seconds"] = cp.verified_age_seconds

            # Tier 0 change probe: one cheap /changes call to see whether the brain
            # moved since we last confirmed-current. Only when it can help and is
            # cheap — configured, reachable, a cursor to compare, and NOT right after
            # a refresh (which just confirmed it). On any error we simply don't probe.
            changed, probed = False, False
            if configured and reachable and not skip_health and cp.cursor != "":
                try:
                    cr = brain.changes(cp.cursor)
                    changed, probed = cr.changed, True
                except Exception:  # noqa: BLE001
                    pass
            out["criteria_state"] = criteria_state(
                cp.cursor != "", cp.verified_age_seconds, cp.age_seconds, ttl, changed, probed
            )

    tb = state.current_taste()
    if tb is not None:
        out["active_source"] = tb.source
        out["active_version"] = tb.version
    return out


@router.get("/api/profile")
def get_profile(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    """The cached criteria text the verdict stage feeds the LLM, plus freshness
    metadata. Read-only."""
    return json_response(profile_payload(state, con, False))


@router.post("/api/profile/refresh")
def post_profile_refresh(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    """Force a refetch of the brain profile, update the cache, and rebuild the active
    criteria (the version may change → verdicts go stale). 502 when the brain is
    unreachable or has no criteria captured yet; 404 when no brain is configured."""
    if state.resolver is None or state.brainbot is None or not state.brainbot.enabled():
        return json_error("brain not configured", 404)
    state.resolver.store = con
    try:
        state.resolver.refresh()
    except Exception as e:  # noqa: BLE001 - brain unreachable / empty -> 502
        return json_error(str(e), 502)
    state.reload_taste()  # adopt the refreshed criteria immediately
    return json_response(profile_payload(state, con, True))
