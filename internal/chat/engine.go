// Package chat is scout's chat engine: a Sonnet 4.6 tool-using agent behind two
// surfaces (a global "I applied to <link>" tracking chat and a per-entity
// research chat). Both share this one engine — the only new machinery is the
// client-side tool loop. Everything the tools do wraps code that already works
// (internal/capture, internal/store). Chat is scout-local and disposable; it is
// never written to the brain.
//
// The loop: build a streamed request (system + thread history + tools, model
// claude-sonnet-4-6, adaptive thinking) → stream, forwarding text deltas to the
// UI → on a tool_use stop, execute each custom tool against the store, append
// the tool_use turn and the matching tool_result turn, and continue with a
// fresh streamed request → until end_turn. The hosted web_search server tool's
// pause_turn is resumed inside one assistant turn. Iterations are capped so a
// runaway model can't loop forever.
package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/capture"
	"github.com/slaguardia/scout/internal/store"
)

// Model is the chat model — Sonnet 4.6, per the spec. Distinct from the verdict
// model (Haiku): chat reasons over tools and prose, not a fixed rubric.
const Model = "claude-sonnet-4-6"

const (
	defaultMaxIters         = 8    // tool round-trips before we stop (runaway guard)
	defaultMaxContinuations = 6    // pause_turn resumes of the hosted web_search loop
	defaultMaxTokens        = 8192 // per assistant turn
)

// Engine runs chat turns against the store. Construct with New; it builds the
// tool registry (including the capture pass) once.
type Engine struct {
	DB       *store.DB
	Client   *anthropic.Client
	Capturer *capture.Capturer
	Model    string
	MaxIters int
	Log      func(string) // optional progress/debug sink

	tools    map[string]toolImpl // custom tools by name
	toolWire []any               // the marshaled tools array (custom + web_search)
}

// New builds an engine with the eight-tool registry wired to db + client. The
// client must carry an API key for the chat (and the LLM capture path) to work.
func New(db *store.DB, client *anthropic.Client) *Engine {
	e := &Engine{
		DB:       db,
		Client:   client,
		Capturer: &capture.Capturer{DB: db, Client: client},
		Model:    Model,
		MaxIters: defaultMaxIters,
	}
	e.registerTools()
	return e
}

func (e *Engine) model() string {
	if e.Model != "" {
		return e.Model
	}
	return Model
}

func (e *Engine) maxIters() int {
	if e.MaxIters > 0 {
		return e.MaxIters
	}
	return defaultMaxIters
}

func (e *Engine) logf(format string, args ...any) {
	if e.Log != nil {
		e.Log(fmt.Sprintf(format, args...))
	}
}

// Run executes one assistant turn over the thread's stored history plus the
// per-request system prompt (built by the caller — see SystemPrompt), streaming
// text deltas to onText (nil-safe) and persisting every assistant turn and
// tool_result turn it produces. The kicking user message must already be
// appended to the thread. Returns when the model reaches end_turn (or another
// terminal stop), or when the iteration cap is hit.
func (e *Engine) Run(ctx context.Context, threadID, system string, onText func(string)) error {
	stored, err := e.DB.ThreadMessages(threadID)
	if err != nil {
		return fmt.Errorf("load thread: %w", err)
	}
	msgs := make([]anthropic.Message, 0, len(stored)+4)
	for _, m := range stored {
		msgs = append(msgs, anthropic.Message{Role: m.Role, Content: m.Content})
	}

	for iter := 0; iter < e.maxIters(); iter++ {
		content, stop, err := e.streamTurn(ctx, system, msgs, onText)
		if err != nil {
			return err
		}
		// Persist + append the assistant turn (merged across any pause_turn
		// resumes) so it replays verbatim on the next turn.
		if _, err := e.DB.AppendMessage(threadID, "assistant", content, ""); err != nil {
			return fmt.Errorf("persist assistant turn: %w", err)
		}
		msgs = append(msgs, anthropic.Message{Role: "assistant", Content: content})

		if stop != "tool_use" {
			return nil // end_turn / max_tokens / stop_sequence / refusal — done
		}

		results, err := e.runTools(ctx, content)
		if err != nil {
			return err
		}
		if len(results) == 0 {
			// tool_use stop with no custom tool calls would deadlock the loop
			// (a re-send with no tool_result 400s). Bail cleanly.
			e.logf("chat: tool_use stop with no executable tools — ending turn")
			return nil
		}
		userContent, err := json.Marshal(results)
		if err != nil {
			return err
		}
		if _, err := e.DB.AppendMessage(threadID, "user", userContent, ""); err != nil {
			return fmt.Errorf("persist tool results: %w", err)
		}
		msgs = append(msgs, anthropic.Message{Role: "user", Content: json.RawMessage(userContent)})
	}
	e.logf("chat: hit iteration cap (%d) — ending turn", e.maxIters())
	return nil
}

