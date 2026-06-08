package anthropic

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// Stream runs a streamed /v1/messages request and returns the fully-assembled
// Response, calling onText with each text delta as it arrives (nil skips). The
// returned Response mirrors a non-streamed one: Content carries every block
// with a byte-faithful Raw, so a tool_use / pause_turn continuation can replay
// the assistant turn verbatim (the reason the chat tool loop streams). Crucially
// the streamed blocks are RECONSTRUCTED, not handed over whole — a tool_use
// block's input arrives as input_json_delta fragments and a thinking block as
// thinking_delta + signature_delta, so we accumulate each block and re-marshal
// it at content_block_stop. StopReason / Usage come from message_delta.
//
// Retries cover only establishing the stream (a transient non-2xx before the
// first byte); once bytes flow, a mid-stream failure returns an error and the
// caller's turn fails cleanly (the engine caps iterations).
func (c *Client) Stream(ctx context.Context, req Request, onText func(string)) (*Response, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("anthropic: no API key (set ANTHROPIC_API_KEY)")
	}
	if c.Endpoint == "" {
		c.Endpoint = defaultEndpoint
	}
	if req.MaxTokens == 0 {
		req.MaxTokens = 1024
	}
	if req.Model == "" {
		req.Model = DefaultModel
	}

	body, err := json.Marshal(buildWire(req, true))
	if err != nil {
		return nil, err
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

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-api-key", c.APIKey)
		httpReq.Header.Set("anthropic-version", apiVersion)
		httpReq.Header.Set("Accept", "text/event-stream")

		resp, err := c.HTTP.Do(httpReq)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			lastErr = fmt.Errorf("anthropic POST: %w", err) // transient network — retry
			continue
		}

		if resp.StatusCode/100 != 2 {
			raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
			resp.Body.Close()
			lastErr = fmt.Errorf("anthropic HTTP %d: %s", resp.StatusCode, string(raw))
			if !retryableStatus(resp.StatusCode) {
				return nil, lastErr
			}
			retryAfter = parseRetryAfter(resp.Header.Get("retry-after"))
			continue
		}

		// 2xx — stream the body. No retry past this point (partial output).
		out, err := parseSSE(resp.Body, onText)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		return out, nil
	}
	return nil, fmt.Errorf("anthropic: giving up after %d retries: %w", maxRetries, lastErr)
}

// sseEvent is the envelope of one server-sent event's data payload. The same
// `delta` key carries both content_block_delta deltas (text/json/thinking/
// signature) and the message_delta delta (stop_reason) — sseDelta covers both.
type sseEvent struct {
	Type         string          `json:"type"`
	Index        int             `json:"index"`
	ContentBlock json.RawMessage `json:"content_block"`
	Delta        json.RawMessage `json:"delta"`
	Message      json.RawMessage `json:"message"`
	Usage        json.RawMessage `json:"usage"`
	Error        json.RawMessage `json:"error"`
}

type sseDelta struct {
	Type        string `json:"type"`         // content_block_delta: text_delta | input_json_delta | thinking_delta | signature_delta
	Text        string `json:"text"`         // text_delta
	PartialJSON string `json:"partial_json"` // input_json_delta (tool_use / server_tool_use input)
	Thinking    string `json:"thinking"`     // thinking_delta
	Signature   string `json:"signature"`    // signature_delta
	StopReason  string `json:"stop_reason"`  // message_delta
}

// blockAcc accumulates one content block as its deltas arrive. The base map is
// the content_block from content_block_start (carries type/id/name and any
// fully-formed fields, e.g. a web_search_tool_result that streams no deltas);
// the typed buffers overlay the streamed fields at finalize().
type blockAcc struct {
	base      map[string]any
	typ       string
	text      strings.Builder
	thinking  strings.Builder
	sig       string
	inputJSON strings.Builder
	hasInput  bool
}

// finalize overlays the accumulated deltas onto the base block and returns the
// reconstructed ContentBlock. Re-marshaling a map sorts keys, which is fine:
// the API validates a thinking block's signature against its text, not the JSON
// byte order, and tool_result replay is order-independent.
func (b *blockAcc) finalize() (ContentBlock, error) {
	m := b.base
	if m == nil {
		m = map[string]any{}
	}
	if b.text.Len() > 0 {
		m["text"] = b.text.String()
	}
	if b.thinking.Len() > 0 {
		m["thinking"] = b.thinking.String()
	}
	if b.sig != "" {
		m["signature"] = b.sig
	}
	if b.hasInput {
		// The accumulated partial_json is the block's input object. An empty
		// stream means no arguments — leave the base's {} input untouched.
		js := b.inputJSON.String()
		if strings.TrimSpace(js) != "" {
			var v any
			if err := json.Unmarshal([]byte(js), &v); err != nil {
				return ContentBlock{}, fmt.Errorf("tool_use input JSON: %w (raw=%q)", err, js)
			}
			m["input"] = v
		}
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return ContentBlock{}, err
	}
	cb := ContentBlock{Type: b.typ, Raw: raw}
	if b.typ == "text" {
		cb.Text = b.text.String()
	}
	return cb, nil
}

