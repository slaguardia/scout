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
	"net/http"
	"os"
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
		HTTP:     &http.Client{Timeout: 45 * time.Second},
	}
}

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
	// Tools, when set, are marshaled into the request's tools array. The only
	// use today is the hosted web_search SERVER tool (see WebSearchTool): the
	// API runs the searches itself, so there is no client-side tool loop — the
	// final assistant prose arrives interleaved with server_tool_use and
	// web_search_tool_result blocks, which Response.Text skips. Each element
	// must be JSON-marshalable (a map or a typed struct with the right tags).
	Tools []any `json:"-"`
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

	wire := wireRequest{
		Model:       req.Model,
		MaxTokens:   req.MaxTokens,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		Tools:       req.Tools,
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

	body, err := json.Marshal(wire)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.APIKey)
	httpReq.Header.Set("anthropic-version", apiVersion)

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("anthropic POST: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("anthropic HTTP %d: %s", resp.StatusCode, string(raw))
	}
	var out Response
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("anthropic decode: %w (body=%s)", err, string(raw))
	}
	return &out, nil
}
