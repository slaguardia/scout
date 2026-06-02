// Package brainbot is a thin HTTP/JSON client for the brain service.
//
// Scout uses the brain READ-ONLY through a single read: recall. The brain is a
// pgvector document substrate (graphiti is gone); it is a librarian that returns
// the prose most relevant to a question and never a verdict. Scout does all
// interpretation locally (the distiller synthesizes a criteria brief; the
// verdict engine judges companies). Scout never writes — there is no capture.
//
// Verified against the brain's own api.py (the authoritative contract):
//
//	GET  /health           -> {ok:true}
//	GET  /recall?q=&k=      -> {chunks:[{heading,text,score,path}]}
//
// /recall does hybrid search and returns the top-k matching sections as PROSE
// chunks — there are no polarity/strength tags; the meaning is in the text.
// (The brain also exposes a scope-scoped /profile and a /map, but those are
// owner-only/brain-internal — scout must NOT call them, and must never pass a
// scope it had to "know"; recall(query) is the whole interface. See
// brainbot/plans/scout-migration.md.)
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
	"os"
	"strconv"
	"strings"
	"time"
)

const maxResponseSize = 1 << 20

// Client is a brain HTTP client.
type Client struct {
	BaseURL string
	// Auth is an optional bearer token (VPS path). Empty for local dev; sourced
	// from BRAIN_BEARER_TOKEN by New.
	Auth string
	HTTP *http.Client
}

// New builds a client. baseURL like "http://127.0.0.1:8100". Empty disables.
// The bearer token (for the VPS edge) is read from BRAIN_BEARER_TOKEN; it is
// empty (and unused) for local dev.
func New(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Auth:    os.Getenv("BRAIN_BEARER_TOKEN"),
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Enabled reports whether a base URL is configured.
func (c *Client) Enabled() bool { return c != nil && c.BaseURL != "" }

// Chunk is one retrieved section: a heading, its prose text, the hybrid-search
// relevance score, and the source path it came from (e.g. "Job Hunting/Target
// company"). The criteria live in the text, in the user's own words — scout
// reasons over Text directly; there are no stance tags to gate on.
type Chunk struct {
	Heading string  `json:"heading"`
	Text    string  `json:"text"`
	Score   float64 `json:"score"`
	Path    string  `json:"path"`
}

// RecallResult is GET /recall: the top-k chunks matching a query.
type RecallResult struct {
	Chunks []Chunk `json:"chunks"`
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

// Recall fetches the top-k chunks most relevant to a natural-language query.
// k <= 0 omits the param (the brain defaults to 12). Scope is deliberately not
// exposed: recall(query) is the whole interface, and naming the brain's folder
// taxonomy is the brain's business, not scout's.
func (c *Client) Recall(ctx context.Context, query string, k int) (RecallResult, error) {
	q := url.Values{"q": {query}}
	if k > 0 {
		q.Set("k", strconv.Itoa(k))
	}
	var out RecallResult
	err := c.getJSON(ctx, "/recall", q, &out)
	return out, err
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
