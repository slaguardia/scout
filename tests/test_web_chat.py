"""Port of internal/web/chat_test.go — open-or-create threads, the key gate, and a
kick-then-stream round trip over the real engine driven by a stubbed SSE LLM."""
from __future__ import annotations

from scout import anthropic, chat
from scout.store import chat as chat_store
from scout.store.db import connect

from httpstub import http_server
from web_helpers import new_test_app, open_db

# A minimal end_turn SSE turn for the stubbed Anthropic endpoint.
CHAT_END_TURN_SSE = """event: message_start
data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi there."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}

event: message_stop
data: {"type":"message_stop"}

"""


def test_chat_threads_open_or_create(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    rec = client.get("/api/chat/threads?scope=global")
    assert rec.status_code == 200, (rec.status_code, rec.text)
    out = rec.json()
    assert out["thread"]["id"] and out["thread"]["scope"] == "global"

    # Idempotent: same (scope, scope_id) returns the same thread.
    rec2 = client.get("/api/chat/threads?scope=global")
    assert rec2.json()["thread"]["id"] == out["thread"]["id"]

    # company scope with no scope_id -> 400.
    assert client.get("/api/chat/threads?scope=company").status_code == 400


def test_chat_message_needs_key(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)  # no Chat engine wired
    con = open_db(db_path)
    th = chat_store.open_or_create_thread(con, chat_store.CHAT_SCOPE_GLOBAL, "")
    con.close()
    rec = client.post(f"/api/chat/{th.id}/message", content='{"text":"hi"}',
                      headers={"Content-Type": "application/json"})
    assert rec.status_code == 412, (rec.status_code, rec.text)


def test_chat_message_and_stream(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    con = open_db(db_path)
    th = chat_store.open_or_create_thread(con, chat_store.CHAT_SCOPE_GLOBAL, "")
    con.close()

    def handle(req):
        return 200, {"Content-Type": "text/event-stream"}, CHAT_END_TURN_SSE

    with http_server(handle) as llm_url:
        ac = anthropic.Client(api_key="k", endpoint=llm_url)
        client.app.state.scout.chat = chat.Engine(con=connect(db_path), client=ac)

        # Kick a turn.
        rec = client.post(f"/api/chat/{th.id}/message", content='{"text":"hello"}',
                          headers={"Content-Type": "application/json"})
        assert rec.status_code == 202, (rec.status_code, rec.text)

        # Consume the stream to the end (blocks until the turn finishes).
        srec = client.get(f"/api/chat/{th.id}/stream")
        body = srec.text
        assert "event: delta" in body and "Hi there." in body, body
        assert "event: end" in body, body

    # The turn persisted: user kick + assistant reply.
    con = open_db(db_path)
    msgs = chat_store.thread_messages(con, th.id)
    con.close()
    assert len(msgs) == 2 and msgs[0].role == "user" and msgs[1].role == "assistant"
    assert "Hi there." in msgs[1].content
