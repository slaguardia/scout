package outreach

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"regexp"
	"strings"
)

// jdMaxChars caps the JD text handed to the researcher: enough to carry the
// distinctive lines, small enough to keep the prompt cheap.
const jdMaxChars = 20000

// browserUA spoofs a real browser so ATS HTML pages that block scripted clients
// still return the posting. Matches enrichment's fetch posture in spirit; the
// JD fetch is best-effort, so a failure just yields the researcher less context.
const browserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// JDResult is the outcome of the pre-fetch. Text is the (truncated) job
// description on success; Status is a short human-readable note the researcher
// is told about ("ok", "no JD URL", an HTTP status, or a fetch error) so it
// knows when it is working with less context.
type JDResult struct {
	Text   string
	Status string
}

// ats* regexes extract the org/posting identifiers from the three ATS URL
// shapes whose JSON APIs are deterministic HTTP — no model needed to read them.
var (
	// jobs.ashbyhq.com/<org>/<postingId...>
	reAshby = regexp.MustCompile(`(?i)ashbyhq\.com/([^/?#]+)(?:/([0-9a-f-]+))?`)
	// boards.greenhouse.io/<org>/jobs/<id> or job-boards.greenhouse.io/<org>/jobs/<id>
	reGreenhouse = regexp.MustCompile(`(?i)greenhouse\.io/([^/?#]+)/jobs/(\d+)`)
	// jobs.lever.co/<org>/<id>
	reLever = regexp.MustCompile(`(?i)lever\.co/([^/?#]+)/([0-9a-f-]+)`)
)

// FetchJD pulls the job description for a posting URL, preferring the ATS JSON
// APIs (Ashby / Greenhouse / Lever) and falling back to a plain browser-UA GET
// with crude tag stripping. A failed fetch is not an error — the engine passes
// the Status to the researcher and carries on with fewer hook candidates.
func FetchJD(ctx context.Context, httpc *http.Client, postingURL string) JDResult {
	postingURL = strings.TrimSpace(postingURL)
	if postingURL == "" {
		return JDResult{Status: "no JD URL"}
	}
	if httpc == nil {
		httpc = http.DefaultClient
	}

	if m := reAshby.FindStringSubmatch(postingURL); m != nil {
		if r, ok := fetchAshby(ctx, httpc, m[1], m[2]); ok {
			return r
		}
	}
	if m := reGreenhouse.FindStringSubmatch(postingURL); m != nil {
		if r, ok := fetchGreenhouse(ctx, httpc, m[1], m[2]); ok {
			return r
		}
	}
	if m := reLever.FindStringSubmatch(postingURL); m != nil {
		if r, ok := fetchLever(ctx, httpc, m[1], m[2]); ok {
			return r
		}
	}
	return fetchPlain(ctx, httpc, postingURL)
}

// getJSON does an authenticated-by-nothing GET with the browser UA and decodes
// JSON into v. ok is false on any transport/HTTP/decoding failure.
func getJSON(ctx context.Context, httpc *http.Client, url string, v any) (status string, ok bool) {
	body, code, err := get(ctx, httpc, url)
	if err != nil {
		return fmt.Sprintf("fetch error: %v", err), false
	}
	if code/100 != 2 {
		return fmt.Sprintf("http %d", code), false
	}
	if err := json.Unmarshal(body, v); err != nil {
		return "json decode failed", false
	}
	return "ok", true
}

// get performs the raw GET shared by the JSON and plain paths.
func get(ctx context.Context, httpc *http.Client, url string) (body []byte, code int, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "text/html,application/json,*/*")
	resp, err := httpc.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return b, resp.StatusCode, nil
}

// fetchAshby reads the job board and finds the matching posting. Ashby's
// job-board API returns every open job; we match on the posting id when the URL
// carries one, else fall through to the plain GET (ok=false).
func fetchAshby(ctx context.Context, httpc *http.Client, org, postingID string) (JDResult, bool) {
	var board struct {
		Jobs []struct {
			ID               string `json:"id"`
			Title            string `json:"title"`
			Location         string `json:"location"`
			DescriptionPlain string `json:"descriptionPlain"`
			DescriptionHTML  string `json:"descriptionHtml"`
		} `json:"jobs"`
	}
	url := "https://api.ashbyhq.com/posting-api/job-board/" + neturl.PathEscape(org)
	if status, ok := getJSON(ctx, httpc, url, &board); !ok {
		_ = status
		return JDResult{}, false
	}
	for _, j := range board.Jobs {
		if postingID != "" && !strings.EqualFold(j.ID, postingID) {
			continue
		}
		desc := j.DescriptionPlain
		if desc == "" {
			desc = stripTags(j.DescriptionHTML)
		}
		text := joinJD(j.Title, j.Location, desc)
		if text != "" {
			return JDResult{Text: trunc(text, jdMaxChars), Status: "ok (ashby)"}, true
		}
	}
	return JDResult{}, false
}

