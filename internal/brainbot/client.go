// Package brainbot is a thin HTTP/JSON client for the brain service.
//
// Scout uses the brain READ-ONLY: it reads the user's criteria (/profile) and
// per-query recall (/recall), plus a /health probe. It never writes — scout's
// verdicts stay scout-local, not in the brain. (The brain also exposes
// POST /capture and an MCP face at /mcp, but scout doesn't use them.) This
// client mirrors brainbot's reference client, migrate/graphiti_clients.py.
//
// Verified against the brain's own service.py (the authoritative contract):
//
//	GET  /health            -> {ok:true}
//	GET  /profile           -> {count, facts:[{fact,polarity,strength,valid_at,name}]}
//	GET  /recall?q=&limit=  -> {query, facts:[{fact,name,score,polarity,strength,
//	                            valid_at,invalid_at}], fact_count}
//
// /profile returns ALL currently-true structured facts; each carries a polarity
// (positive/negative/null) and strength (hard/soft/null) scout renders into a
// grouped criteria block. /recall additionally scores facts against a query.
// (Both endpoints also surface episodes/episode_count for debugging; scout does
// not decode or use them.)
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

// Fact is an extracted graph claim with stance metadata. Polarity is positive
// (the user seeks/values/requires it), negative (avoids/rejects/excludes), or
// "" when the fact carries no stance (a neutral biographical fact). Strength is
// "hard" (a gate/dealbreaker/requirement), "soft" (a preference/lean), or ""
// (neutral context). Score is present on recall (0 on profile, an unscored
// dump). Together polarity+strength let scout render gates, preferences, and
// context distinctly instead of treating every fact the same.
type Fact struct {
	Fact      string  `json:"fact"`
	Name      string  `json:"name"`
	Polarity  string  `json:"polarity"`
	Strength  string  `json:"strength"`
	Score     float64 `json:"score"`
	ValidAt   string  `json:"valid_at"`
	InvalidAt string  `json:"invalid_at"`
}

// ProfileResult is GET /profile: every currently-true structured fact.
type ProfileResult struct {
	Count int    `json:"count"`
	Facts []Fact `json:"facts"`
}

// RecallResult is GET /recall: scored facts matched against a query.
type RecallResult struct {
	Query     string `json:"query"`
	Facts     []Fact `json:"facts"`
	FactCount int    `json:"fact_count"`
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

// Profile fetches the user's full current picture as structured facts.
func (c *Client) Profile(ctx context.Context) (ProfileResult, error) {
	var out ProfileResult
	err := c.getJSON(ctx, "/profile", nil, &out)
	return out, err
}

// Recall fetches scored facts for a query. limit <= 0 omits the param (the
// brain defaults to 20).
func (c *Client) Recall(ctx context.Context, query string, limit int) (RecallResult, error) {
	q := url.Values{"q": {query}}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	var out RecallResult
	err := c.getJSON(ctx, "/recall", q, &out)
	return out, err
}

// Criteria returns the user's full criteria as a grouped block rendered from the
// brain's structured /profile facts (see renderFacts). Each fact's polarity and
// strength decide whether it lands in HARD REQUIREMENTS / DEALBREAKERS (gates),
// PREFERENCES (weights), or CONTEXT (background). /profile returns ALL facts, so
// there is no recall fallback. An empty string with a nil error means the brain
// genuinely knows nothing yet (the caller should fall back to local criteria); a
// /profile fetch error is returned so the caller surfaces the outage instead of
// mistaking it for an empty brain.
func (c *Client) Criteria(ctx context.Context) (string, error) {
	pr, err := c.Profile(ctx)
	if err != nil {
		return "", err
	}
	return renderFacts(pr.Facts), nil
}

// renderFacts groups structured facts into a plain-text criteria block the
// verdict LLM can gate on. Grouping is by strength first: "hard" -> HARD
// REQUIREMENTS / DEALBREAKERS (gates), "soft" -> PREFERENCES (weights). A fact
// with no strength but a present polarity is a stance with no declared force,
// so it lands in PREFERENCES as a weight (preserving its seek/avoid signal
// rather than discarding it); only a null/null fact (no polarity, no strength)
// is neutral CONTEXT (background). Within a group the polarity picks the tag.
//
// Strength/polarity are matched case-insensitively (trimmed, lowercased) so a
// brain that emits "Hard"/"SOFT" still buckets correctly; an unrecognized
// non-empty strength falls back to the polarity-driven path (CONTEXT only when
// polarity is also absent), and an unrecognized polarity falls back to a
// neutral tag — graceful, never a panic. Facts with an empty .Fact string are
// skipped, exact-duplicate rendered lines are collapsed (the brain can emit
// dupes), empty sections are omitted, and input order is otherwise preserved so
// the rendered block — and its taste Version hash — is deterministic. With no
// facts at all it returns "".
func renderFacts(facts []Fact) string {
	var hard, soft, context []string
	seen := make(map[string]bool) // dedup keyed on the fully-rendered line
	add := func(bucket *[]string, tag, fact string) {
		line := "- " + fact
		if tag != "" {
			line = "- [" + tag + "] " + fact
		}
		if seen[line] {
			return
		}
		seen[line] = true
		*bucket = append(*bucket, line)
	}
	for _, f := range facts {
		fact := strings.TrimSpace(f.Fact)
		if fact == "" {
			continue
		}
		strength := strings.ToLower(strings.TrimSpace(f.Strength))
		polarity := strings.ToLower(strings.TrimSpace(f.Polarity))
		switch {
		case strength == "hard":
			add(&hard, hardTag(polarity), fact)
		case strength == "soft":
			add(&soft, softTag(polarity), fact)
		case strength == "" && polarity != "":
			// Stance with no declared force: keep it as a weight, don't
			// demote a seek/avoid signal to non-filterable context.
			add(&soft, softTag(polarity), fact)
		default: // null/null -> neutral biographical context
			add(&context, "", fact)
		}
	}

	var b strings.Builder
	writeSection := func(header string, lines []string) {
		if len(lines) == 0 {
			return
		}
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(header + "\n")
		b.WriteString(strings.Join(lines, "\n"))
	}
	writeSection("HARD REQUIREMENTS / DEALBREAKERS (gates — apply per the gate logic above):", hard)
	writeSection("PREFERENCES (weigh, don't gate):", soft)
	writeSection("CONTEXT (background, not a filter):", context)
	return b.String()
}

// hardTag labels a hard fact by (normalized, lowercase) polarity: a
// requirement, an exclusion, or an unsigned gate when polarity is absent or
// unrecognized.
func hardTag(polarity string) string {
	switch polarity {
	case "positive":
		return "requires"
	case "negative":
		return "excludes"
	default:
		return "gate"
	}
}

// softTag labels a soft fact by (normalized, lowercase) polarity: something
// sought, avoided, or merely preferred when polarity is absent or unrecognized.
func softTag(polarity string) string {
	switch polarity {
	case "positive":
		return "seeks"
	case "negative":
		return "avoids"
	default:
		return "prefers"
	}
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
