"""Port of internal/store/chat_test.go."""
import json

import pytest

from scout.store import chat, errors
from scout.store.chat import CHAT_SCOPE_COMPANY, CHAT_SCOPE_GLOBAL, CHAT_SCOPE_POSTING


def _assert_json_equal(got: str, want: str):
    assert json.loads(got) == json.loads(want)


def test_chat_thread_round_trip(db):
    th = chat.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
    assert th.scope == CHAT_SCOPE_GLOBAL and th.scope_id == ""

    user_msg = '[{"type":"text","text":"I applied to acme.com/jobs/1"}]'
    asst_msg = ('[{"type":"text","text":"On it."},{"type":"tool_use","id":"toolu_1",'
                '"name":"capture_link","input":{"url":"https://acme.com/jobs/1"}}]')
    tool_result = '[{"type":"tool_result","tool_use_id":"toolu_1","content":"captured posting p1"}]'

    chat.append_message(db, th.id, "user", user_msg, "I applied to acme.com/jobs/1")
    chat.append_message(db, th.id, "assistant", asst_msg, "")
    chat.append_message(db, th.id, "user", tool_result, "")

    msgs = chat.thread_messages(db, th.id)
    assert len(msgs) == 3
    assert msgs[0].role == "user" and msgs[1].role == "assistant" and msgs[2].role == "user"
    _assert_json_equal(msgs[1].content, asst_msg)
    _assert_json_equal(msgs[2].content, tool_result)

    got = chat.get_thread(db, th.id)
    assert got.title == "I applied to acme.com/jobs/1"


def test_chat_thread_open_or_create_idempotent(db):
    a = chat.open_or_create_thread(db, CHAT_SCOPE_COMPANY, "co-123")
    b = chat.open_or_create_thread(db, CHAT_SCOPE_COMPANY, "co-123")
    assert a.id == b.id
    c = chat.open_or_create_thread(db, CHAT_SCOPE_POSTING, "p-9")
    assert c.id != a.id
    g = chat.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
    assert g.id != a.id and g.id != c.id


def test_chat_thread_scope_validation(db):
    with pytest.raises(ValueError):
        chat.open_or_create_thread(db, CHAT_SCOPE_COMPANY, "")
    with pytest.raises(ValueError):
        chat.open_or_create_thread(db, "bogus", "x")


def test_chat_thread_delete_cascades(db):
    th = chat.open_or_create_thread(db, CHAT_SCOPE_GLOBAL, "")
    chat.append_message(db, th.id, "user", '[{"type":"text","text":"hi"}]', "hi")
    db.execute("DELETE FROM chat_threads WHERE id = ?", (th.id,))
    n = db.execute("SELECT COUNT(1) FROM chat_messages WHERE thread_id = ?", (th.id,)).fetchone()[0]
    assert n == 0


def test_append_message_unknown_thread(db):
    with pytest.raises(errors.NotFound):
        chat.append_message(db, "nope", "user", '[{"type":"text","text":"x"}]', "x")
