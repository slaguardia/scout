"""Tests for the scout.chat engine."""

from __future__ import annotations

import re
import threading
from datetime import datetime

from scout import anthropic, chat
from scout.ingest import CapturedCompany, ensure_company
from scout.store import chat as chat_store
from scout.store.chat import CHAT_SCOPE_GLOBAL
from tests.httpstub import http_server

# Turn 1: the model calls the search tool. Turn 2 (after the tool_result is fed
# back): it answers and ends.
SEARCH_TOOL_STREAM = """event: message_start
data: {"type":"message_start","message":{"id":"m1","model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Let me check. "}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_s","name":"search","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"Ramp\\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":20}}

event: message_stop
data: {"type":"message_stop"}

"""

END_TURN_STREAM = """event: message_start
data: {"type":"message_start","message":{"id":"m2","model":"claude-sonnet-4-6","usage":{"input_tokens":150,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Yes, Ramp is already tracked."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}

event: message_stop
data: {"type":"message_stop"}

"""


def _tool_use_sse(name: str, escaped_input: str) -> str:
    """A one-tool-call assistant turn (stop_reason tool_use) whose tool input is the
    given escaped-JSON string."""
    return (
        "event: message_start\n"
        'data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":1}}}\n\n'
        "event: content_block_start\n"
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_x","name":"'
        + name
        + '","input":{}}}\n\n'
        "event: content_block_delta\n"
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"'
        + escaped_input
        + '"}}\n\n'
        "event: content_block_stop\n"
        'data: {"type":"content_block_stop","index":0}\n\n'
        "event: message_delta\n"
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}\n\n'
        "event: message_stop\n"
        'data: {"type":"message_stop"}\n\n'
    )


def test_engine_tool_round_trip(db):
    # A company the search tool will find.
    ensure_company(db, CapturedCompany(name="Ramp", domain="ramp.com"))

    # Stubbed Anthropic: turn 1 → search tool_use; turn 2 → end_turn. Record the
    # second request body so we can assert the tool ran and its result fed back.
    state = {"n": 0, "second_body": None}
    lock = threading.Lock()

    def handle(req):
        with lock:
            state["n"] += 1
            call = state["n"]
            if call == 2:
                state["second_body"] = req.body
        body = SEARCH_TOOL_STREAM if call == 1 else END_TURN_STREAM
        return 200, {"Content-Type": "text/event-stream"}, body

    streamed: list[str] = []
    with http_server(handle) as url:
        client = anthropic.Client(api_key="k", endpoint=url)
        eng = chat.new(db, client)
        th = chat_store.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
        chat_store.append_message(
            db,
            th.id,
            "user",
            '[{"type":"text","text":"did I already add Ramp?"}]',
            "did I already add Ramp?",
        )
        system = chat.system_prompt(CHAT_SCOPE_GLOBAL, "", datetime(2026, 6, 8))
        eng.run(th.id, system, lambda s: streamed.append(s))

    # The loop made exactly two model calls and terminated.
    assert state["n"] == 2, "model calls = 2 (one tool round-trip)"

    # Streamed text from both turns reached the callback.
    joined = "".join(streamed)
    assert "Let me check." in joined and "Yes, Ramp is already tracked." in joined

    # The second request carried the tool_result with the search hit (proves the
    # search tool actually ran against the store).
    body = state["second_body"]
    assert b"tool_result" in body and b"Ramp" in body

    # Persisted history: user kick, assistant(text+tool_use), user(tool_result),
    # assistant(final text) — four turns.
    msgs = chat_store.thread_messages(db, th.id)
    assert len(msgs) == 4
    assert [m.role for m in msgs] == ["user", "assistant", "user", "assistant"]
    # The assistant tool_use turn round-trips with its block intact.
    assert "tool_use" in msgs[1].content and "search" in msgs[1].content
    # The final assistant turn carries the answer.
    assert "Yes, Ramp is already tracked." in msgs[3].content


# The headline DoD scenario, end to end against stubs: "I applied to <link>" → the
# model calls capture_link (which fetches a page + extracts via the JSON Send path)
# then track_application (chaining the posting_id it read from the capture
# tool_result) → a company row + a tracked posting with the 'applied' stage set.
_PID_RE = re.compile(
    rb"posting_id[\\\":\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
)

_CAPTURE_EXTRACTION = (
    '{"id":"msg_x","model":"haiku","stop_reason":"end_turn","content":[{"type":"text","text":'
    '"{\\"kind\\":\\"job_posting\\",\\"company_name\\":\\"Acme\\",\\"company_domain\\":\\"acme.com\\",'
    '\\"job_title\\":\\"Platform Engineer\\",\\"job_location\\":\\"NYC\\",\\"summary\\":\\"Infra role.\\",'
    '\\"vertical\\":\\"AI infra\\",\\"company_location\\":\\"\\"}"}]}'
)


