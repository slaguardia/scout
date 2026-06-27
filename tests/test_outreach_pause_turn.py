"""Hosted web_search pause_turn continuation handling in Engine._call_json."""

from __future__ import annotations

import json

import pytest

from scout import anthropic
from scout.outreach import Engine
from scout.outreach.engine import MAX_CONTINUATIONS
from tests.httpstub import http_server


def test_call_json_pause_turn_continuation():
    # The server tool can pause at its server-side iteration cap; the engine must
    # replay the assistant content verbatim and re-send until the turn completes.
    state = {"n": 0}
    bodies: list[str] = []

    def handle(req):
        state["n"] += 1
        bodies.append(req.body.decode())
        hdr = {"Content-Type": "application/json"}
        if state["n"] == 1:
            return (
                200,
                hdr,
                json.dumps(
                    {
                        "content": [
                            {
                                "type": "server_tool_use",
                                "id": "st1",
                                "name": "web_search",
                                "input": {"query": "acme news"},
                            },
                            {"type": "web_search_tool_result", "tool_use_id": "st1", "content": []},
                        ],
                        "stop_reason": "pause_turn",
                    }
                ),
            )
        return (
            200,
            hdr,
            json.dumps(
                {"content": [{"type": "text", "text": '{"ok":true}'}], "stop_reason": "end_turn"}
            ),
        )

    with http_server(handle) as base:
        c = anthropic.new("test-key")
        c.endpoint = base
        e = Engine(client=c)
        raw = e._call_json("sys", "research acme", 1000, [anthropic.new_web_search_tool(6)])

    assert state["n"] == 2
    assert '"ok":true' in raw

    # The continuation request (the 2nd) replays the assistant turn's raw blocks and
    # injects no extra user nudge between the turns.
    msgs = json.loads(bodies[1])["messages"]
    assert msgs[-1]["role"] == "assistant"
    assert sum(1 for m in msgs if m["role"] == "user") == 1
    flat = json.dumps(msgs)
    assert "server_tool_use" in flat and "st1" in flat


def test_call_json_pause_turn_gives_up():
    # A stream of pause_turns is bounded: each send gives up after maxContinuations
    # resumes, so _call_json terminates with an error (its JSON retry doubles the
    # sends) instead of looping forever.
    state = {"n": 0}

    def handle(req):
        state["n"] += 1
        return (
            200,
            {"Content-Type": "application/json"},
            json.dumps(
                {
                    "content": [{"type": "text", "text": "still searching"}],
                    "stop_reason": "pause_turn",
                }
            ),
        )

    with http_server(handle) as base:
        c = anthropic.new("test-key")
        c.endpoint = base
        e = Engine(client=c)
        with pytest.raises(ValueError):
            e._call_json("sys", "u", 1000, [anthropic.new_web_search_tool(6)])

    # One send per JSON attempt = 1 + maxContinuations requests; _call_json retries
    # the JSON parse once, so exactly two bounded send loops.
    assert state["n"] == 2 * (MAX_CONTINUATIONS + 1)
