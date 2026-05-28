// Package brainbot is a thin client for the brain over MCP JSON-RPC.
//
// The brain exposes a streamable-HTTP MCP endpoint at {base}/mcp. This
// client speaks that wire protocol: an initialize handshake that yields
// an mcp-session-id, followed by tools/call invocations for the named
// tools (search_memory_facts, add_memory, etc.).
//
// The authoritative reference for the brain's consumer surface lives at
// docs/consumer-integration.md in the brainbot repo. The Python reference
// client is migrate/graphiti_clients.py. This file is a faithful Go port
// of that handshake + call pattern.
//
// If the brainbot URL isn't configured, callers should fall back to a
// local file.
package brainbot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

const (
	groupID         = "brain"
	mcpProtocolVer  = "2025-03-26"
	clientName      = "scout"
	clientVersion   = "0.1"
	maxResponseSize = 1 << 20
)

// Client is a brainbot MCP client.
type Client struct {
	BaseURL string
	HTTP    *http.Client
	// Auth is an optional bearer token (VPS path). Empty for local dev.
	Auth string

	mu        sync.Mutex
	sessionID string
}

// New builds a client. baseURL like "http://127.0.0.1:8000". Empty disables.
func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Enabled reports whether a base URL is configured.
func (c *Client) Enabled() bool { return c != nil && c.BaseURL != "" }

func (c *Client) endpoint() string { return c.BaseURL + "/mcp" }

// mcpCall invokes an MCP tool by name. The session handshake is performed
// lazily on first call and cached on the Client.
func (c *Client) mcpCall(ctx context.Context, toolName string, args map[string]any) (map[string]any, error) {
	if err := c.ensureSession(ctx); err != nil {
		return nil, err
	}
	body := map[string]any{
		"jsonrpc": "2.0",
		"id":      uuid.NewString(),
		"method":  "tools/call",
		"params": map[string]any{
			"name":      toolName,
			"arguments": args,
		},
	}
	resp, err := c.postJSON(ctx, body)
	if err != nil {
		return nil, fmt.Errorf("brainbot %s: %w", toolName, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("brainbot %s HTTP %d: %s", toolName, resp.StatusCode, string(raw))
	}
	return parseMCPResponse(resp.Header.Get("Content-Type"), raw)
}

func (c *Client) ensureSession(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sessionID != "" {
		return nil
	}
	initBody := map[string]any{
		"jsonrpc": "2.0",
		"id":      "init",
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": mcpProtocolVer,
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": clientName, "version": clientVersion},
		},
	}
	resp, err := c.postJSON(ctx, initBody)
	if err != nil {
		return fmt.Errorf("brainbot initialize: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseSize))
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("brainbot initialize HTTP %d", resp.StatusCode)
	}
	sid := resp.Header.Get("Mcp-Session-Id")
	if sid == "" {
		sid = resp.Header.Get("mcp-session-id")
	}
	if sid == "" {
		return errors.New("brainbot: no mcp-session-id returned on initialize")
	}
	c.sessionID = sid

	// MCP spec requires a notifications/initialized after initialize.
	notify := map[string]any{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
		"params":  map[string]any{},
	}
	nresp, err := c.postJSON(ctx, notify)
	if err != nil {
		c.sessionID = ""
		return fmt.Errorf("brainbot notifications/initialized: %w", err)
	}
	nresp.Body.Close()
	return nil
}

func (c *Client) postJSON(ctx context.Context, body any) (*http.Response, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(), bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if c.Auth != "" {
		req.Header.Set("Authorization", "Bearer "+c.Auth)
	}
	if c.sessionID != "" {
		req.Header.Set("Mcp-Session-Id", c.sessionID)
	}
	return c.HTTP.Do(req)
}

func parseMCPResponse(contentType string, raw []byte) (map[string]any, error) {
	var message map[string]any
	if strings.Contains(contentType, "text/event-stream") {
		message = extractSSEFinalMessage(raw)
	} else if err := json.Unmarshal(raw, &message); err != nil {
		return nil, fmt.Errorf("decode MCP response: %w", err)
	}
	if errObj, ok := message["error"]; ok && errObj != nil {
		return nil, fmt.Errorf("MCP error: %v", errObj)
	}
	result, _ := message["result"].(map[string]any)
	if result == nil {
		return map[string]any{}, nil
	}
	contentBlocks, _ := result["content"].([]any)
	for _, b := range contentBlocks {
		block, ok := b.(map[string]any)
		if !ok {
			continue
		}
		if block["type"] != "text" {
			continue
		}
		text, _ := block["text"].(string)
		var inner map[string]any
		if err := json.Unmarshal([]byte(text), &inner); err == nil {
			return inner, nil
		}
		return map[string]any{"text": text}, nil
	}
	return result, nil
}

func extractSSEFinalMessage(raw []byte) map[string]any {
	var last map[string]any
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(line[len("data:"):])
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var parsed map[string]any
		if err := json.Unmarshal([]byte(payload), &parsed); err == nil {
			last = parsed
		}
	}
	if last == nil {
		return map[string]any{}
	}
	return last
}

