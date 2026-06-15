// ATS resolvers: the no-LLM capture path. Ashby, Greenhouse, and Lever all
// publish their job boards as public JSON APIs, so a posting link on one of
// those hosts resolves to exact structured fields — title, location,
// department, employment/workplace type, published date, salary range, the
// full description — with one unauthenticated GET. No page fetch, no model
// call, nothing to extract. Links the resolvers don't recognize (or that fail
// to resolve) fall through to the generic fetch + Haiku path in Run.
package capture

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"math"
	"net/http"
	neturl "net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Test seams: the resolvers hit these bases so tests can point them at a
// local httptest server. Greenhouse and Lever run separate EU instances with
// their own API hosts; the posting URL's host picks the base.
var (
	ashbyAPIBase        = "https://api.ashbyhq.com"
	ashbyBoardBase      = "https://jobs.ashbyhq.com" // board page host — carries the org's display name
	greenhouseAPIBase   = "https://boards-api.greenhouse.io"
	greenhouseEUAPIBase = "https://boards-api.eu.greenhouse.io"
	leverAPIBase        = "https://api.lever.co"
	leverEUAPIBase      = "https://api.eu.lever.co"
	ripplingAPIBase     = "https://api.rippling.com"
)

const (
	atsCallTimeout = 15 * time.Second
	atsMaxBody     = 8 << 20 // a whole Ashby board rides one response; cap it
	// descCapRunes bounds the stored description — postings run a few KB,
	// anything past this is boilerplate.
	descCapRunes = 12000
)

// atsJob is a posting as the platform's own API states it. CompanyName is the
// board's name when the API provides one (Greenhouse) and a slug-derived
// fallback otherwise — user-typed input still wins over both.
type atsJob struct {
	ATS            string // "ashby" | "greenhouse" | "lever" | "rippling"
	URL            string // canonical posting URL
	CompanyName    string
	Title          string
	Location       string
	Department     string
	EmploymentType string
	WorkplaceType  string
	CompRange      string
	PostedAt       string // "YYYY-MM-DD"
	Description    string // plain text
}

var reUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// atsTarget is a recognized ATS posting URL, routed: which platform, which
// regional API base, and the org/job identifiers the resolver needs.
type atsTarget struct {
	ats     string // "ashby" | "greenhouse" | "lever" | "rippling"
	base    string // regional API base
	org, id string
}

// atsTargetFor recognizes a job-posting URL on a supported ATS host — pure
// URL-shape parsing, no network. nil means the link doesn't route to a
// resolver (unknown host, a board index, a malformed id).
func atsTargetFor(rawURL string) *atsTarget {
	u, err := neturl.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	segs := strings.FieldsFunc(u.EscapedPath(), func(r rune) bool { return r == '/' })

	switch host {
	case "jobs.ashbyhq.com":
		if len(segs) >= 2 && reUUID.MatchString(segs[1]) {
			return &atsTarget{ats: "ashby", base: ashbyAPIBase, org: segs[0], id: segs[1]}
		}
	case "ats.rippling.com":
		// ats.rippling.com/{org}/jobs/{uuid}
		if len(segs) >= 3 && segs[1] == "jobs" && reUUID.MatchString(segs[2]) {
			return &atsTarget{ats: "rippling", base: ripplingAPIBase, org: segs[0], id: segs[2]}
		}
	case "jobs.lever.co", "jobs.eu.lever.co":
		if len(segs) >= 2 && reUUID.MatchString(segs[1]) {
			base := leverAPIBase
			if host == "jobs.eu.lever.co" {
				base = leverEUAPIBase
			}
			return &atsTarget{ats: "lever", base: base, org: segs[0], id: segs[1]}
		}
	case "boards.greenhouse.io", "job-boards.greenhouse.io",
		"boards.eu.greenhouse.io", "job-boards.eu.greenhouse.io":
		if org, id := greenhouseOrgJob(segs, u.Query()); org != "" {
			base := greenhouseAPIBase
			if strings.Contains(host, ".eu.") {
				base = greenhouseEUAPIBase
			}
			return &atsTarget{ats: "greenhouse", base: base, org: org, id: id}
		}
	}
	return nil
}

// IsATSPosting reports whether a pasted link is a posting on a supported ATS —
// i.e. capture can resolve it through the platform's API with no LLM call.
// URL-shape only, no network; the web layer uses it to skip the Anthropic-key
// precondition for links that won't need the model.
func IsATSPosting(rawURL string) bool { return atsTargetFor(rawURL) != nil }

