// Package anthropic is a small, dependency-free Anthropic Messages API client.
//
// We don't pull the official SDK because our usage is one endpoint, two request
// shapes, and we want to keep the binary lean. If usage broadens, swap in the SDK.
package anthropic

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultEndpoint = "https://api.anthropic.com/v1/messages"
	apiVersion      = "2023-06-01"
	// DefaultModel is the default verdict model. Cheap, fast, good enough.
	DefaultModel = "claude-haiku-4-5"
)

// Client talks to the Anthropic Messages API.
type Client struct {
	APIKey   string
	Endpoint string
	HTTP     *http.Client
}

// New returns a client with key from ANTHROPIC_API_KEY if not given.
func New(apiKey string) *Client {
	if apiKey == "" {
		apiKey = os.Getenv("ANTHROPIC_API_KEY")
	}
	return &Client{
		APIKey:   apiKey,
		Endpoint: defaultEndpoint,
		// Generous backstop only; the real per-call deadline is enforced via
		// context in Send (so web_search calls get room and streaming chat isn't
		// capped at a few seconds).
		HTTP: &http.Client{Timeout: 10 * time.Minute},
	}
}

// Per-call deadlines (enforced via context in Send). Plain calls get a tight
// bound; hosted web_search requests run a server-side search loop that can sit
// well past a normal timeout before the first byte, so they get much more room.
const (
	defaultCallTimeout = 90 * time.Second
	toolCallTimeout    = 5 * time.Minute
)

// Message is a single turn. Content is a plain string for normal turns; pass
// a Response.RawContent() to replay a prior assistant turn verbatim (the
// pause_turn continuation — see Engine callers).
type Message struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

// Request mirrors the Anthropic /v1/messages request body.
//
// When Cached is true, System is sent as a single text block with
// `cache_control: {"type": "ephemeral"}` so identical system prompts
// across calls within ~5 minutes hit the prompt cache. This is how
// verdict runs amortize the ~3.5 KB taste+rubric block across hundreds
// of companies.
type Request struct {
	Model     string    `json:"-"`
	System    string    `json:"-"`
	MaxTokens int       `json:"-"`
	Messages  []Message `json:"-"`
	Cached    bool      `json:"-"`
	// Temperature, when set, is sent to the API; nil omits it (API default).
	// The distiller pins it to 0 so the same chunks yield a stable brief and
	// tuning changes trace to the prompt/corpus, not sampling noise.
	Temperature *float64 `json:"-"`
	// Tools, when set, are marshaled into the request's tools array. Two kinds
	// coexist: the hosted web_search SERVER tool (see WebSearchTool), which the
	// API runs itself, and CUSTOM client tools (see ToolDef), which the model
	// requests via a tool_use stop the caller executes and feeds back as a
	// tool_result (see the Stream tool loop in internal/chat). Each element must
	// be JSON-marshalable (a map or a typed struct with the right tags).
	Tools []any `json:"-"`
	// Thinking, when set, is sent as the request's `thinking` config. The chat
	// engine pins it to {type:"adaptive"} so Sonnet 4.6 decides its own thinking
	// depth and interleaves thinking between tool calls. nil omits the field.
	Thinking any `json:"-"`
	// Timeout overrides the per-call deadline for this request. Zero uses the
	// default (or the longer web_search default when Tools are set).
	Timeout time.Duration `json:"-"`
}

// ToolDef is a custom (client-executed) tool definition. The model emits a
// tool_use block naming the tool; the caller runs the Go func behind it and
// returns the result as a tool_result block (see internal/chat). Unlike the
// hosted web_search server tool, scout executes these — so the request carries
// only the schema, never a handler.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

// WebSearchTool is the hosted web_search server tool. The Researcher hands it
// to the API so the model can run news/site/podcast searches itself; Anthropic
// executes them server-side and returns the results inline. MaxUses caps the
// number of searches the model may run in one turn (0 omits the cap).
type WebSearchTool struct {
	Type    string `json:"type"`
	Name    string `json:"name"`
	MaxUses int    `json:"max_uses,omitempty"`
}

// webSearchToolType is the GA (non-beta) hosted web_search tool version. Pinned
// here so the one call site (the researcher) stays in sync with the client.
const webSearchToolType = "web_search_20260209"

