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
	// DefaultModel is what M3 uses for verdicts. Cheap, fast, good enough.
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
type Request struct {
	Model     string    `json:"model"`
	System    string    `json:"system,omitempty"`
	MaxTokens int       `json:"max_tokens"`
	Messages  []Message `json:"messages"`
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
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
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

	body, err := json.Marshal(req)
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