def test_engine_applied_to_link_flow(db):
    # A job-posting page with enough text to pass capture's content gate.
    def page_handle(req):
        html = (
            "<html><body><h1>Platform Engineer</h1>"
            + ("<p>Acme builds AI infrastructure for teams. </p>" * 30)
            + "</body></html>"
        )
        return 200, {"Content-Type": "text/html"}, html

    with http_server(page_handle) as page_url:

        def chat_handle(req):
            body = req.body
            # capture's extraction is a non-stream Send → return the JSON extraction.
            # (The wire encoder only emits the "stream" key on streamed requests.)
            if b'"stream"' not in body:
                return 200, {"Content-Type": "application/json"}, _CAPTURE_EXTRACTION
            # chat Stream — drive the flow by how many tool_results are present.
            n = body.count(b'"tool_result"')
            if n == 0:
                sse = _tool_use_sse("capture_link", '{\\"url\\":\\"' + page_url + '\\"}')
            elif n == 1:
                m = _PID_RE.search(body)
                if m is None:
                    return 200, {"Content-Type": "text/event-stream"}, END_TURN_STREAM
                pid = m.group(1).decode()
                sse = _tool_use_sse(
                    "track_application",
                    '{\\"posting_id\\":\\"' + pid + '\\",\\"stage\\":\\"applied\\"}',
                )
            else:
                sse = END_TURN_STREAM
            return 200, {"Content-Type": "text/event-stream"}, sse

        with http_server(chat_handle) as chat_url:
            eng = chat.new(db, anthropic.Client(api_key="k", endpoint=chat_url))
            th = chat_store.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
            chat_store.append_message(
                db,
                th.id,
                "user",
                '[{"type":"text","text":"I applied to ' + page_url + '"}]',
                "applied",
            )
            system = chat.system_prompt(CHAT_SCOPE_GLOBAL, "", datetime(2026, 6, 8))
            eng.run(th.id, system, None)

    # A company was created and a posting tracked with the 'applied' stage set.
    from scout.store import postings

    jobs = postings.list_job_rows(db)
    assert len(jobs) == 1, f"got {len(jobs)} postings, want 1"
    assert jobs[0].company == "Acme"
    assert jobs[0].application_status == "applied", "track_application didn't run"


# A bare end_turn (no tools) stops after one call.
def test_engine_no_tools(db):
    calls = {"n": 0}

    def handle(req):
        calls["n"] += 1
        return 200, {"Content-Type": "text/event-stream"}, END_TURN_STREAM

    with http_server(handle) as url:
        eng = chat.new(db, anthropic.Client(api_key="k", endpoint=url))
        th = chat_store.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
        chat_store.append_message(db, th.id, "user", '[{"type":"text","text":"hi"}]', "hi")
        eng.run(th.id, "sys", None)

    assert calls["n"] == 1
    msgs = chat_store.thread_messages(db, th.id)
    assert len(msgs) == 2  # user + assistant


# The update_company tool corrects structured company fields and preserves the
# fields it isn't passed (the store update is a full replace).
def test_update_company_tool(db):
    import json as _json

    from scout.store import detail

    cid, _ = ensure_company(db, CapturedCompany(name="Commure", domain="commure.com"))
    eng = chat.new(db, anthropic.Client(api_key="k", endpoint="http://127.0.0.1:1"))

    out = eng.tools["update_company"](
        {"company_id": cid, "funding_stage": "late-stage", "headcount": 2000}
    )
    res = _json.loads(out)
    assert res["funding_stage"] == "late-stage" and res["headcount"] == 2000

    d = detail.get_company_detail(db, cid)
    assert d.funding_stage == "late-stage" and d.headcount == 2000

    # A second call touching only vertical leaves stage + headcount intact.
    eng.tools["update_company"]({"company_id": cid, "vertical": "Healthcare"})
    d2 = detail.get_company_detail(db, cid)
    assert d2.vertical == "Healthcare"
    assert d2.funding_stage == "late-stage" and d2.headcount == 2000

    # An unknown id surfaces as an error (not a silent dangling write).
    try:
        eng.tools["update_company"]({"company_id": "nope", "funding_stage": "Seed"})
        raise AssertionError("expected an error for an unknown id")
    except RuntimeError:
        pass


# on_event fires a human-readable activity line each time a custom tool runs.
def test_engine_activity_events_for_tools(db):
    ensure_company(db, CapturedCompany(name="Ramp", domain="ramp.com"))

    state = {"n": 0}

    def handle(req):
        state["n"] += 1
        body = SEARCH_TOOL_STREAM if state["n"] == 1 else END_TURN_STREAM
        return 200, {"Content-Type": "text/event-stream"}, body

    events: list[str] = []
    with http_server(handle) as url:
        eng = chat.new(db, anthropic.Client(api_key="k", endpoint=url))
        th = chat_store.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
        chat_store.append_message(db, th.id, "user", '[{"type":"text","text":"ramp?"}]', "ramp?")
        eng.run(th.id, "sys", None, events.append)

    # The custom `search` tool ran → its verb was emitted as activity.
    assert "searching scout" in events


# on_event fires when the hosted web_search server tool runs.
WEB_SEARCH_STREAM = (
    "event: message_start\n"
    'data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":1}}}\n\n'
    "event: content_block_start\n"
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"server_tool_use","id":"st1","name":"web_search","input":{}}}\n\n'
    "event: content_block_delta\n"
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"Commure funding\\"}"}}\n\n'
    "event: content_block_stop\n"
    'data: {"type":"content_block_stop","index":0}\n\n'
    "event: content_block_start\n"
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n'
    "event: content_block_delta\n"
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Commure is late-stage."}}\n\n'
    "event: content_block_stop\n"
    'data: {"type":"content_block_stop","index":1}\n\n'
    "event: message_delta\n"
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}\n\n'
    "event: message_stop\n"
    'data: {"type":"message_stop"}\n\n'
)


def test_engine_activity_event_for_web_search(db):
    def handle(req):
        return 200, {"Content-Type": "text/event-stream"}, WEB_SEARCH_STREAM

    events: list[str] = []
    with http_server(handle) as url:
        eng = chat.new(db, anthropic.Client(api_key="k", endpoint=url))
        th = chat_store.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
        chat_store.append_message(db, th.id, "user", '[{"type":"text","text":"commure?"}]', "commure?")
        eng.run(th.id, "sys", None, events.append)

    assert any(s.startswith("searching the web") for s in events)
    assert any("Commure funding" in s for s in events)
