package anthropic

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestSendMarshalsWebSearchTool asserts the hosted web_search server tool is
// marshaled onto the wire under "tools" with its version + max_uses, and that
// requests without tools omit the field entirely.
func TestSendMarshalsWebSearchTool(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("server: bad request JSON: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"id":"msg_1","model":"m","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}`)
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}

	// With the tool: tools array carries one entry with the version + cap.
	_, err := c.Send(context.Background(), Request{
		Model:    "m",
		Messages: []Message{{Role: "user", Content: "hi"}},
		Tools:    []any{NewWebSearchTool(6)},
	})
	if err != nil {
		t.Fatalf("Send with tool: %v", err)
	}
	tools, ok := gotBody["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("tools = %#v, want one entry", gotBody["tools"])
	}
	tool := tools[0].(map[string]any)
	if tool["type"] != webSearchToolType {
		t.Errorf("tool type = %v, want %s", tool["type"], webSearchToolType)
	}
	if tool["name"] != "web_search" {
		t.Errorf("tool name = %v, want web_search", tool["name"])
	}
	if tool["max_uses"] != float64(6) {
		t.Errorf("max_uses = %v, want 6", tool["max_uses"])
	}

	// Without the tool: the field is omitted, not sent as null/empty.
	gotBody = nil
	if _, err := c.Send(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}); err != nil {
		t.Fatalf("Send without tool: %v", err)
	}
	if _, present := gotBody["tools"]; present {
		t.Errorf("tools present on a no-tool request: %#v", gotBody["tools"])
	}

	// max_uses <= 0 omits the cap.
	if NewWebSearchTool(0).MaxUses != 0 {
		t.Errorf("NewWebSearchTool(0) set a cap")
	}
}

// TestTextSkipsNonTextBlocks asserts Text() returns only the prose, skipping
// the server_tool_use and web_search_tool_result blocks the hosted search tool
// interleaves into the content array.
func TestTextSkipsNonTextBlocks(t *testing.T) {
	mixed := `{
	  "id": "msg_2",
	  "model": "m",
	  "stop_reason": "end_turn",
	  "content": [
	    {"type": "text", "text": "Here is what I found. "},
	    {"type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": {"query": "acme funding"}},
	    {"type": "web_search_tool_result", "tool_use_id": "srvtoolu_1", "content": [{"type": "web_search_result", "title": "Acme raises", "url": "https://x"}]},
	    {"type": "text", "text": "Acme raised a Series B."}
	  ]
	}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, mixed)
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}
	resp, err := c.Send(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if got, want := resp.Text(), "Here is what I found. Acme raised a Series B."; got != want {
		t.Errorf("Text() = %q, want %q", got, want)
	}
}

// TestSendRetriesTransient asserts Send retries 429/5xx responses and returns
// the eventual success, rather than failing the first transient error.
func TestSendRetriesTransient(t *testing.T) {
	var n int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		switch n {
		case 1:
			w.Header().Set("retry-after", "0") // exercise the header path; 0s → exponential
			http.Error(w, `{"type":"error","error":{"type":"rate_limit_error"}}`, http.StatusTooManyRequests)
		case 2:
			http.Error(w, `{"type":"error"}`, 529) // overloaded
		default:
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"id":"m","model":"m","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}`)
		}
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}
	resp, err := c.Send(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if resp.Text() != "ok" {
		t.Errorf("Text() = %q, want ok", resp.Text())
	}
	if n != 3 {
		t.Errorf("server saw %d requests, want 3 (two retries)", n)
	}
}

// TestSendNoRetryOn400 asserts a non-retryable status fails immediately without
// burning the retry budget.
func TestSendNoRetryOn400(t *testing.T) {
	var n int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		http.Error(w, `{"type":"error","error":{"type":"invalid_request_error"}}`, http.StatusBadRequest)
	}))
	defer srv.Close()

	c := &Client{APIKey: "k", Endpoint: srv.URL, HTTP: srv.Client()}
	if _, err := c.Send(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}); err == nil {
		t.Fatal("Send: want error on 400")
	}
	if n != 1 {
		t.Errorf("server saw %d requests, want 1 (no retry on 400)", n)
	}
}
