"""Tests for scout.anthropic — the Messages client and the SSE stream parser."""

from __future__ import annotations

import json

import pytest

from scout import anthropic
from scout.anthropic.client import _WEB_SEARCH_TOOL_TYPE
from tests.httpstub import http_server


def _client(base: str) -> anthropic.Client:
    return anthropic.Client(api_key="k", endpoint=base)


# --- client ---


def test_send_marshals_web_search_tool():
    captured = []

    def handle(req):
        captured.append(req)
        return (
            200,
            {"Content-Type": "application/json"},
            '{"id":"msg_1","model":"m","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}',
        )

    with http_server(handle) as base:
        c = _client(base)
        # With the tool: tools array carries one entry with the version + cap.
        c.send(
            anthropic.Request(
                model="m",
                messages=[anthropic.Message("user", "hi")],
                tools=[anthropic.new_web_search_tool(6)],
            )
        )
        # Without the tool: the field is omitted entirely.
        c.send(anthropic.Request(model="m", messages=[anthropic.Message("user", "hi")]))

    body0 = json.loads(captured[0].body)
    tools = body0["tools"]
    assert len(tools) == 1
    assert tools[0]["type"] == _WEB_SEARCH_TOOL_TYPE
    assert tools[0]["name"] == "web_search"
    assert tools[0]["max_uses"] == 6

    body1 = json.loads(captured[1].body)
    assert "tools" not in body1

    assert anthropic.new_web_search_tool(0).max_uses == 0


def test_text_skips_non_text_blocks():
    mixed = (
        '{"id":"msg_2","model":"m","stop_reason":"end_turn","content":['
        '{"type":"text","text":"Here is what I found. "},'
        '{"type":"server_tool_use","id":"srvtoolu_1","name":"web_search","input":{"query":"acme funding"}},'
        '{"type":"web_search_tool_result","tool_use_id":"srvtoolu_1","content":[{"type":"web_search_result","title":"Acme raises","url":"https://x"}]},'
        '{"type":"text","text":"Acme raised a Series B."}'
        "]}"
    )

    def handle(req):
        return 200, {"Content-Type": "application/json"}, mixed

    with http_server(handle) as base:
        resp = _client(base).send(
            anthropic.Request(model="m", messages=[anthropic.Message("user", "hi")])
        )
    assert resp.text() == "Here is what I found. Acme raised a Series B."


def test_send_retries_transient():
    state = {"n": 0}

    def handle(req):
        state["n"] += 1
        n = state["n"]
        if n == 1:
            return 429, {"retry-after": "0"}, '{"type":"error","error":{"type":"rate_limit_error"}}'
        if n == 2:
            return 529, {}, '{"type":"error"}'  # overloaded
        return (
            200,
            {"Content-Type": "application/json"},
            '{"id":"m","model":"m","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}',
        )

    with http_server(handle) as base:
        resp = _client(base).send(
            anthropic.Request(model="m", messages=[anthropic.Message("user", "hi")])
        )
    assert resp.text() == "ok"
    assert state["n"] == 3  # two retries


def test_send_no_retry_on_400():
    state = {"n": 0}

    def handle(req):
        state["n"] += 1
        return 400, {}, '{"type":"error","error":{"type":"invalid_request_error"}}'

    with http_server(handle) as base:
        with pytest.raises(anthropic.AnthropicError):
            _client(base).send(
                anthropic.Request(model="m", messages=[anthropic.Message("user", "hi")])
            )
    assert state["n"] == 1  # no retry on 400


# --- stream ---

# A turn with thinking + text + a tool_use. The \" sequences are JSON-escaped
# quotes inside the partial_json string value (a raw string keeps the backslash).
TOOL_USE_STREAM = r"""event: message_start
data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-6","usage":{"input_tokens":50,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Did I add "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Ramp?"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-abc"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Let me "}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"check."}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: content_block_start
data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"search","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"query\": "}}

event: content_block_delta
data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"\"Ramp\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":2}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":40}}

event: message_stop
data: {"type":"message_stop"}

"""

