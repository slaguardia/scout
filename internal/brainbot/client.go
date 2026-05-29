// Package brainbot is a thin HTTP/JSON client for the brain service.
//
// Scout uses the brain READ-ONLY: it reads the user's criteria (/profile) and
// per-company memory (/recall), plus a /health probe. It never writes — scout's
// verdicts stay scout-local, not in the brain. (The brain also exposes
// POST /capture and an MCP face at /mcp, but scout doesn't use them.) This
// client mirrors brainbot's reference client, migrate/graphiti_clients.py.
//
// Verified against the brain's own service.py (the authoritative contract;
// brainbot/docs/consumer-api.md is stale on /profile):
//
//	GET  /health            -> {ok:true}
//	GET  /profile           -> {count, episodes:[{name,body,source}]}
//	GET  /recall?q=&limit=  -> {query, facts:[{fact,name,score,valid_at,invalid_at}],
//	                            episodes:[{name,body}], fact_count, episode_count}
//
// The brain is an enhancement, never a hard dependency: when it is unreachable
// callers fall back to local criteria (taste.md). If the base URL isn't
// configured, every call returns a "not configured" error.
package brainbot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const maxResponseSize = 1 << 20

// criteriaQuery is the broad question used to recover the user's criteria bodies
// when /profile yields none (the fallback source of episode bodies).
const criteriaQuery = "what does the user want in a job: their preferences, rules, hard exclusions, and dealbreakers"

// Client is a brain HTTP client.
type Client struct {
	BaseURL string
	// Auth is an optional bearer token (VPS path). Empty for local dev.
	Auth string
	HTTP *http.Client
}

// New builds a client. baseURL like "http://127.0.0.1:8100". Empty disables.
func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Enabled reports whether a base URL is configured.
func (c *Client) Enabled() bool { return c != nil && c.BaseURL != "" }

// Fact is an extracted graph claim. Facts are a lossy, POSITIVE-ONLY index:
// the extractor reliably captures what the user does/wants/has and systematically
// drops the negatives and rules. For anything rule-bearing (gates, avoid-lists,
// dealbreakers) read Episode bodies instead. Score is present on recall, 0 on
// profile (profile is an unscored dump).
type Fact struct {
	Fact      string  `json:"fact"`
	Name      string  `json:"name"`
	Score     float64 `json:"score"`
	ValidAt   string  `json:"valid_at"`
	InvalidAt string  `json:"invalid_at"`
}

// Episode is a faithful captured body — the complete record, with the
// negatives/gates/rules the facts drop. /profile returns {name,body,source};
// /recall returns {name,body}.
type Episode struct {
	Name   string `json:"name"`
	Body   string `json:"body"`
	Source string `json:"source,omitempty"`
}

// ProfileResult is GET /profile: every currently-true episode body.
type ProfileResult struct {
	Count    int       `json:"count"`
	Episodes []Episode `json:"episodes"`
}

// RecallResult is GET /recall: scored facts plus faithful episode bodies.
type RecallResult struct {
	Query        string    `json:"query"`
	Facts        []Fact    `json:"facts"`
	Episodes     []Episode `json:"episodes"`
	FactCount    int       `json:"fact_count"`
	EpisodeCount int       `json:"episode_count"`
}

// Bodies returns the non-empty episode bodies — the text the criteria block is
// built from. The gates and exclusions live here, not in the facts.
func (p ProfileResult) Bodies() []string { return episodeBodies(p.Episodes) }

// Bodies returns the non-empty matched episode bodies for a recall query.
func (r RecallResult) Bodies() []string { return episodeBodies(r.Episodes) }

func episodeBodies(eps []Episode) []string {
	out := make([]string, 0, len(eps))
	for _, e := range eps {
		if b := strings.TrimSpace(e.Body); b != "" {
			out = append(out, b)
		}
	}
	return out
}

// Health probes liveness. A nil error means the brain is up. (The probe is
// cheap and does not verify graph/LLM connectivity — it's a liveness check.)
func (c *Client) Health(ctx context.Context) error {
	var out struct {
		OK bool `json:"ok"`
	}
	if err := c.getJSON(ctx, "/health", nil, &out); err != nil {
		return err
	}
	if !out.OK {
		return errors.New("brain health: ok=false")
	}
	return nil
}

// Profile fetches the user's full current picture as faithful episode bodies.
func (c *Client) Profile(ctx context.Context) (ProfileResult, error) {
	var out ProfileResult
	err := c.getJSON(ctx, "/profile", nil, &out)
	return out, err
}

// Recall fetches scored facts + episode bodies for a query. limit <= 0 omits
// the param (the brain defaults to 20).
func (c *Client) Recall(ctx context.Context, query string, limit int) (RecallResult, error) {
	q := url.Values{"q": {query}}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var out RecallResult
	err := c.getJSON(ctx, "/recall", q, &out)
	return out, err
}

// Criteria returns the user's full criteria as the concatenated faithful episode
// bodies (the gates/exclusions live in the bodies, NOT the facts — a scorer
// built off facts alone will pursue companies the user hard-excludes). It reads
// /profile first; if profile yields no bodies it falls back to a broad
// /recall. An empty string with a nil error means the brain genuinely knows
// nothing yet (the caller should fall back to local criteria).
func (c *Client) Criteria(ctx context.Context) (string, error) {
	pr, err := c.Profile(ctx)
	if err != nil {
		return "", err
	}
	bodies := pr.Bodies()
	if len(bodies) == 0 {
		// profile empty (or, on an older brain, returns only facts) — recover
		// the bodies from a broad recall.
		if rr, rerr := c.Recall(ctx, criteriaQuery, 50); rerr == nil {
			bodies = rr.Bodies()
		}
	}
	return strings.Join(bodies, "\n\n"), nil
}

// --- transport ---

func (c *Client) getJSON(ctx context.Context, path string, query url.Values, out any) error {
	req, err := c.newRequest(ctx, http.MethodGet, path, query, nil)
	if err != nil {
		return err
	}
	return c.do(req, out)
}

func (c *Client) newRequest(ctx context.Context, method, path string, query url.Values, body io.Reader) (*http.Request, error) {
	if !c.Enabled() {
		return nil, errors.New("brainbot: not configured")
	}
	u := c.BaseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if c.Auth != "" {
		req.Header.Set("Authorization", "Bearer "+c.Auth)
	}
	return req, nil
}

// do executes the request, enforces a 2xx status, and (when out != nil)
// decodes the JSON body into it. A non-2xx response becomes an error carrying
// the body's {"error":...} message when present.
func (c *Client) do(req *http.Request, out any) error {
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("brain %s %s: %w", req.Method, req.URL.Path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("brain %s %s: HTTP %d: %s", req.Method, req.URL.Path, resp.StatusCode, errorDetail(raw))
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("brain %s %s: decode: %w", req.Method, req.URL.Path, err)
		}
	}
	return nil
}

// errorDetail pulls {"error":"..."} out of an error body, falling back to the
// raw (trimmed) text.
func errorDetail(raw []byte) string {
	var e struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(raw, &e) == nil && e.Error != "" {
		return e.Error
	}
	return strings.TrimSpace(string(raw))
}