// NewWebSearchTool builds the hosted web_search server tool with a use cap.
// maxUses <= 0 omits the cap (API default).
func NewWebSearchTool(maxUses int) WebSearchTool {
	t := WebSearchTool{Type: webSearchToolType, Name: "web_search"}
	if maxUses > 0 {
		t.MaxUses = maxUses
	}
	return t
}

// systemBlock is the structured form for cache_control on the system prompt.
type systemBlock struct {
	Type         string        `json:"type"`
	Text         string        `json:"text"`
	CacheControl *cacheControl `json:"cache_control,omitempty"`
}

type cacheControl struct {
	Type string `json:"type"`
}

// wireRequest is the JSON-on-the-wire shape. System can be either a plain
// string (cache disabled) or an array of structured blocks (cache enabled).
// Tools is omitted unless the caller asked for server tools (web_search).
type wireRequest struct {
	Model       string    `json:"model"`
	System      any       `json:"system,omitempty"`
	MaxTokens   int       `json:"max_tokens"`
	Messages    []Message `json:"messages"`
	Temperature *float64  `json:"temperature,omitempty"`
	Tools       []any     `json:"tools,omitempty"`
	Thinking    any       `json:"thinking,omitempty"`
	Stream      bool      `json:"stream,omitempty"`
}

// AdaptiveThinking is the `thinking` config the chat engine pins: Sonnet 4.6
// decides its own thinking depth and interleaves thinking between tool calls.
var AdaptiveThinking = map[string]string{"type": "adaptive"}

// buildWire maps a Request onto the on-the-wire shape, shared by Send and
// Stream. Defaults (model, max_tokens) are the caller's to apply first. When
// Cached is set, the system prompt is sent as a single ephemeral cache block so
// identical prompts across calls hit the prompt cache.
func buildWire(req Request, stream bool) wireRequest {
	wire := wireRequest{
		Model:       req.Model,
		MaxTokens:   req.MaxTokens,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		Tools:       req.Tools,
		Thinking:    req.Thinking,
		Stream:      stream,
	}
	if req.System != "" {
		if req.Cached {
			wire.System = []systemBlock{{
				Type:         "text",
				Text:         req.System,
				CacheControl: &cacheControl{Type: "ephemeral"},
			}}
		} else {
			wire.System = req.System
		}
	}
	return wire
}

// ContentBlock is one response content block. Type/Text cover the text blocks
// scout reads; Raw preserves the block verbatim (server_tool_use,
// web_search_tool_result, ...) so a pause_turn continuation can replay the
// assistant turn byte-exact.
type ContentBlock struct {
	Type string
	Text string
	Raw  json.RawMessage
}

// UnmarshalJSON keeps the verbatim block alongside the decoded type/text.
func (b *ContentBlock) UnmarshalJSON(data []byte) error {
	var v struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	b.Type, b.Text = v.Type, v.Text
	b.Raw = append(json.RawMessage(nil), data...)
	return nil
}

// Response is the shape we care about from the API.
type Response struct {
	ID         string         `json:"id"`
	Model      string         `json:"model"`
	Content    []ContentBlock `json:"content"`
	StopReason string         `json:"stop_reason"`
	Usage      struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
}

// Text returns the concatenated text content, skipping every non-text block.
// With the hosted web_search server tool, the response interleaves
// server_tool_use and web_search_tool_result blocks with the model's prose;
// only the text blocks carry the final answer, so the rest is dropped here.
func (r *Response) Text() string {
	var s string
	for _, c := range r.Content {
		if c.Type == "text" {
			s += c.Text
		}
	}
	return s
}

// RawContent returns the response's content array verbatim — for replaying
// the assistant turn in a continuation request after stop_reason "pause_turn"
// (the hosted web_search server tool pauses at its server-side iteration cap;
// re-sending the conversation with this appended resumes it).
func (r *Response) RawContent() json.RawMessage {
	parts := make([]json.RawMessage, len(r.Content))
	for i, c := range r.Content {
		parts[i] = c.Raw
	}
	out, _ := json.Marshal(parts)
	return out
}