# A plain text turn ending in end_turn — the common no-tool case.
TEXT_STREAM = r"""event: message_start
data: {"type":"message_start","message":{"id":"msg_2","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Yes, "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Ramp is tracked."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}

event: message_stop
data: {"type":"message_stop"}

"""


def _sse_handler(body: str, captured: list | None = None):
    def handle(req):
        if captured is not None:
            captured.append(req)
        return 200, {"Content-Type": "text/event-stream"}, body

    return handle


def test_stream_tool_use_round_trip():
    captured = []
    streamed = []
    with http_server(_sse_handler(TOOL_USE_STREAM, captured)) as base:
        resp = _client(base).stream(
            anthropic.Request(
                model="claude-sonnet-4-6",
                messages=[anthropic.Message("user", "did I add Ramp?")],
                thinking=anthropic.ADAPTIVE_THINKING,
                tools=[
                    anthropic.ToolDef(
                        name="search", description="search", input_schema={"type": "object"}
                    )
                ],
            ),
            lambda s: streamed.append(s),
        )

    # (a) text deltas accumulate — both via Response.text() and the on_text callback.
    assert resp.text() == "Let me check."
    assert "".join(streamed) == "Let me check."

    # (b) the tool_use stop is parsed with the tool_use block intact.
    assert resp.stop_reason == "tool_use"
    assert len(resp.content) == 3
    tu = resp.content[2]
    assert tu.type == "tool_use"
    assert tu.raw["id"] == "toolu_1"
    assert tu.raw["name"] == "search"
    assert tu.raw["input"]["query"] == "Ramp"  # accumulated from input_json_delta

    # The thinking block preserves its accumulated text + signature for replay.
    think = resp.content[0].raw
    assert think["type"] == "thinking"
    assert think["thinking"] == "Did I add Ramp?"
    assert think["signature"] == "sig-abc"

    # raw_content() (used to replay the assistant turn) yields all three blocks.
    assert len(resp.raw_content()) == 3

    # Usage is captured from message_start (input) and message_delta (output).
    assert resp.usage.input_tokens == 50
    assert resp.usage.output_tokens == 40

    # The request marshaled stream:true, the adaptive thinking config, and the tool.
    body = json.loads(captured[0].body)
    assert body["stream"] is True
    assert body["thinking"]["type"] == "adaptive"


def test_stream_plain_text():
    with http_server(_sse_handler(TEXT_STREAM)) as base:
        resp = _client(base).stream(
            anthropic.Request(
                model="claude-sonnet-4-6", messages=[anthropic.Message("user", "hi")]
            ),
            None,
        )
    assert resp.text() == "Yes, Ramp is tracked."
    assert resp.stop_reason == "end_turn"


def test_stream_error_event():
    body = (
        "event: message_start\n"
        'data: {"type":"message_start","message":{"id":"m","model":"m","usage":{"input_tokens":1,"output_tokens":1}}}\n'
        "\n"
        "event: error\n"
        'data: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n'
        "\n"
    )
    with http_server(_sse_handler(body)) as base:
        with pytest.raises(anthropic.StreamError):
            _client(base).stream(
                anthropic.Request(model="m", messages=[anthropic.Message("user", "hi")]), None
            )


def test_stream_retries_transient():
    state = {"n": 0}

    def handle(req):
        state["n"] += 1
        if state["n"] == 1:
            return 503, {"retry-after": "0"}, '{"type":"error"}'
        return 200, {"Content-Type": "text/event-stream"}, TEXT_STREAM

    with http_server(handle) as base:
        resp = _client(base).stream(
            anthropic.Request(model="m", messages=[anthropic.Message("user", "hi")]), None
        )
    assert resp.stop_reason == "end_turn"
    assert state["n"] == 2  # one retry
