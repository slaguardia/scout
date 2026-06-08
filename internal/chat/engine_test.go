package chat

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/store"
)

// Turn 1: the model calls the search tool. Turn 2 (after the tool_result is fed
// back): it answers and ends.
const searchToolStream = `event: message_start
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
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"Ramp\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":20}}

event: message_stop
data: {"type":"message_stop"}

`

const endTurnStream = `event: message_start
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

`

func TestEngineToolRoundTrip(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// A company the search tool will find.
	if _, _, err := ingest.EnsureCompany(db, ingest.CapturedCompany{Name: "Ramp", Domain: "ramp.com"}); err != nil {
		t.Fatalf("seed company: %v", err)
	}

	// Stubbed Anthropic: turn 1 → search tool_use; turn 2 → end_turn. Record the
	// second request body so we can assert the tool ran and its result fed back.
	var mu sync.Mutex
	var n int
	var secondBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		n++
		call := n
		raw, _ := io.ReadAll(r.Body)
		if call == 2 {
			secondBody = raw
		}
		mu.Unlock()
		w.Header().Set("Content-Type", "text/event-stream")
		if call == 1 {
			io.WriteString(w, searchToolStream)
		} else {
			io.WriteString(w, endTurnStream)
		}
	}))
	defer srv.Close()

	client := &anthropic.Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}
	eng := New(db, client)

	th, err := db.OpenOrCreateThread(store.ChatScopeGlobal, "")
	if err != nil {
		t.Fatalf("open thread: %v", err)
	}
	if _, err := db.AppendMessage(th.ID, "user", json.RawMessage(`[{"type":"text","text":"did I already add Ramp?"}]`), "did I already add Ramp?"); err != nil {
		t.Fatalf("append user: %v", err)
	}

	var streamed strings.Builder
	system := SystemPrompt(store.ChatScopeGlobal, "", time.Date(2026, 6, 8, 0, 0, 0, 0, time.UTC))
	if err := eng.Run(context.Background(), th.ID, system, func(s string) { streamed.WriteString(s) }); err != nil {
		t.Fatalf("Run: %v", err)
	}

	// The loop made exactly two model calls and terminated.
	mu.Lock()
	gotN := n
	body := secondBody
	mu.Unlock()
	if gotN != 2 {
		t.Errorf("model calls = %d, want 2 (one tool round-trip)", gotN)
	}

	// Streamed text from both turns reached the callback.
	if !strings.Contains(streamed.String(), "Let me check.") || !strings.Contains(streamed.String(), "Yes, Ramp is already tracked.") {
		t.Errorf("streamed text = %q, want both turns", streamed.String())
	}

	// The second request carried the tool_result with the search hit (proves the
	// search tool actually ran against the store).
	if !strings.Contains(string(body), "tool_result") || !strings.Contains(string(body), "Ramp") {
		t.Errorf("second request missing the fed-back tool_result for Ramp:\n%s", body)
	}

	// Persisted history: user kick, assistant(text+tool_use), user(tool_result),
	// assistant(final text) — four turns.
	msgs, err := db.ThreadMessages(th.ID)
	if err != nil {
		t.Fatalf("ThreadMessages: %v", err)
	}
	if len(msgs) != 4 {
		t.Fatalf("history has %d messages, want 4: %+v", len(msgs), msgs)
	}
	wantRoles := []string{"user", "assistant", "user", "assistant"}
	for i, want := range wantRoles {
		if msgs[i].Role != want {
			t.Errorf("message[%d].role = %q, want %q", i, msgs[i].Role, want)
		}
	}
	// The assistant tool_use turn round-trips with its block intact.
	if !strings.Contains(string(msgs[1].Content), "tool_use") || !strings.Contains(string(msgs[1].Content), "search") {
		t.Errorf("assistant turn missing tool_use block: %s", msgs[1].Content)
	}
	// The final assistant turn carries the answer.
	if !strings.Contains(string(msgs[3].Content), "Yes, Ramp is already tracked.") {
		t.Errorf("final assistant turn = %s", msgs[3].Content)
	}
}

// A bare end_turn (no tools) stops after one call.
func TestEngineNoTools(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	var n int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, endTurnStream)
	}))
	defer srv.Close()

	eng := New(db, &anthropic.Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()})
	th, _ := db.OpenOrCreateThread(store.ChatScopeGlobal, "")
	db.AppendMessage(th.ID, "user", json.RawMessage(`[{"type":"text","text":"hi"}]`), "hi")

	if err := eng.Run(context.Background(), th.ID, "sys", nil); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if n != 1 {
		t.Errorf("model calls = %d, want 1", n)
	}
	msgs, _ := db.ThreadMessages(th.ID)
	if len(msgs) != 2 { // user + assistant
		t.Errorf("history has %d messages, want 2", len(msgs))
	}
}