// FetchTaste pulls the user's job-search taste by searching the brain for
// relevant facts and synthesizing them into a narrative block.
func (c *Client) FetchTaste(ctx context.Context) (*taste.Block, error) {
	if !c.Enabled() {
		return nil, errors.New("brainbot: not configured")
	}
	result, err := c.mcpCall(ctx, "search_memory_facts", map[string]any{
		"query":      "job search taste preferences",
		"max_facts":  20,
		"group_ids":  []string{groupID},
	})
	if err != nil {
		return nil, err
	}
	factsRaw, _ := result["facts"].([]any)
	var lines []string
	for _, f := range factsRaw {
		fact, ok := f.(map[string]any)
		if !ok {
			continue
		}
		if s, _ := fact["fact"].(string); strings.TrimSpace(s) != "" {
			lines = append(lines, strings.TrimSpace(s))
		}
	}
	text := strings.TrimSpace(strings.Join(lines, "\n"))
	if text == "" {
		return nil, errors.New("brainbot taste: no facts returned")
	}
	return &taste.Block{
		Text:    text,
		Version: taste.Hash(text),
		Source:  "brainbot:" + c.BaseURL,
	}, nil
}

// Node is a brain entity returned by search_nodes.
type Node struct {
	UUID    string   `json:"uuid"`
	Name    string   `json:"name"`
	Summary string   `json:"summary,omitempty"`
	Labels  []string `json:"labels,omitempty"`
}

// SearchNodes calls the brain's search_nodes MCP tool to find entities
// matching the query. maxNodes <= 0 defaults to 5.
//
// Returns nil, nil if the brain is unreachable or returns no nodes — the
// brain is an enhancement, not a hard dep. Callers should treat empty
// results as "nothing known" rather than an error.
func (c *Client) SearchNodes(ctx context.Context, query string, maxNodes int) ([]Node, error) {
	if !c.Enabled() {
		return nil, errors.New("brainbot: not configured")
	}
	if maxNodes <= 0 {
		maxNodes = 5
	}
	result, err := c.mcpCall(ctx, "search_nodes", map[string]any{
		"query":     query,
		"max_nodes": maxNodes,
		"group_ids": []string{groupID},
	})
	if err != nil {
		return nil, err
	}
	rawNodes, _ := result["nodes"].([]any)
	out := make([]Node, 0, len(rawNodes))
	for _, n := range rawNodes {
		nm, ok := n.(map[string]any)
		if !ok {
			continue
		}
		var node Node
		node.UUID, _ = nm["uuid"].(string)
		node.Name, _ = nm["name"].(string)
		node.Summary, _ = nm["summary"].(string)
		if labels, ok := nm["labels"].([]any); ok {
			for _, l := range labels {
				if s, ok := l.(string); ok {
					node.Labels = append(node.Labels, s)
				}
			}
		}
		if node.Name == "" {
			continue
		}
		out = append(out, node)
	}
	return out, nil
}