// streamTurn streams one complete assistant turn, resuming the hosted
// web_search server tool's pause_turn internally so the result is a single
// merged content array (avoids consecutive assistant turns on later replays).
// Returns the merged content-block array and the final stop_reason.
func (e *Engine) streamTurn(ctx context.Context, system string, msgs []anthropic.Message, onText func(string)) (json.RawMessage, string, error) {
	var blocks []json.RawMessage
	turn := append([]anthropic.Message(nil), msgs...)

	for cont := 0; ; cont++ {
		resp, err := e.Client.Stream(ctx, anthropic.Request{
			Model:     e.model(),
			System:    system,
			Cached:    true,
			MaxTokens: defaultMaxTokens,
			Messages:  turn,
			Tools:     e.toolWire,
			Thinking:  anthropic.AdaptiveThinking,
		}, onText)
		if err != nil {
			return nil, "", err
		}
		for _, b := range resp.Content {
			blocks = append(blocks, b.Raw)
		}
		if resp.StopReason != "pause_turn" {
			merged, err := json.Marshal(blocks)
			return merged, resp.StopReason, err
		}
		if cont >= defaultMaxContinuations {
			e.logf("chat: web_search still paused after %d continuations — using partial output", cont)
			merged, err := json.Marshal(blocks)
			return merged, "end_turn", err // treat as done so the loop terminates
		}
		// Resume: replay the partial assistant turn and re-send (no user message).
		turn = append(turn, anthropic.Message{Role: "assistant", Content: resp.RawContent()})
	}
}

// runTools executes every custom tool_use block in the assistant content and
// returns the matching tool_result blocks (one per tool_use, as the API
// requires). Server-tool blocks (server_tool_use / web_search_tool_result) are
// the API's to resolve and are skipped here.
func (e *Engine) runTools(ctx context.Context, content json.RawMessage) ([]map[string]any, error) {
	var blocks []struct {
		Type  string          `json:"type"`
		ID    string          `json:"id"`
		Name  string          `json:"name"`
		Input json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(content, &blocks); err != nil {
		return nil, fmt.Errorf("parse assistant content: %w", err)
	}
	var results []map[string]any
	for _, b := range blocks {
		if b.Type != "tool_use" {
			continue
		}
		impl, ok := e.tools[b.Name]
		if !ok {
			results = append(results, toolResult(b.ID, fmt.Sprintf("unknown tool %q", b.Name), true))
			continue
		}
		e.logf("chat: tool %s", b.Name)
		out, err := impl(ctx, b.Input)
		if err != nil {
			results = append(results, toolResult(b.ID, "error: "+err.Error(), true))
			continue
		}
		results = append(results, toolResult(b.ID, out, false))
	}
	return results, nil
}

// toolResult builds a tool_result content block for the next user turn.
func toolResult(toolUseID, content string, isErr bool) map[string]any {
	b := map[string]any{
		"type":        "tool_result",
		"tool_use_id": toolUseID,
		"content":     content,
	}
	if isErr {
		b["is_error"] = true
	}
	return b
}
