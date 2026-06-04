// Package enrich fetches a company's about/landing page and stores a text summary.
//
// Strategy: try a small set of candidate URLs (/about, /about-us, /, ...), take the
// first one that returns 2xx HTML, strip tags, collapse whitespace, truncate. Errors
// are recorded so we don't retry hot loops on permanently broken sites.
package enrich

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/slaguardia/scout/internal/store"
)

const (
	defaultWorkers  = 8
	defaultTimeout  = 12 * time.Second
	maxBodyBytes    = 512 * 1024 // 512 KB read cap
	maxSummaryRunes = 3000       // chunk handed to the LLM
	minContentRunes = 200        // below this, flag as 'low_content' (JS-SPA likely)
	userAgent       = "scout/0.1 (+https://github.com/slaguardia/scout)"
)

// candidate URL paths in priority order.
var candidatePaths = []string{"/about", "/about-us", "/company", "/"}

// Enricher fetches about-pages with bounded concurrency.
type Enricher struct {
	DB      *store.DB
	Workers int
	Timeout time.Duration
	Client  *http.Client

	// Progress, if set, receives one line per fetched company. Called from
	// worker goroutines — must be safe for concurrent use.
	Progress func(string)
}

func (e *Enricher) emit(line string) {
	if e.Progress != nil {
		e.Progress(line)
	}
}

// Result reports a run.
type Result struct {
	Considered int
	Fetched    int
	OK         int
	Failed     int
	Skipped    int
}

// NewHTTPClient returns the HTTP client the fetch paths share: a per-request
// timeout and a redirect cap. Exported so the link-capture flow fetches with
// the same posture as enrichment. A non-positive timeout uses the default.
func NewHTTPClient(timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	return &http.Client{
		Timeout: timeout,
		// Cap redirects so we don't follow forever.
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			return nil
		},
	}
}

// FetchPage fetches one URL and returns its stripped text, the final URL after
// any redirects, and a status from the same taxonomy fetchOne records ("ok",
// "low_content", "challenge", "soft_404", "http_<code>", "dns", "refused",
// "timeout", "error"). Exported for the link-capture flow, which fetches a
// single pasted URL rather than walking a domain's candidate paths. Text is
// returned (truncated to maxRunes; <=0 means the enrichment default) for the
// "ok" and "low_content" outcomes only — the other statuses carry no real
// content worth reading.
func FetchPage(ctx context.Context, client *http.Client, url string, maxRunes int) (text, finalURL, status string) {
	if client == nil {
		client = NewHTTPClient(0)
	}
	if maxRunes <= 0 {
		maxRunes = maxSummaryRunes
	}
	body, code, finalURL, err := get(ctx, client, url)
	if err != nil {
		return "", finalURL, classifyErr(err)
	}
	if code < 200 || code >= 300 || len(body) == 0 {
		return "", finalURL, fmt.Sprintf("http_%d", code)
	}
	text = extractText(body)
	switch {
	case looksLikeNotFound(text):
		return "", finalURL, "soft_404"
	case looksLikeChallenge(text):
		return "", finalURL, "challenge"
	case runeCount(text) < minContentRunes:
		// Keep the residual text — a JS-shell's title/meta can still carry
		// enough signal for the capture extractor to work with.
		return truncRunes(text, maxRunes), finalURL, "low_content"
	}
	return truncRunes(text, maxRunes), finalURL, "ok"
}

// Run enriches every company that needs it. If force, every company with a domain is re-fetched.
func (e *Enricher) Run(ctx context.Context, force bool) (*Result, error) {
	if e.Workers <= 0 {
		e.Workers = defaultWorkers
	}
	if e.Timeout <= 0 {
		e.Timeout = defaultTimeout
	}
	if e.Client == nil {
		e.Client = NewHTTPClient(e.Timeout)
	}

	targets, err := e.DB.EnrichmentTargets(force)
	if err != nil {
		return nil, err
	}
	res := &Result{Considered: len(targets)}
	if len(targets) == 0 {
		return res, nil
	}

	jobs := make(chan store.EnrichmentTarget)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i := 0; i < e.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range jobs {
				rec := e.fetchOne(ctx, t)
				if err := e.DB.UpsertEnrichment(rec); err != nil {
					// DB failure is bad; surface but keep going.
					fmt.Println("enrich db error:", err)
					continue
				}
				mu.Lock()
				res.Fetched++
				if rec.FetchStatus == "ok" {
					res.OK++
				} else {
					res.Failed++
				}
				done := res.Fetched
				mu.Unlock()
				e.emit(fmt.Sprintf("[%d/%d] %s — %s", done, res.Considered, t.Name, rec.FetchStatus))
			}
		}()
	}

	for _, t := range targets {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return res, ctx.Err()
		case jobs <- t:
		}
	}
	close(jobs)
	wg.Wait()
	return res, nil
}

