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