// fetchGreenhouse reads one job from the board API (content=true returns the
// full HTML description).
func fetchGreenhouse(ctx context.Context, httpc *http.Client, org, id string) (JDResult, bool) {
	var job struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		Location struct {
			Name string `json:"name"`
		} `json:"location"`
	}
	url := fmt.Sprintf("https://boards-api.greenhouse.io/v1/boards/%s/jobs/%s?content=true",
		neturl.PathEscape(org), neturl.PathEscape(id))
	if status, ok := getJSON(ctx, httpc, url, &job); !ok {
		_ = status
		return JDResult{}, false
	}
	text := joinJD(job.Title, job.Location.Name, stripTags(unescapeHTML(job.Content)))
	if text == "" {
		return JDResult{}, false
	}
	return JDResult{Text: trunc(text, jdMaxChars), Status: "ok (greenhouse)"}, true
}

// fetchLever reads one posting from the v0 postings API.
func fetchLever(ctx context.Context, httpc *http.Client, org, id string) (JDResult, bool) {
	var post struct {
		Text             string `json:"text"`
		DescriptionPlain string `json:"descriptionPlain"`
		Description      string `json:"description"`
		Categories       struct {
			Location string `json:"location"`
		} `json:"categories"`
	}
	url := fmt.Sprintf("https://api.lever.co/v0/postings/%s/%s",
		neturl.PathEscape(org), neturl.PathEscape(id))
	if status, ok := getJSON(ctx, httpc, url, &post); !ok {
		_ = status
		return JDResult{}, false
	}
	desc := post.DescriptionPlain
	if desc == "" {
		desc = stripTags(post.Description)
	}
	text := joinJD(post.Text, post.Categories.Location, desc)
	if text == "" {
		return JDResult{}, false
	}
	return JDResult{Text: trunc(text, jdMaxChars), Status: "ok (lever)"}, true
}

// fetchPlain is the fallback: a browser-UA GET with crude HTML stripping.
func fetchPlain(ctx context.Context, httpc *http.Client, url string) JDResult {
	body, code, err := get(ctx, httpc, url)
	if err != nil {
		return JDResult{Status: fmt.Sprintf("fetch error: %v", err)}
	}
	if code/100 != 2 {
		return JDResult{Status: fmt.Sprintf("http %d", code)}
	}
	text := strings.TrimSpace(stripTags(string(body)))
	if text == "" {
		return JDResult{Status: "empty page"}
	}
	return JDResult{Text: trunc(text, jdMaxChars), Status: "ok (scraped)"}
}

// joinJD assembles the title/location/body into one block, dropping empties.
func joinJD(title, location, body string) string {
	var b strings.Builder
	if t := strings.TrimSpace(title); t != "" {
		fmt.Fprintf(&b, "Title: %s\n", t)
	}
	if l := strings.TrimSpace(location); l != "" {
		fmt.Fprintf(&b, "Location: %s\n", l)
	}
	if d := strings.TrimSpace(body); d != "" {
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(d)
	}
	return strings.TrimSpace(b.String())
}

var (
	reScriptStyle = regexp.MustCompile(`(?is)<(script|style)[^>]*>.*?</(script|style)>`)
	reTag         = regexp.MustCompile(`(?s)<[^>]+>`)
	reWS          = regexp.MustCompile(`[ \t]*\n[ \t\n]*`)
	reSpaces      = regexp.MustCompile(`[ \t]{2,}`)
)

// stripTags removes script/style blocks then all tags, collapsing whitespace —
// the crude HTML-to-text used for both ATS HTML descriptions and scraped pages.
func stripTags(html string) string {
	if html == "" {
		return ""
	}
	s := reScriptStyle.ReplaceAllString(html, " ")
	s = reTag.ReplaceAllString(s, " ")
	s = unescapeHTML(s)
	s = reSpaces.ReplaceAllString(s, " ")
	s = reWS.ReplaceAllString(s, "\n")
	return strings.TrimSpace(s)
}

// unescapeHTML expands the handful of entities that survive ATS JSON/HTML.
func unescapeHTML(s string) string {
	r := strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`,
		"&#39;", "'", "&#x27;", "'", "&nbsp;", " ", "&rsquo;", "'",
		"&ldquo;", `"`, "&rdquo;", `"`, "&mdash;", "-", "&ndash;", "-",
	)
	return r.Replace(s)
}

// trunc caps s to n runes, appending an ellipsis marker when it cuts.
func trunc(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + " …[truncated]"
}
