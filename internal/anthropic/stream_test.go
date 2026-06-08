package anthropic

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// sseServer returns a test server that replies to /v1/messages with the given
// raw SSE body (and records the request body for assertions).
func sseServer(t *testing.T, body string, gotReq *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if gotReq != nil {
			raw, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(raw, gotReq)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, body)
	}))
}

// A turn with thinking + text + a tool_use, the shape the chat loop must handle:
// text deltas accumulate, the tool_use stop is parsed with its block, and the
// thinking block's signature is preserved for byte-faithful replay.
const toolUseStream = `event: message_start
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

`

func TestStreamToolUseRoundTrip(t *testing.T) {
	var gotReq map[string]any
	srv := sseServer(t, toolUseStream, &gotReq)
	defer srv.Close()

	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}

	var streamed strings.Builder
	resp, err := c.Stream(context.Background(), Request{
		Model:    "claude-sonnet-4-6",
		Messages: []Message{{Role: "user", Content: "did I add Ramp?"}},
		Thinking: AdaptiveThinking,
		Tools:    []any{ToolDef{Name: "search", Description: "search", InputSchema: map[string]any{"type": "object"}}},
	}, func(s string) { streamed.WriteString(s) })
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}

	// (a) text deltas accumulate — both via Response.Text() and the onText callback.
	if got, want := resp.Text(), "Let me check."; got != want {
		t.Errorf("Text() = %q, want %q", got, want)
	}
	if got, want := streamed.String(), "Let me check."; got != want {
		t.Errorf("onText accumulated %q, want %q", got, want)
	}

	// (b) the tool_use stop is parsed with the tool_use block intact.
	if resp.StopReason != "tool_use" {
		t.Errorf("StopReason = %q, want tool_use", resp.StopReason)
	}
	if len(resp.Content) != 3 {
		t.Fatalf("Content has %d blocks, want 3", len(resp.Content))
	}
	tu := resp.Content[2]
	if tu.Type != "tool_use" {
		t.Fatalf("block[2].Type = %q, want tool_use", tu.Type)
	}
	var tub struct {
		Type  string         `json:"type"`
		ID    string         `json:"id"`
		Name  string         `json:"name"`
		Input map[string]any `json:"input"`
	}
	if err := json.Unmarshal(tu.Raw, &tub); err != nil {
		t.Fatalf("tool_use block Raw not valid JSON: %v", err)
	}
	if tub.ID != "toolu_1" || tub.Name != "search" {
		t.Errorf("tool_use id/name = %q/%q, want toolu_1/search", tub.ID, tub.Name)
	}
	if tub.Input["query"] != "Ramp" {
		t.Errorf("tool_use input.query = %v, want Ramp (accumulated from input_json_delta)", tub.Input["query"])
	}

	// The thinking block preserves its accumulated text + signature so the
	// assistant turn replays without a signature-mismatch 400.
	var think struct {
		Type      string `json:"type"`
		Thinking  string `json:"thinking"`
		Signature string `json:"signature"`
	}
	if err := json.Unmarshal(resp.Content[0].Raw, &think); err != nil {
		t.Fatalf("thinking block Raw not valid JSON: %v", err)
	}
	if think.Type != "thinking" || think.Thinking != "Did I add Ramp?" || think.Signature != "sig-abc" {
		t.Errorf("thinking block = %+v, want {thinking, 'Did I add Ramp?', 'sig-abc'}", think)
	}

	// RawContent() (used to replay the assistant turn) yields all three blocks.
	var replay []json.RawMessage
	if err := json.Unmarshal(resp.RawContent(), &replay); err != nil {
		t.Fatalf("RawContent not a JSON array: %v", err)
	}
	if len(replay) != 3 {
		t.Errorf("RawContent has %d blocks, want 3", len(replay))
	}

	// Usage is captured from message_start (input) and message_delta (output).
	if resp.Usage.InputTokens != 50 || resp.Usage.OutputTokens != 40 {
		t.Errorf("Usage = in:%d out:%d, want in:50 out:40", resp.Usage.InputTokens, resp.Usage.OutputTokens)
	}

	// The request marshaled stream:true, the adaptive thinking config, and the tool.
	if gotReq["stream"] != true {
		t.Errorf("request stream = %v, want true", gotReq["stream"])
	}
	if th, _ := gotReq["thinking"].(map[string]any); th["type"] != "adaptive" {
		t.Errorf("request thinking = %v, want {type:adaptive}", gotReq["thinking"])
	}
}

// A plain text turn ending in end_turn — the common no-tool case.
const textStream = `event: message_start
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

`

func TestStreamPlainText(t *testing.T) {
	srv := sseServer(t, textStream, nil)
	defer srv.Close()
	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}

	resp, err := c.Stream(context.Background(), Request{Model: "claude-sonnet-4-6", Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	if resp.Text() != "Yes, Ramp is tracked." {
		t.Errorf("Text() = %q", resp.Text())
	}
	if resp.StopReason != "end_turn" {
		t.Errorf("StopReason = %q, want end_turn", resp.StopReason)
	}
}

// An error event mid-stream surfaces as an error.
func TestStreamErrorEvent(t *testing.T) {
	const body = `event: message_start
data: {"type":"message_start","message":{"id":"m","model":"m","usage":{"input_tokens":1,"output_tokens":1}}}

event: error
data: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}

`
	srv := sseServer(t, body, nil)
	defer srv.Close()
	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}

	if _, err := c.Stream(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err == nil {
		t.Fatal("Stream: want error on stream error event")
	}
}

// A non-2xx before any bytes retries per the transient-status policy, then
// streams the eventual success — mirroring Send's retry behavior.
func TestStreamRetriesTransient(t *testing.T) {
	var n int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		if n == 1 {
			w.Header().Set("retry-after", "0")
			http.Error(w, `{"type":"error"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, textStream)
	}))
	defer srv.Close()
	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}

	resp, err := c.Stream(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	if resp.StopReason != "end_turn" {
		t.Errorf("StopReason = %q, want end_turn", resp.StopReason)
	}
	if n != 2 {
		t.Errorf("server saw %d requests, want 2 (one retry)", n)
	}
}