// resolveATS recognizes a job-posting URL on a supported ATS host and resolves
// it through that platform's public API. nil means "not this path" — an
// unrecognized link, a board index, or a resolve failure — and the caller
// falls through to the generic fetch + LLM capture, so this can never make
// things worse than before.
func resolveATS(ctx context.Context, httpc *http.Client, rawURL string) *atsJob {
	t := atsTargetFor(rawURL)
	if t == nil {
		return nil
	}
	var (
		job *atsJob
		err error
	)
	switch t.ats {
	case "ashby":
		job, err = resolveAshby(ctx, httpc, t.base, t.org, t.id)
	case "greenhouse":
		job, err = resolveGreenhouse(ctx, httpc, t.base, t.org, t.id)
	case "lever":
		job, err = resolveLever(ctx, httpc, t.base, t.org, t.id)
	case "rippling":
		job, err = resolveRippling(ctx, httpc, t.base, t.org, t.id)
	}
	if err != nil {
		return nil // resolve failed — the generic capture path still applies
	}
	if job.URL == "" {
		job.URL = strings.TrimSpace(rawURL)
	}
	job.Description = truncRunes(job.Description, descCapRunes)
	return job
}

// greenhouseOrgJob pulls the board slug and numeric job id out of the two URL
// shapes Greenhouse serves: /{org}/jobs/{id} on the board hosts, and the
// embed form /embed/job_app?for={org}&token={id}.
func greenhouseOrgJob(segs []string, q neturl.Values) (org, id string) {
	isNum := func(s string) bool {
		_, err := strconv.ParseUint(s, 10, 64)
		return err == nil && s != ""
	}
	if len(segs) >= 3 && segs[1] == "jobs" && isNum(segs[2]) {
		return segs[0], segs[2]
	}
	if len(segs) >= 2 && segs[0] == "embed" && segs[1] == "job_app" &&
		q.Get("for") != "" && isNum(q.Get("token")) {
		return q.Get("for"), q.Get("token")
	}
	return "", ""
}

// --- Ashby -----------------------------------------------------------------

// resolveAshby reads the org's whole public board (Ashby has no per-posting
// endpoint) and picks the pasted job out of it.
func resolveAshby(ctx context.Context, httpc *http.Client, apiBase, org, jobID string) (*atsJob, error) {
	var board struct {
		Jobs []struct {
			ID               string `json:"id"`
			Title            string `json:"title"`
			Department       string `json:"department"`
			Team             string `json:"team"`
			EmploymentType   string `json:"employmentType"`
			Location         string `json:"location"`
			PublishedAt      string `json:"publishedAt"`
			IsRemote         bool   `json:"isRemote"`
			WorkplaceType    string `json:"workplaceType"`
			JobURL           string `json:"jobUrl"`
			DescriptionPlain string `json:"descriptionPlain"`
			Compensation     struct {
				TierSummary       string `json:"compensationTierSummary"`
				ScrapeableSummary string `json:"scrapeableCompensationSalarySummary"`
			} `json:"compensation"`
		} `json:"jobs"`
	}
	url := apiBase + "/posting-api/job-board/" + neturl.PathEscape(org) + "?includeCompensation=true"
	if err := fetchATSJSON(ctx, httpc, url, &board); err != nil {
		return nil, err
	}
	for _, j := range board.Jobs {
		if !strings.EqualFold(j.ID, jobID) {
			continue
		}
		workplace := map[string]string{"OnSite": "On-site"}[j.WorkplaceType]
		if workplace == "" {
			workplace = j.WorkplaceType
		}
		if workplace == "" && j.IsRemote {
			workplace = "Remote"
		}
		comp := j.Compensation.ScrapeableSummary
		if comp == "" {
			comp = j.Compensation.TierSummary
		}
		dept := j.Department
		if dept == "" {
			dept = j.Team
		}
		// The posting API states no company name. A hyphen/underscore slug
		// de-slugs cleanly ("foresight-health" → "Foresight Health"); a
		// run-together slug doesn't ("chaidiscovery" → "Chaidiscovery"), so read
		// the real name off the public board page's title. Best-effort — the
		// slug stays if the page is unreachable.
		name := slugName(org)
		if !strings.ContainsAny(org, "-_") {
			if n := fetchBoardName(ctx, httpc, ashbyBoardBase+"/"+neturl.PathEscape(org)); n != "" {
				name = n
			}
		}
		return &atsJob{
			ATS:            "ashby",
			URL:            j.JobURL,
			CompanyName:    name,
			Title:          j.Title,
			Location:       j.Location,
			Department:     dept,
			EmploymentType: employmentLabel(j.EmploymentType),
			WorkplaceType:  workplace,
			CompRange:      comp,
			PostedAt:       isoDate(j.PublishedAt),
			Description:    strings.TrimSpace(j.DescriptionPlain),
		}, nil
	}
	return nil, fmt.Errorf("job %s not on the %s board", jobID, org)
}