func (e *Enricher) fetchOne(ctx context.Context, t store.EnrichmentTarget) store.Enrichment {
	rec := store.Enrichment{CompanyID: t.CompanyID}
	if t.Domain == "" {
		rec.FetchStatus = "no_domain"
		return rec
	}

	var lastErr string
	var lastStatus string
	for _, path := range candidatePaths {
		url := "https://" + t.Domain + path
		body, code, finalURL, err := get(ctx, e.Client, url)
		if err != nil {
			lastErr = err.Error()
			lastStatus = classifyErr(err)
			continue
		}
		if code >= 200 && code < 300 && len(body) > 0 {
			text := extractText(body)
			// Soft 404: many sites serve HTTP 200 with a "page not found"
			// body for a missing path. Don't accept it as the about page —
			// try the next candidate so we never hand the user a link that's
			// dead in everything but status code. Checked before we store
			// anything so a trailing soft-404 leaves no stale URL behind.
			if looksLikeNotFound(text) {
				lastStatus = "soft_404"
				continue
			}
			// Store where we actually landed, not the path we guessed: the
			// client may have followed redirects to get this 200.
			rec.WebsiteURL = store.NullString(finalURL)
			rec.WebsiteSummary = store.NullString(truncRunes(text, maxSummaryRunes))
			// Order matters: challenge pages are often short AND match the
			// challenge keywords, so check the more-specific signal first.
			if looksLikeChallenge(text) {
				rec.FetchStatus = "challenge"
				return rec
			}
			// Suspiciously short stripped text suggests a JS-SPA shell.
			// We still cache the text so it can be inspected, but flag it
			// so the verdict stage skips this row.
			if runeCount(text) < minContentRunes {
				rec.FetchStatus = "low_content"
				return rec
			}
			rec.FetchStatus = "ok"
			return rec
		}
		lastStatus = fmt.Sprintf("http_%d", code)
	}

	rec.FetchStatus = lastStatus
	if lastStatus == "" {
		rec.FetchStatus = "error"
	}
	if lastErr != "" {
		rec.FetchError = sql.NullString{String: lastErr, Valid: true}
	}
	return rec
}

// get fetches url and returns the body, status code, and the *final* URL after
// any redirects the client followed. Callers should store the final URL, not the
// requested one: a link that 301s at fetch time but resolves to 200 must point at
// the page that actually answered, or it 404s when a user clicks it.
func get(ctx context.Context, client *http.Client, url string) ([]byte, int, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, url, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, url, err
	}
	defer resp.Body.Close()
	// resp.Request is the last request in the redirect chain; its URL is where
	// we actually landed. Fall back to the requested url if it's somehow nil.
	finalURL := url
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "html") {
		return nil, resp.StatusCode, finalURL, fmt.Errorf("non-html content-type: %s", ct)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return nil, resp.StatusCode, finalURL, err
	}
	return body, resp.StatusCode, finalURL, nil
}

func classifyErr(err error) string {
	s := err.Error()
	switch {
	case strings.Contains(s, "context deadline exceeded"), strings.Contains(s, "Client.Timeout"):
		return "timeout"
	case strings.Contains(s, "no such host"):
		return "dns"
	case strings.Contains(s, "connection refused"):
		return "refused"
	default:
		return "error"
	}
}

// --- HTML text extraction (regex-based; cheap, no extra deps) ---

var (
	reScript = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reStyle  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reNoscr  = regexp.MustCompile(`(?is)<noscript[^>]*>.*?</noscript>`)
	reSvg    = regexp.MustCompile(`(?is)<svg[^>]*>.*?</svg>`)
	reTag    = regexp.MustCompile(`(?s)<[^>]+>`)
	reWS     = regexp.MustCompile(`\s+`)
	reEntity = regexp.MustCompile(`&[a-zA-Z#0-9]+;`)
)

var entities = map[string]string{
	"&amp;":    "&",
	"&lt;":     "<",
	"&gt;":     ">",
	"&quot;":   `"`,
	"&apos;":   "'",
	"&nbsp;":   " ",
	"&#39;":    "'",
	"&#34;":    `"`,
	"&hellip;": "…",
	"&mdash;":  "—",
	"&ndash;":  "–",
	"&rsquo;":  "'",
	"&lsquo;":  "'",
	"&rdquo;":  `"`,
	"&ldquo;":  `"`,
}

func extractText(body []byte) string {
	s := string(body)
	s = reScript.ReplaceAllString(s, " ")
	s = reStyle.ReplaceAllString(s, " ")
	s = reNoscr.ReplaceAllString(s, " ")
	s = reSvg.ReplaceAllString(s, " ")
	s = reTag.ReplaceAllString(s, " ")
	s = reEntity.ReplaceAllStringFunc(s, func(e string) string {
		if v, ok := entities[strings.ToLower(e)]; ok {
			return v
		}
		return " "
	})
	s = reWS.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func truncRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func runeCount(s string) int {
	n := 0
	for range s {
		n++
	}
	return n
}

// challengePhrases are case-insensitive substrings that strongly imply the
// fetched page is a bot-challenge interstitial (Cloudflare, PerimeterX,
// Akamai, etc.) rather than real content.
var challengePhrases = []string{
	"just a moment",
	"checking your browser",
	"please enable javascript and cookies to continue",
	"please turn javascript on and reload the page",
	"ddos protection by",
	"attention required",
	"verify you are human",
	"performance & security by cloudflare",
}

// looksLikeChallenge returns true if the stripped text matches any
// known challenge boilerplate AND is short enough that it's likely
// the *whole* page is the challenge (not just an incidental footer
// mention).
func looksLikeChallenge(text string) bool {
	if runeCount(text) >= 1000 {
		return false
	}
	lower := strings.ToLower(text)
	for _, p := range challengePhrases {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

// notFoundPhrases are case-insensitive substrings that strongly imply a
// soft 404 — a missing page served with a 200 status. Kept specific so a
// real about page that merely mentions "not found" in passing doesn't trip.
var notFoundPhrases = []string{
	"page not found",
	"page can't be found",
	"page cannot be found",
	"page could not be found",
	"page you requested could not be found",
	"page you are looking for",
	"page you were looking for",
	"page doesn't exist",
	"page does not exist",
	"404 error",
	"error 404",
}

// looksLikeNotFound returns true if the stripped text matches known
// not-found boilerplate AND is short enough that the *whole* page is the
// error (not just an incidental mention buried in real content).
func looksLikeNotFound(text string) bool {
	if runeCount(text) >= 1000 {
		return false
	}
	lower := strings.ToLower(text)
	for _, p := range notFoundPhrases {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}
