package web

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/chat"
	"github.com/slaguardia/scout/internal/store"
)

// A minimal end_turn SSE turn for the stubbed Anthropic endpoint.
const chatEndTurnSSE = `event: message_start
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

`

func TestChatThreadsOpenOrCreate(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	get := func(q string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/chat/threads"+q, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	rec := get("?scope=global")
	if rec.Code != http.StatusOK {
		t.Fatalf("threads: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out struct {
		Thread   store.ChatThread    `json:"thread"`
		Messages []store.ChatMessage `json:"messages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Thread.ID == "" || out.Thread.Scope != "global" {
		t.Fatalf("unexpected thread: %+v", out.Thread)
	}
	// Idempotent: same (scope, scope_id) returns the same thread.
	rec2 := get("?scope=global")
	var out2 struct {
		Thread store.ChatThread `json:"thread"`
	}
	if err := json.Unmarshal(rec2.Body.Bytes(), &out2); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out2.Thread.ID != out.Thread.ID {
		t.Errorf("threads not idempotent: %s != %s", out2.Thread.ID, out.Thread.ID)
	}

	// company scope with no scope_id → 400.
	if rec := get("?scope=company"); rec.Code != http.StatusBadRequest {
		t.Errorf("company without scope_id: want 400, got %d", rec.Code)
	}
}

func TestChatMessageNeedsKey(t *testing.T) {
	s, _ := newTestServer(t) // no Chat engine wired
	h := s.Handler()
	th, _ := s.DB.OpenOrCreateThread(store.ChatScopeGlobal, "")
	req := httptest.NewRequest(http.MethodPost, "/api/chat/"+th.ID+"/message", bytes.NewBufferString(`{"text":"hi"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusPreconditionFailed {
		t.Errorf("want 412 without key, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// End-to-end over HTTP: kick a turn, then consume the SSE stream to its end.
func TestChatMessageAndStream(t *testing.T) {
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, chatEndTurnSSE)
	}))
	t.Cleanup(llm.Close)

	s, _ := newTestServer(t)
	s.Chat = chat.New(s.DB, &anthropic.Client{APIKey: "k", Endpoint: llm.URL, HTTP: llm.Client()})
	h := s.Handler()

	th, _ := s.DB.OpenOrCreateThread(store.ChatScopeGlobal, "")

	// Kick a turn.
	req := httptest.NewRequest(http.MethodPost, "/api/chat/"+th.ID+"/message", bytes.NewBufferString(`{"text":"hello"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("message: want 202, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Consume the stream to end (handleChatStream blocks until the turn finishes).
	sreq := httptest.NewRequest(http.MethodGet, "/api/chat/"+th.ID+"/stream", nil)
	srec := httptest.NewRecorder()
	h.ServeHTTP(srec, sreq)
	body := srec.Body.String()
	if !strings.Contains(body, "event: delta") || !strings.Contains(body, "Hi there.") {
		t.Errorf("stream missing the assistant delta:\n%s", body)
	}
	if !strings.Contains(body, "event: end") {
		t.Errorf("stream missing the end event:\n%s", body)
	}

	// The turn persisted: user kick + assistant reply.
	msgs, err := s.DB.ThreadMessages(th.ID)
	if err != nil {
		t.Fatalf("ThreadMessages: %v", err)
	}
	if len(msgs) != 2 || msgs[0].Role != "user" || msgs[1].Role != "assistant" {
		t.Fatalf("history = %d msgs %v, want user+assistant", len(msgs), roles(msgs))
	}
	if !strings.Contains(string(msgs[1].Content), "Hi there.") {
		t.Errorf("assistant turn not persisted: %s", msgs[1].Content)
	}
}

func roles(msgs []store.ChatMessage) []string {
	out := make([]string, len(msgs))
	for i, m := range msgs {
		out[i] = m.Role
	}
	return out
}