// parseSSE reads the event stream, reconstructs the content blocks, and returns
// the assembled Response. onText (nil-safe) is invoked with each text delta for
// live forwarding to the UI.
func parseSSE(r io.Reader, onText func(string)) (*Response, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20) // a single delta line can exceed the 64KB default

	out := &Response{}
	blocks := map[int]*blockAcc{}
	var dataBuf strings.Builder
	sawStop := false

	flush := func() error {
		if dataBuf.Len() == 0 {
			return nil
		}
		data := dataBuf.String()
		dataBuf.Reset()
		if data == "[DONE]" { // not part of the Anthropic protocol, but harmless to ignore
			return nil
		}
		var ev sseEvent
		if err := json.Unmarshal([]byte(data), &ev); err != nil {
			return fmt.Errorf("anthropic stream: bad event JSON: %w (raw=%q)", err, data)
		}
		switch ev.Type {
		case "message_start":
			var m struct {
				Message struct {
					ID    string `json:"id"`
					Model string `json:"model"`
					Usage struct {
						InputTokens              int `json:"input_tokens"`
						CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
						CacheReadInputTokens     int `json:"cache_read_input_tokens"`
					} `json:"usage"`
				} `json:"message"`
			}
			if err := json.Unmarshal([]byte(data), &m); err == nil {
				out.ID = m.Message.ID
				out.Model = m.Message.Model
				out.Usage.InputTokens = m.Message.Usage.InputTokens
				out.Usage.CacheCreationInputTokens = m.Message.Usage.CacheCreationInputTokens
				out.Usage.CacheReadInputTokens = m.Message.Usage.CacheReadInputTokens
			}
		case "content_block_start":
			acc := &blockAcc{}
			if len(ev.ContentBlock) > 0 {
				_ = json.Unmarshal(ev.ContentBlock, &acc.base)
				if t, ok := acc.base["type"].(string); ok {
					acc.typ = t
				}
			}
			if acc.typ == "tool_use" || acc.typ == "server_tool_use" {
				acc.hasInput = true
			}
			blocks[ev.Index] = acc
		case "content_block_delta":
			acc := blocks[ev.Index]
			if acc == nil {
				return fmt.Errorf("anthropic stream: delta for unknown block %d", ev.Index)
			}
			var d sseDelta
			if err := json.Unmarshal(ev.Delta, &d); err != nil {
				return fmt.Errorf("anthropic stream: bad delta: %w", err)
			}
			switch d.Type {
			case "text_delta":
				acc.text.WriteString(d.Text)
				if onText != nil && d.Text != "" {
					onText(d.Text)
				}
			case "input_json_delta":
				acc.inputJSON.WriteString(d.PartialJSON)
			case "thinking_delta":
				acc.thinking.WriteString(d.Thinking)
			case "signature_delta":
				acc.sig += d.Signature
			}
		case "content_block_stop":
			// finalized below, once all deltas are in
		case "message_delta":
			var d sseDelta
			if len(ev.Delta) > 0 {
				_ = json.Unmarshal(ev.Delta, &d)
			}
			if d.StopReason != "" {
				out.StopReason = d.StopReason
			}
			if len(ev.Usage) > 0 {
				var u struct {
					OutputTokens int `json:"output_tokens"`
				}
				if err := json.Unmarshal(ev.Usage, &u); err == nil && u.OutputTokens > 0 {
					out.Usage.OutputTokens = u.OutputTokens
				}
			}
		case "message_stop":
			sawStop = true
		case "error":
			return fmt.Errorf("anthropic stream error: %s", string(ev.Error))
		case "ping":
			// keep-alive — ignore
		}
		return nil
	}

	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == "": // event boundary
			if err := flush(); err != nil {
				return nil, err
			}
		case strings.HasPrefix(line, "data:"):
			// Anthropic sends one data line per event; concatenate defensively
			// in case a payload is ever split across multiple data: lines.
			dataBuf.WriteString(strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		default:
			// `event:` lines and comments — the data payload carries its own
			// type, so we don't need them.
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("anthropic stream read: %w", err)
	}
	if err := flush(); err != nil { // a trailing event with no closing blank line
		return nil, err
	}

	// Assemble content blocks in index order.
	idxs := make([]int, 0, len(blocks))
	for i := range blocks {
		idxs = append(idxs, i)
	}
	sort.Ints(idxs)
	for _, i := range idxs {
		cb, err := blocks[i].finalize()
		if err != nil {
			return nil, err
		}
		out.Content = append(out.Content, cb)
	}

	if out.StopReason == "" && !sawStop {
		return nil, fmt.Errorf("anthropic stream: ended without stop_reason")
	}
	return out, nil
}