// --- Greenhouse --------------------------------------------------------------

func resolveGreenhouse(ctx context.Context, httpc *http.Client, apiBase, org, jobID string) (*atsJob, error) {
	var j struct {
		Title          string `json:"title"`
		AbsoluteURL    string `json:"absolute_url"`
		Content        string `json:"content"` // entity-escaped HTML
		FirstPublished string `json:"first_published"`
		Location       struct {
			Name string `json:"name"`
		} `json:"location"`
		Departments []struct {
			Name string `json:"name"`
		} `json:"departments"`
		PayInputRanges []struct {
			MinCents float64 `json:"min_cents"`
			MaxCents float64 `json:"max_cents"`
			Currency string  `json:"currency_type"`
		} `json:"pay_input_ranges"`
	}
	base := apiBase + "/v1/boards/" + neturl.PathEscape(org)
	if err := fetchATSJSON(ctx, httpc, base+"/jobs/"+neturl.PathEscape(jobID), &j); err != nil {
		return nil, err
	}

	// The board endpoint states the company's display name; the slug fallback
	// covers a failed lookup.
	name := slugName(org)
	var board struct {
		Name string `json:"name"`
	}
	if err := fetchATSJSON(ctx, httpc, base, &board); err == nil && strings.TrimSpace(board.Name) != "" {
		name = strings.TrimSpace(board.Name)
	}

	dept := ""
	for _, d := range j.Departments {
		if s := strings.TrimSpace(d.Name); s != "" && !strings.EqualFold(s, "no department") {
			dept = s
			break
		}
	}
	comp := ""
	if len(j.PayInputRanges) > 0 {
		r := j.PayInputRanges[0]
		comp = moneyRange(r.MinCents/100, r.MaxCents/100, r.Currency, "year")
		if len(j.PayInputRanges) > 1 {
			comp += " +" // geo tiers beyond the first
		}
	}
	return &atsJob{
		ATS:         "greenhouse",
		URL:         j.AbsoluteURL,
		CompanyName: name,
		Title:       j.Title,
		Location:    j.Location.Name,
		Department:  dept,
		CompRange:   comp,
		PostedAt:    isoDate(j.FirstPublished),
		Description: stripHTML(html.UnescapeString(j.Content)),
	}, nil
}

// --- Lever -------------------------------------------------------------------

func resolveLever(ctx context.Context, httpc *http.Client, apiBase, org, jobID string) (*atsJob, error) {
	var j struct {
		Text             string `json:"text"` // the title
		HostedURL        string `json:"hostedUrl"`
		CreatedAt        int64  `json:"createdAt"` // epoch ms
		DescriptionPlain string `json:"descriptionPlain"`
		WorkplaceType    string `json:"workplaceType"` // "remote"|"hybrid"|"on-site"|"unspecified"
		Categories       struct {
			Commitment string `json:"commitment"`
			Department string `json:"department"`
			Location   string `json:"location"`
			Team       string `json:"team"`
		} `json:"categories"`
		Lists []struct {
			Text    string `json:"text"`
			Content string `json:"content"` // HTML list items
		} `json:"lists"`
		SalaryRange struct {
			Min      float64 `json:"min"`
			Max      float64 `json:"max"`
			Currency string  `json:"currency"`
			Interval string  `json:"interval"`
		} `json:"salaryRange"`
	}
	url := apiBase + "/v0/postings/" + neturl.PathEscape(org) + "/" + neturl.PathEscape(jobID)
	if err := fetchATSJSON(ctx, httpc, url, &j); err != nil {
		return nil, err
	}

	// Lever splits the posting into a lead paragraph plus titled lists
	// (responsibilities, qualifications, ...) — stitch them back together.
	desc := strings.TrimSpace(j.DescriptionPlain)
	for _, l := range j.Lists {
		section := strings.TrimSpace(stripHTML(l.Text))
		body := stripHTML(l.Content)
		if body == "" {
			continue
		}
		if section != "" {
			desc += "\n\n" + section + "\n" + body
		} else {
			desc += "\n\n" + body
		}
	}

	workplace := ""
	switch strings.ToLower(j.WorkplaceType) {
	case "remote":
		workplace = "Remote"
	case "hybrid":
		workplace = "Hybrid"
	case "on-site", "onsite":
		workplace = "On-site"
	}
	posted := ""
	if j.CreatedAt > 0 {
		posted = time.UnixMilli(j.CreatedAt).UTC().Format("2006-01-02")
	}
	dept := j.Categories.Department
	if dept == "" {
		dept = j.Categories.Team
	}
	return &atsJob{
		ATS:            "lever",
		URL:            j.HostedURL,
		CompanyName:    slugName(org),
		Title:          j.Text,
		Location:       j.Categories.Location,
		Department:     dept,
		EmploymentType: j.Categories.Commitment,
		WorkplaceType:  workplace,
		CompRange:      moneyRange(j.SalaryRange.Min, j.SalaryRange.Max, j.SalaryRange.Currency, j.SalaryRange.Interval),
		PostedAt:       posted,
		Description:    strings.TrimSpace(desc),
	}, nil
}

