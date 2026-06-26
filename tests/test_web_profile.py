"""Port of internal/web/profile_test.go — the criteria-state tri-state deriver and
the read-only profile payload over a stubbed brain."""
from __future__ import annotations

import json

from scout import brainbot as brainbot_pkg
from scout import criteria as criteria_pkg
from scout import distill as distill_pkg
from scout.store import brain_profile
from scout.store import db as db_module
from scout.web.config import Config
from scout.web.deps import AppState
from scout.web.routes.profile import criteria_state, profile_payload

from httpstub import http_server


def _brain_handler(cursor, health_ok, changes_ok):
    def handle(req):
        hdr = {"Content-Type": "application/json"}
        if req.path == "/health":
            if not health_ok:
                return 503, hdr, "{}"
            return 200, hdr, '{"ok":true}'
        if req.path == "/changes":
            if not changes_ok:
                return 500, hdr, "{}"
            since = req.query.get("since", [""])[0]
            return 200, hdr, json.dumps({"cursor": cursor, "changed": since != cursor})
        return 404, hdr, '{"error":"not found"}'

    return handle


def _state(tmp_path, base, ttl=3600.0):
    db_path = str(tmp_path / "test.db")
    con = db_module.open_db(db_path)
    bc = brainbot_pkg.new(base)
    resolver = criteria_pkg.Resolver(
        brain=bc, distiller=distill_pkg.Distiller(brain=bc), store=con, ttl=ttl
    )
    state = AppState(Config(db_path=db_path), brainbot=bc, resolver=resolver)
    return state, con


def test_criteria_state_current(tmp_path):
    with http_server(_brain_handler("cur-1", True, True)) as base:
        state, con = _state(tmp_path, base)
        brain_profile.put_brain_profile(con, base, "BRIEF", "h", "cur-1")  # cursor matches
        out = profile_payload(state, con, False)
        con.close()
    assert out["criteria_state"] == "current"
    assert "stale" not in out
    assert "verified_age_seconds" in out


def test_criteria_state_changed(tmp_path):
    with http_server(_brain_handler("cur-NEW", True, True)) as base:
        state, con = _state(tmp_path, base)
        brain_profile.put_brain_profile(con, base, "BRIEF", "h", "cur-OLD")  # cursor differs
        out = profile_payload(state, con, False)
        con.close()
    assert out["criteria_state"] == "changed"


def test_criteria_state_unverified_unreachable(tmp_path):
    with http_server(_brain_handler("cur-1", False, False)) as base:  # health + changes fail
        state, con = _state(tmp_path, base)
        brain_profile.put_brain_profile(con, base, "BRIEF", "h", "cur-1")
        # Age it past the TTL ceiling so an unverifiable cache reads unverified.
        con.execute(
            "UPDATE brain_profile_cache SET verified_at = datetime('now','-10 hours'), "
            "fetched_at = datetime('now','-10 hours') WHERE source_url = ?",
            (base,),
        )
        out = profile_payload(state, con, False)
        con.close()
    assert out["criteria_state"] == "unverified"


def test_criteria_state_unverified_no_cursor(tmp_path):
    with http_server(_brain_handler("cur-1", True, True)) as base:
        state, con = _state(tmp_path, base)
        # Legacy row: no cursor, verified_at NULL.
        con.execute(
            "INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at) "
            "VALUES (?, 'BRIEF', 'h', CURRENT_TIMESTAMP)",
            (base,),
        )
        out = profile_payload(state, con, False)
        con.close()
    assert out["criteria_state"] == "unverified"


def test_criteria_state_pure_deriver():
    ttl = 3600.0
    cases = [
        # (cursor_present, verified_age, age, changed, probed, want)
        (True, 10, 10, False, True, "current"),
        (True, 10, 10, True, True, "changed"),
        (True, 60, 60, False, False, "current"),
        (True, 7200, 7200, False, False, "unverified"),
        (False, 10, 10, False, False, "unverified"),
        (True, -1, 10, False, True, "unverified"),
    ]
    for cursor_present, verified_age, age, changed, probed, want in cases:
        got = criteria_state(cursor_present, verified_age, age, ttl, changed, probed)
        assert got == want, (cursor_present, verified_age, age, changed, probed, want, got)
