"""Tests for the scout.brainbot client."""

from __future__ import annotations

import json

import pytest

from scout import brainbot
from tests.httpstub import http_server


def _json(payload: dict):
    def handle(req):
        return 200, {"Content-Type": "application/json"}, json.dumps(payload)

    return handle


def test_health_ok():
    captured = []

    def handle(req):
        captured.append(req)
        return 200, {}, '{"ok":true}'

    with http_server(handle) as base:
        brainbot.new(base).health()
    assert captured[0].path == "/health"


def test_health_ok_false():
    with http_server(_json({"ok": False})) as base:
        with pytest.raises(Exception):
            brainbot.new(base).health()


def test_health_5xx():
    def handle(req):
        return 503, {}, b""

    with http_server(handle) as base:
        with pytest.raises(Exception):
            brainbot.new(base).health()


def test_recall():
    captured = []

    def handle(req):
        captured.append(req)
        return (
            200,
            {"Content-Type": "application/json"},
            (
                '{"chunks":['
                '{"heading":"Target company","text":"Wants 0→1 product companies.","score":0.81,"path":"Job Hunting/Target company"},'
                '{"heading":"Job Hunting","text":"Avoids fintech and crypto.","score":0.32,"path":"Job Hunting"}'
                "]}"
            ),
        )

    with http_server(handle) as base:
        rr = brainbot.new(base).recall("what does the user want", 5)

    req = captured[0]
    assert req.path == "/recall"
    assert req.headers.get("Accept") == "application/json"
    assert req.query["q"] == ["what does the user want"]
    assert req.query["k"] == ["5"]
    # Scope must never be sent — recall(query) is the whole interface.
    assert "scope" not in req.query

    assert len(rr.chunks) == 2
    assert rr.chunks[0].heading == "Target company"
    assert rr.chunks[0].path == "Job Hunting/Target company"
    assert rr.chunks[0].score == 0.81
    assert "0→1" in rr.chunks[0].text


def test_recall_no_k():
    captured = []

    def handle(req):
        captured.append(req)
        return 200, {}, '{"chunks":[]}'

    with http_server(handle) as base:
        brainbot.new(base).recall("x", 0)
    assert "k" not in captured[0].query


def test_non_2xx_carries_error_detail():
    def handle(req):
        return 400, {}, '{"error":"missing required query param: q"}'

    with http_server(handle) as base:
        with pytest.raises(Exception) as exc:
            brainbot.new(base).recall("", 5)
    assert "missing required query param: q" in str(exc.value)


def test_bearer_auth():
    captured = []

    def handle(req):
        captured.append(req)
        return 200, {}, '{"chunks":[]}'

    with http_server(handle) as base:
        c = brainbot.new(base)
        c.auth = "s3cret"
        c.recall("x", 1)
    assert captured[0].headers.get("Authorization") == "Bearer s3cret"


def test_disabled_client():
    c = brainbot.new("")
    assert not c.enabled()
    with pytest.raises(Exception):
        c.health()
    with pytest.raises(Exception):
        c.recall("x", 5)
    with pytest.raises(Exception):
        c.changes("anything")


def test_new_trims_trailing_slash():
    c = brainbot.new("http://example.com:8100/")
    assert c.base_url == "http://example.com:8100"


def test_recall_complete():
    captured = []

    def handle(req):
        captured.append(req)
        return 200, {}, '{"chunks":[{"id":"u1","heading":"h","text":"t","score":0.9,"path":"p"}]}'

    with http_server(handle) as base:
        got = brainbot.new(base).recall_complete("dealbreakers", 50)

    assert captured[0].query["complete"] == ["true"]
    assert captured[0].query["k"] == ["50"]
    assert len(got.chunks) == 1
    assert got.chunks[0].id == "u1"


def test_doc_ok():
    captured = []

    def handle(req):
        captured.append(req)
        return (
            200,
            {},
            '{"id":"abc-123","title":"T","path":"A/T","version":"v9","text":"verbatim — body"}',
        )

    with http_server(handle) as base:
        got = brainbot.new(base).doc("abc-123")
    assert captured[0].path == "/doc"
    assert captured[0].query["id"] == ["abc-123"]
    assert got.version == "v9"
    assert got.text == "verbatim — body"


def test_doc_404_is_not_found():
    def handle(req):
        return 404, {}, '{"error":"unknown id"}'

    with http_server(handle) as base:
        with pytest.raises(Exception) as exc:
            brainbot.new(base).doc("gone")
    assert brainbot.is_not_found(exc.value)
    assert "unknown id" in str(exc.value)


def test_doc_400_is_not_not_found():
    def handle(req):
        return 400, {}, '{"error":"malformed id"}'

    with http_server(handle) as base:
        with pytest.raises(Exception) as exc:
            brainbot.new(base).doc("???")
    assert not brainbot.is_not_found(exc.value)


def test_map():
    captured = []

    def handle(req):
        captured.append(req)
        return (
            200,
            {},
            (
                '{"sources":['
                '{"id":"root1","title":"Outreach","path":"Outreach","parent_id":null,"version":"v1"},'
                '{"id":"kid1","title":"Templates","path":"Outreach/Templates","parent_id":"root1","version":"v2"}]}'
            ),
        )

    with http_server(handle) as base:
        got = brainbot.new(base).map()
    assert captured[0].path == "/map"
    assert len(got.sources) == 2
    assert got.sources[0].parent_id is None
    assert got.sources[1].parent_id == "root1"


def test_changes():
    # The stub mimics the brain: it echoes its current cursor and reports
    # changed=true unless `since` already equals that cursor.
    current = "cur-7"
    captured = []

    def handle(req):
        captured.append(req)
        since = req.query.get("since", [""])[0]
        changed = since != current
        return 200, {}, json.dumps({"cursor": current, "changed": changed})

    with http_server(handle) as base:
        c = brainbot.new(base)
        # Empty since → changed=true and the current cursor comes back.
        got = c.changes("")
        assert got.cursor == current
        assert got.changed is True
        # Passing the returned cursor back → changed=false (a stable view).
        got2 = c.changes(got.cursor)
        assert got2.cursor == current
        assert got2.changed is False

    assert captured[0].path == "/changes"
    assert "since" in captured[0].query
