package outreach

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
)

// TestCallJSONPauseTurnContinuation: the hosted web_search server tool can
// pause at its server-side iteration cap (stop_reason "pause_turn"); the
// engine must replay the assistant content verbatim and re-send until the
// turn completes, concatenating the text.
func TestCallJSONPauseTurnContinuation(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, _ := io.ReadAll(r.Body)
		if calls == 1 {
			fmt.Fprint(w, `{"content":[
				{"type":"server_tool_use","id":"st1","name":"web_search","input":{"query":"acme news"}},
				{"type":"web_search_tool_result","tool_use_id":"st1","content":[]}
			],"stop_reason":"pause_turn"}`)
			return
		}
		// The continuation must replay the assistant turn's raw blocks.
		s := string(body)
		if !strings.Contains(s, `"role":"assistant"`) || !strings.Contains(s, `"server_tool_use"`) || !strings.Contains(s, `"tool_use_id":"st1"`) {
			t.Errorf("continuation request missing replayed assistant blocks: %s", s)
		}
		// And must NOT inject an extra user nudge between the turns.
		if strings.Count(s, `"role":"user"`) != 1 {
			t.Errorf("continuation request has extra user turns: %s", s)
		}
		fmt.Fprint(w, `{"content":[{"type":"text","text":"{\"ok\":true}"}],"stop_reason":"end_turn"}`)
	}))
	defer srv.Close()

	c := anthropic.New("test-key")
	c.Endpoint = srv.URL
	e := &Engine{Client: c}

	raw, err := e.callJSON(context.Background(), "sys", "research acme", 1000, []any{anthropic.NewWebSearchTool(6)})
	if err != nil {
		t.Fatalf("callJSON: %v", err)
	}
	if calls != 2 {
		t.Fatalf("calls = %d, want 2", calls)
	}
	if !strings.Contains(raw, `"ok":true`) {
		t.Fatalf("raw = %q", raw)
	}
}

// TestCallJSONPauseTurnGivesUp: a stream of pause_turns is bounded — each
// send gives up after maxContinuations resumes, so callJSON terminates with
// an error (its JSON retry doubles the sends) instead of looping forever.
func TestCallJSONPauseTurnGivesUp(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		fmt.Fprint(w, `{"content":[{"type":"text","text":"still searching"}],"stop_reason":"pause_turn"}`)
	}))
	defer srv.Close()

	c := anthropic.New("test-key")
	c.Endpoint = srv.URL
	e := &Engine{Client: c}

	_, err := e.callJSON(context.Background(), "sys", "u", 1000, []any{anthropic.NewWebSearchTool(6)})
	if err == nil {
		t.Fatal("callJSON: want error when the turn never completes with JSON")
	}
	// One send per JSON attempt = 1 + maxContinuations requests; callJSON
	// retries the JSON parse once, so exactly two bounded send loops.
	if want := 2 * (maxContinuations + 1); calls != want {
		t.Fatalf("calls = %d, want %d", calls, want)
	}
}
