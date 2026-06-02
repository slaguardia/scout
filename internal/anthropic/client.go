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

// Message is a single turn.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
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
type wireRequest struct {
	Model       string    `json:"model"`
	System      any       `json:"system,omitempty"`
	MaxTokens   int       `json:"max_tokens"`
	Messages    []Message `json:"messages"`
	Temperature *float64  `json:"temperature,omitempty"`
}

// Response is the shape we care about from the API.
type Response struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Usage      struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
}

// Text returns the concatenated text content.
func (r *Response) Text() string {
	var s string
	for _, c := range r.Content {
		if c.Type == "text" {
			s += c.Text
		}
	}
	return s
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