// Episode is the payload shape for write-back.
type Episode struct {
	Source       string  `json:"source"`
	Kind         string  `json:"kind"`
	Company      Company `json:"company"`
	Verdict      string  `json:"verdict"`
	Reason       string  `json:"reason"`
	TasteVersion string  `json:"taste_version"`
}

// Company is the minimal company identity sent in an episode.
type Company struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Domain string `json:"domain,omitempty"`
}

// SendEpisode writes a verdict episode to the brain as natural-language text
// for asynchronous entity/fact extraction.
func (c *Client) SendEpisode(ctx context.Context, ep Episode) error {
	if !c.Enabled() {
		return errors.New("brainbot: not configured")
	}
	name := fmt.Sprintf("Scout verdict: %s", ep.Company.Name)
	body := formatEpisodeBody(ep)
	_, err := c.mcpCall(ctx, "add_memory", map[string]any{
		"name":               name,
		"episode_body":       body,
		"source":             "text",
		"source_description": "scout",
		"group_id":           groupID,
	})
	return err
}

func formatEpisodeBody(ep Episode) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Scout verdicted %s", ep.Company.Name)
	if ep.Company.Domain != "" {
		fmt.Fprintf(&b, " (%s)", ep.Company.Domain)
	}
	fmt.Fprintf(&b, " as %q on %s.", ep.Verdict, time.Now().UTC().Format("2006-01-02"))
	if r := strings.TrimSpace(ep.Reason); r != "" {
		fmt.Fprintf(&b, " Reason: %s", r)
		if !strings.HasSuffix(r, ".") {
			b.WriteString(".")
		}
	}
	if ep.TasteVersion != "" {
		fmt.Fprintf(&b, " Taste version: %s.", ep.TasteVersion)
	}
	return b.String()
}

// EpisodeFromVerdict builds the wire payload from local rows.
func EpisodeFromVerdict(v store.Verdict, name, domain string) Episode {
	return Episode{
		Source:       "scout",
		Kind:         "verdict",
		Company:      Company{ID: v.CompanyID, Name: name, Domain: domain},
		Verdict:      v.Verdict,
		Reason:       v.Reason,
		TasteVersion: v.TasteVersion,
	}
}

// ShipEpisodes sends every pending verdict episode to the brain and marks each
// one sent locally. Shared by `scout episodes` (CLI) and the UI run handler.
// emit (may be nil) receives one progress line per episode; it may be called
// from the calling goroutine only (this function is sequential).
func ShipEpisodes(ctx context.Context, db *store.DB, c *Client, emit func(string)) (sent, failed int, err error) {
	if emit == nil {
		emit = func(string) {}
	}
	pending, err := db.PendingEpisodes()
	if err != nil {
		return 0, 0, err
	}
	if len(pending) == 0 {
		emit("no pending episodes")
		return 0, 0, nil
	}
	for _, v := range pending {
		if ctx.Err() != nil {
			return sent, failed, ctx.Err()
		}
		name, domain, e := db.GetCompanyName(v.CompanyID)
		if e != nil {
			failed++
			emit(fmt.Sprintf("lookup %d failed: %v", v.CompanyID, e))
			continue
		}
		if e := c.SendEpisode(ctx, EpisodeFromVerdict(v, name, domain)); e != nil {
			failed++
			emit(fmt.Sprintf("send %s failed: %v", name, e))
			continue
		}
		if e := db.MarkEpisodeSent(v.CompanyID, v.TasteVersion); e != nil {
			failed++
			emit(fmt.Sprintf("mark %s failed: %v", name, e))
			continue
		}
		sent++
		emit(fmt.Sprintf("shipped %s (%s)", name, v.Verdict))
	}
	return sent, failed, nil
}
