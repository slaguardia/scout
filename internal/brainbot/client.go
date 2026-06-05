// Package brainbot is a thin HTTP/JSON client for the brain service.
//
// Scout uses the brain READ-ONLY through three reads: recall (search), map
// (discovery), and doc (deterministic whole-document fetch). The brain is a
// pgvector document substrate; it is a librarian that returns faithful content
// and never a verdict. Scout does all interpretation locally (the distiller
// synthesizes a criteria brief; the verdict engine judges companies; the
// outreach blocks are assembled scout-side). Scout never writes — there is no
// capture.
//
// Verified against the brain's own api.py (the authoritative contract):
//
//	GET  /health                    -> {ok:true}
//	GET  /recall?q=&k=&complete=    -> {chunks:[{id,heading,text,score,path}]}
//	GET  /doc?id=                   -> {id,title,path,version,text}
//	GET  /map                       -> {sources:[{id,title,path,parent_id,version}]}
//
// /recall does hybrid search and returns the top matching sections as PROSE
// chunks — there are no polarity/strength tags; the meaning is in the text.
// /doc returns the stored document VERBATIM (never reassembled from chunks);
// version is a content stamp over {title, text} — cache on it. /map is the
// discovery surface where pinnable ids come from; titles/paths in it are
// display-only, ids are the only keys. /profile stays owner-only — scout must
// NOT call it, and must never pass a scope it had to "know". See
// brainbot/plans/scout-migration.md (amended 2026-06-04).
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
// reasons over Text directly; there are no stance tags to gate on. ID is the
// owning document's stable id — the bridge to Doc when a hit warrants reading
// the whole page.
type Chunk struct {
	ID      string  `json:"id"`
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
	return c.recall(ctx, query, k, false)
}

// RecallComplete is Recall with complete=true: the brain returns everything IT
// judges relevant (its own cutoff), with k as a safety cap only. Use for
// gating-grade questions where a relevant criterion falling outside top-k is a
// correctness problem, not a ranking nit.
func (c *Client) RecallComplete(ctx context.Context, query string, k int) (RecallResult, error) {
	return c.recall(ctx, query, k, true)
}

func (c *Client) recall(ctx context.Context, query string, k int, complete bool) (RecallResult, error) {
	q := url.Values{"q": {query}}
	if k > 0 {
		q.Set("k", strconv.Itoa(k))
	}
	if complete {
		q.Set("complete", "true")
	}
	var out RecallResult
	err := c.getJSON(ctx, "/recall", q, &out)
	return out, err
}

// Doc is one whole document: the stored text VERBATIM (never reassembled from
// chunks), so pinned content round-trips byte-exact. Version is a content
// stamp over {title, text} — it moves iff the served content changes, never on
// a mere re-sync or a path change. Cache Text keyed by the Version from the
// same response (/map's version is only a change hint; /map and /doc are
// independent point reads, not a snapshot).
type Doc struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Path    string `json:"path"`
	Version string `json:"version"`
	Text    string `json:"text"`
}

// Doc fetches one whole document by its stable id (the origin's immutable page
// uuid — Notion renames never move it). A 404 means the document left the
// synced set (or was never ingested): for a pinned id that is a LOUD failure —
// callers must not silently skip the block. IsNotFound classifies it.
func (c *Client) Doc(ctx context.Context, id string) (Doc, error) {
	var out Doc
	err := c.getJSON(ctx, "/doc", url.Values{"id": {id}}, &out)
	return out, err
}

// MapSource is one synced document in the brain's tree: the stable id to pin,
// display-only title/path, and the same version stamp /doc serves (cheap
// change detection). ParentID links to the parent document when that parent is
// itself synced, else null — null is overloaded (true root or parent-not-
// synced), so treat the tree as a hint, not authoritative.
type MapSource struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Path     string  `json:"path"`
	ParentID *string `json:"parent_id"`
	Version  string  `json:"version"`
}

// MapResult is GET /map: the synced document tree.
type MapResult struct {
	Sources []MapSource `json:"sources"`
}

// Map fetches the synced document tree — the discovery surface where pinnable
// ids come from. Scout may read structure here for discovery/pinning, but must
// never feed it back into recall as a scope.
func (c *Client) Map(ctx context.Context) (MapResult, error) {
	var out MapResult
	err := c.getJSON(ctx, "/map", nil, &out)
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
		return &HTTPError{
			Status: resp.StatusCode,
			Detail: fmt.Sprintf("brain %s %s: HTTP %d: %s", req.Method, req.URL.Path, resp.StatusCode, errorDetail(raw)),
		}
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("brain %s %s: decode: %w", req.Method, req.URL.Path, err)
		}
	}
	return nil
}

// HTTPError is a non-2xx brain response, carrying the status so callers can
// branch on it (a 404 on a pinned doc id is a loud, distinct failure).
type HTTPError struct {
	Status int
	Detail string
}

func (e *HTTPError) Error() string { return e.Detail }

// IsNotFound reports whether err is a brain HTTP 404.
func IsNotFound(err error) bool {
	var he *HTTPError
	return errors.As(err, &he) && he.Status == http.StatusNotFound
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