// Send posts a single Messages API request.
func (c *Client) Send(ctx context.Context, req Request) (*Response, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("anthropic: no API key (set ANTHROPIC_API_KEY)")
	}
	if c.Endpoint == "" {
		c.Endpoint = defaultEndpoint
	}
	if req.MaxTokens == 0 {
		req.MaxTokens = 512
	}
	if req.Model == "" {
		req.Model = DefaultModel
	}

	body, err := json.Marshal(buildWire(req, false))
	if err != nil {
		return nil, err
	}

	// Retry transient failures (429 rate-limit, 5xx, 529 overloaded, network
	// blips) with backoff. Without this, raising the verdict/enrich worker
	// counts just converts rate-limit pressure into silently-failed companies.
	// We honor the server's retry-after when present, else exponential backoff.
	callTimeout := defaultCallTimeout
	if len(req.Tools) > 0 {
		callTimeout = toolCallTimeout // hosted web_search runs server-side — give it room
	}
	if req.Timeout > 0 {
		callTimeout = req.Timeout
	}

	var lastErr error
	var retryAfter time.Duration
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoffDelay(attempt, retryAfter)):
			}
			retryAfter = 0
		}

		// Each attempt gets its own deadline (derived from the caller's ctx, so a
		// cancelled/expired parent still wins). A per-call timeout surfaces as a
		// retryable error, NOT a hard parent-cancel.
		raw, status, hdr, err := func() ([]byte, int, http.Header, error) {
			attemptCtx, cancel := context.WithTimeout(ctx, callTimeout)
			defer cancel()
			httpReq, rErr := http.NewRequestWithContext(attemptCtx, http.MethodPost, c.Endpoint, bytes.NewReader(body))
			if rErr != nil {
				return nil, 0, nil, rErr
			}
			httpReq.Header.Set("Content-Type", "application/json")
			httpReq.Header.Set("x-api-key", c.APIKey)
			httpReq.Header.Set("anthropic-version", apiVersion)
			resp, dErr := c.HTTP.Do(httpReq)
			if dErr != nil {
				return nil, 0, nil, dErr
			}
			defer resp.Body.Close()
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
			return b, resp.StatusCode, resp.Header, nil
		}()
		if err != nil {
			if ctx.Err() != nil { // parent cancelled/expired — stop
				return nil, ctx.Err()
			}
			lastErr = fmt.Errorf("anthropic POST: %w", err) // transient (incl. per-call timeout) — retry
			continue
		}

		if status/100 == 2 {
			var out Response
			if err := json.Unmarshal(raw, &out); err != nil {
				return nil, fmt.Errorf("anthropic decode: %w (body=%s)", err, string(raw))
			}
			return &out, nil
		}

		lastErr = fmt.Errorf("anthropic HTTP %d: %s", status, string(raw))
		if !retryableStatus(status) {
			return nil, lastErr
		}
		retryAfter = parseRetryAfter(hdr.Get("retry-after"))
	}
	return nil, fmt.Errorf("anthropic: giving up after %d retries: %w", maxRetries, lastErr)
}

// maxRetries bounds transient-failure retries per Send call.
const maxRetries = 5

// retryableStatus reports whether an HTTP status is worth retrying: rate limit,
// overload, and the transient 5xx family.
func retryableStatus(code int) bool {
	switch code {
	case http.StatusTooManyRequests, // 429
		http.StatusInternalServerError, // 500
		http.StatusBadGateway,          // 502
		http.StatusServiceUnavailable,  // 503
		http.StatusGatewayTimeout,      // 504
		529:                            // overloaded (Anthropic-specific)
		return true
	}
	return false
}

// backoffDelay returns how long to wait before the given retry attempt. A
// server-provided retry-after wins; otherwise exponential (0.5s, 1s, 2s, …)
// capped at 8s with ±10% jitter so a worker pool doesn't retry in lockstep.
func backoffDelay(attempt int, retryAfter time.Duration) time.Duration {
	if retryAfter > 0 {
		return retryAfter
	}
	d := time.Duration(1<<uint(attempt-1)) * 500 * time.Millisecond
	if d > 8*time.Second {
		d = 8 * time.Second
	}
	jitter := time.Duration(rand.Int63n(int64(d/5)+1)) - d/10
	return d + jitter
}

// parseRetryAfter reads an integer-seconds retry-after header (the form the
// Messages API uses); returns 0 when absent or unparseable.
func parseRetryAfter(h string) time.Duration {
	if h == "" {
		return 0
	}
	if secs, err := strconv.Atoi(strings.TrimSpace(h)); err == nil && secs >= 0 {
		return time.Duration(secs) * time.Second
	}
	return 0
}