// --- Rippling ----------------------------------------------------------------

// resolveRippling reads a single posting off Rippling's public board API. Unlike
// Ashby, Rippling serves each job at its own endpoint, so this is a direct GET —
// no whole-board scan. The description arrives split into a company blurb and a
// role section (both HTML); stitch and flatten them.
func resolveRippling(ctx context.Context, httpc *http.Client, apiBase, org, jobID string) (*atsJob, error) {
	var j struct {
		Name        string `json:"name"`
		CompanyName string `json:"companyName"`
		URL         string `json:"url"`
		CreatedOn   string `json:"createdOn"`
		Description struct {
			Company string `json:"company"`
			Role    string `json:"role"`
		} `json:"description"`
		WorkLocations []string `json:"workLocations"`
		Department    struct {
			Name string `json:"name"`
		} `json:"department"`
		EmploymentType struct {
			ID string `json:"id"` // human label, e.g. "Salaried, full-time"
		} `json:"employmentType"`
		PayRangeDetails []struct {
			Currency   string  `json:"currency"`
			Frequency  string  `json:"frequency"` // "YEAR" | "MONTH" | "HOUR"
			RangeStart float64 `json:"rangeStart"`
			RangeEnd   float64 `json:"rangeEnd"`
		} `json:"payRangeDetails"`
	}
	url := apiBase + "/platform/api/ats/v1/board/" + neturl.PathEscape(org) + "/jobs/" + neturl.PathEscape(jobID)
	if err := fetchATSJSON(ctx, httpc, url, &j); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(j.CompanyName)
	if name == "" {
		name = slugName(org)
	}
	desc := stripHTML(j.Description.Company)
	if role := stripHTML(j.Description.Role); role != "" {
		if desc != "" {
			desc += "\n\n" + role
		} else {
			desc = role
		}
	}
	comp := ""
	if len(j.PayRangeDetails) > 0 {
		p := j.PayRangeDetails[0]
		comp = moneyRange(p.RangeStart, p.RangeEnd, p.Currency, p.Frequency)
		if len(j.PayRangeDetails) > 1 {
			comp += " +" // geo tiers beyond the first
		}
	}
	return &atsJob{
		ATS:            "rippling",
		URL:            j.URL,
		CompanyName:    name,
		Title:          j.Name,
		Location:       strings.Join(j.WorkLocations, "; "),
		Department:     strings.TrimSpace(j.Department.Name),
		EmploymentType: strings.TrimSpace(j.EmploymentType.ID),
		CompRange:      comp,
		PostedAt:       isoDate(j.CreatedOn),
		Description:    strings.TrimSpace(desc),
	}, nil
}

// --- shared helpers ----------------------------------------------------------

