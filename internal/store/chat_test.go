package store

import (
	"encoding/json"
	"testing"
)

// A thread + a full tool round-trip must store and replay verbatim: a user
// turn, an assistant turn carrying a tool_use block, and the follow-up user
// turn carrying the matching tool_result. The content arrays are the exact
// bytes the next API turn replays, so they must survive the round-trip
// unchanged and come back oldest-first.
func TestChatThreadRoundTrip(t *testing.T) {
	db := openTestDB(t)

	th, err := db.OpenOrCreateThread(ChatScopeGlobal, "")
	if err != nil {
		t.Fatalf("OpenOrCreateThread: %v", err)
	}
	if th.Scope != ChatScopeGlobal || th.ScopeID != "" {
		t.Fatalf("thread = %+v, want global/empty", th)
	}

	userMsg := json.RawMessage(`[{"type":"text","text":"I applied to acme.com/jobs/1"}]`)
	asstMsg := json.RawMessage(`[{"type":"text","text":"On it."},{"type":"tool_use","id":"toolu_1","name":"capture_link","input":{"url":"https://acme.com/jobs/1"}}]`)
	toolResult := json.RawMessage(`[{"type":"tool_result","tool_use_id":"toolu_1","content":"captured posting p1"}]`)

	if _, err := db.AppendMessage(th.ID, "user", userMsg, "I applied to acme.com/jobs/1"); err != nil {
		t.Fatalf("append user: %v", err)
	}
	if _, err := db.AppendMessage(th.ID, "assistant", asstMsg, ""); err != nil {
		t.Fatalf("append assistant: %v", err)
	}
	if _, err := db.AppendMessage(th.ID, "user", toolResult, ""); err != nil {
		t.Fatalf("append tool_result: %v", err)
	}

	msgs, err := db.ThreadMessages(th.ID)
	if err != nil {
		t.Fatalf("ThreadMessages: %v", err)
	}
	if len(msgs) != 3 {
		t.Fatalf("got %d messages, want 3", len(msgs))
	}
	// Oldest-first order.
	if msgs[0].Role != "user" || msgs[1].Role != "assistant" || msgs[2].Role != "user" {
		t.Errorf("roles = %q/%q/%q, want user/assistant/user", msgs[0].Role, msgs[1].Role, msgs[2].Role)
	}
	// Content arrays round-trip as semantically-equal JSON (the tool_use and
	// tool_result blocks are intact for replay).
	assertJSONEqual(t, msgs[1].Content, asstMsg, "assistant tool_use")
	assertJSONEqual(t, msgs[2].Content, toolResult, "tool_result")

	// The first user line seeded the title.
	got, err := db.GetThread(th.ID)
	if err != nil {
		t.Fatalf("GetThread: %v", err)
	}
	if got.Title != "I applied to acme.com/jobs/1" {
		t.Errorf("title = %q, want the first user line", got.Title)
	}
}

// A panel reuses one thread for its (scope, scope_id) — repeat opens resolve to
// the same row so the conversation accumulates.
func TestChatThreadOpenOrCreateIdempotent(t *testing.T) {
	db := openTestDB(t)

	a, err := db.OpenOrCreateThread(ChatScopeCompany, "co-123")
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	b, err := db.OpenOrCreateThread(ChatScopeCompany, "co-123")
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	if a.ID != b.ID {
		t.Errorf("re-open created a new thread (%s != %s)", a.ID, b.ID)
	}
	// A different entity gets its own thread.
	c, err := db.OpenOrCreateThread(ChatScopePosting, "p-9")
	if err != nil {
		t.Fatalf("posting open: %v", err)
	}
	if c.ID == a.ID {
		t.Error("posting thread collided with the company thread")
	}
	// global is distinct again.
	g, _ := db.OpenOrCreateThread(ChatScopeGlobal, "")
	if g.ID == a.ID || g.ID == c.ID {
		t.Error("global thread collided with an entity thread")
	}
}

func TestChatThreadScopeValidation(t *testing.T) {
	db := openTestDB(t)
	if _, err := db.OpenOrCreateThread(ChatScopeCompany, ""); err == nil {
		t.Error("company scope with empty scope_id should error")
	}
	if _, err := db.OpenOrCreateThread("bogus", "x"); err == nil {
		t.Error("unknown scope should error")
	}
}

// Deleting a thread cascades its messages (ON DELETE CASCADE + foreign_keys on).
func TestChatThreadDeleteCascades(t *testing.T) {
	db := openTestDB(t)
	th, _ := db.OpenOrCreateThread(ChatScopeGlobal, "")
	if _, err := db.AppendMessage(th.ID, "user", json.RawMessage(`[{"type":"text","text":"hi"}]`), "hi"); err != nil {
		t.Fatalf("append: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM chat_threads WHERE id = ?`, th.ID); err != nil {
		t.Fatalf("delete thread: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(1) FROM chat_messages WHERE thread_id = ?`, th.ID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Errorf("messages remained after thread delete: %d", n)
	}
}

func TestAppendMessageUnknownThread(t *testing.T) {
	db := openTestDB(t)
	_, err := db.AppendMessage("nope", "user", json.RawMessage(`[{"type":"text","text":"x"}]`), "x")
	if err == nil {
		t.Fatal("append to unknown thread should error")
	}
}

func assertJSONEqual(t *testing.T, got, want json.RawMessage, label string) {
	t.Helper()
	var g, w any
	if err := json.Unmarshal(got, &g); err != nil {
		t.Fatalf("%s: stored content not valid JSON: %v", label, err)
	}
	if err := json.Unmarshal(want, &w); err != nil {
		t.Fatalf("%s: want not valid JSON: %v", label, err)
	}
	gb, _ := json.Marshal(g)
	wb, _ := json.Marshal(w)
	if string(gb) != string(wb) {
		t.Errorf("%s content mismatch:\n got=%s\nwant=%s", label, gb, wb)
	}
}