func fetchATSJSON(ctx context.Context, httpc *http.Client, url string, v any) error {
	ctx, cancel := context.WithTimeout(ctx, atsCallTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("http %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, atsMaxBody)).Decode(v)
}

// Board-page title parsing: ATS boards title their index page "{Company} Jobs"
// (in <title> and og:title), so the company name is recoverable even when the
// posting API omits it. reBoardSuffix trims the trailing "Jobs"/"Careers" label.
var (
	reBoardOGTitle = regexp.MustCompile(`(?is)<meta[^>]+og:title[^>]+content=["']([^"']*)["']`)
	reBoardTitle   = regexp.MustCompile(`(?is)<title[^>]*>([^<]*)</title>`)
	reBoardSuffix  = regexp.MustCompile(`(?i)\s*[-–|·:]?\s*(jobs|careers|open roles|openings|job board)\s*$`)
)

// fetchBoardName reads an ATS board page's company display name from its
// og:title (or <title>): "Chai Discovery Jobs" → "Chai Discovery". Best-effort
// — "" on any fetch/parse failure, so the caller keeps its slug fallback. Reads
// only the head-ish prefix; the title lives there.
func fetchBoardName(ctx context.Context, httpc *http.Client, pageURL string) string {
	ctx, cancel := context.WithTimeout(ctx, atsCallTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (scout)")
	resp, err := httpc.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return ""
	}
	name := func(re *regexp.Regexp) string {
		m := re.FindSubmatch(body)
		if m == nil {
			return ""
		}
		s := strings.TrimSpace(html.UnescapeString(string(m[1])))
		return strings.TrimSpace(reBoardSuffix.ReplaceAllString(s, ""))
	}
	if n := name(reBoardOGTitle); n != "" {
		return n
	}
	return name(reBoardTitle)
}

// slugName turns a board slug into a readable company-name fallback:
// "foresight-health" → "Foresight Health". Only a fallback — a user-typed
// name or an API-stated one always wins.
func slugName(slug string) string {
	words := strings.FieldsFunc(slug, func(r rune) bool { return r == '-' || r == '_' })
	for i, w := range words {
		if w != "" {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// employmentLabel maps Ashby's camel-case enum to the human label; unknown
// values pass through as-is.
func employmentLabel(s string) string {
	switch s {
	case "FullTime":
		return "Full-time"
	case "PartTime":
		return "Part-time"
	case "Intern":
		return "Internship"
	}
	return s
}

// isoDate keeps the date out of an ISO timestamp, "" when it isn't one.
func isoDate(s string) string {
	if len(s) < 10 {
		return ""
	}
	if _, err := time.Parse("2006-01-02", s[:10]); err != nil {
		return ""
	}
	return s[:10]
}

// moneyRange renders a salary range the way a posting would print it:
// "$130K – $170K / year". Zero bounds mean "not published" → "".
func moneyRange(min, max float64, currency, interval string) string {
	if min <= 0 && max <= 0 {
		return ""
	}
	sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£"}[strings.ToUpper(strings.TrimSpace(currency))]
	suffix := ""
	if sym == "" && strings.TrimSpace(currency) != "" {
		suffix = " " + strings.ToUpper(strings.TrimSpace(currency))
	}
	amt := func(n float64) string {
		if n >= 1000 && math.Mod(n, 100) == 0 {
			return sym + strconv.FormatFloat(n/1000, 'f', -1, 64) + "K"
		}
		return sym + strconv.FormatFloat(n, 'f', -1, 64)
	}
	var out string
	switch {
	case min > 0 && max > 0 && min != max:
		out = amt(min) + " – " + amt(max)
	case max > 0:
		out = amt(max)
	default:
		out = amt(min)
	}
	out += suffix
	lo := strings.ToLower(interval)
	switch {
	case strings.Contains(lo, "year"):
		out += " / year"
	case strings.Contains(lo, "month"):
		out += " / month"
	case strings.Contains(lo, "hour"):
		out += " / hour"
	}
	return out
}

// stripHTML flattens posting HTML to readable plain text: list items become
// dashes, block closers become newlines, tags drop, entities unescape.
var (
	reListItem = regexp.MustCompile(`(?i)<li[^>]*>`)
	// </li> is absent: the <li> opener already starts the line, so its closer
	// breaking too would blank-line every list item.
	reBreakTags = regexp.MustCompile(`(?i)<(?:br\s*/?|/p|/div|/h[1-6]|/ul|/ol|/tr)>`)
	reAnyTag    = regexp.MustCompile(`<[^>]*>`)
	reBlankRuns = regexp.MustCompile(`\n{3,}`)
)

func stripHTML(s string) string {
	s = reListItem.ReplaceAllString(s, "\n- ")
	s = reBreakTags.ReplaceAllString(s, "\n")
	s = reAnyTag.ReplaceAllString(s, " ")
	s = html.UnescapeString(s)
	lines := strings.Split(s, "\n")
	for i, ln := range lines {
		lines[i] = strings.Join(strings.Fields(ln), " ")
	}
	s = strings.Join(lines, "\n")
	s = reBlankRuns.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}
