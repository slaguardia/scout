// Package capture turns a pasted link into structured rows. Two paths:
// posting links on a supported ATS (ashby/greenhouse/lever) resolve through
// the platform's public JSON API — exact fields, no page fetch, no LLM (see
// ats.go); everything else gets the generic pass — fetch the page, run one
// cheap LLM call to classify it (job posting vs company page) and extract
// fields. Either way the company is upserted — and the posting, when it's a
// job.
//
// This is the agent pass behind the UI's Add dialog: the user supplies a URL
// and, optionally, the kind (company vs job) and any fields they already know —
// user input wins, the pass fills the blanks. Same fetch posture as enrichment
// (internal/enrich), same tolerant-JSON parsing as the verdict engine. All
// writes stay scout-local; the brain is never touched.
package capture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	neturl "net/url"
	"regexp"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/enrich"
	"github.com/slaguardia/scout/internal/ingest"
	"github.com/slaguardia/scout/internal/store"
)

const (
	// maxPageRunes is the page-text cap handed to the extractor. Postings run
	// longer than about pages, and the company/title/location signal is usually
	// early, but a bigger window keeps the summary honest. Still cheap on Haiku.
	maxPageRunes = 6000
	// enrichSeedRunes matches enrichment's summary cap — a captured company
	// page seeds the enrichment row, so it must look like one enrich wrote.
	enrichSeedRunes = 3000
	llmMaxTokens    = 400
	callTimeout     = 45 * time.Second
)

// Page kinds the extractor classifies into.
const (
	KindJob     = "job_posting"
	KindCompany = "company_page"
	KindOther   = "other"
)

// Capturer runs the link-capture agent pass.
type Capturer struct {
	DB     *store.DB
	Client *anthropic.Client
	Model  string       // default anthropic.DefaultModel (Haiku)
	HTTP   *http.Client // default enrich.NewHTTPClient
}

// Request is one capture: the pasted URL plus whatever the user already knows.
// Kind, when set (KindJob or KindCompany), pins the page kind — the user said
// what the link is, so the classifier's opinion (including "other") is
// overridden. Fields carry user-typed values; they always win over extraction,
// the agent pass only fills the blanks.
type Request struct {
	URL    string
	Kind   string // "" = classify; KindJob / KindCompany = pinned by the user
	Fields Fields
}

// Fields are the user-typed values from the Add dialog. All optional; empty
// means "let the extractor fill it". Headcount and FundingStage are never
// extracted — they only ever carry user input through to the company row.
type Fields struct {
	Name         string // company name
	Location     string // company HQ
	Headcount    string
	FundingStage string
	Vertical     string
	Title        string // job title (job postings only)
}

// Result reports what one capture did. FetchStatus uses the enrichment
// taxonomy. CompanyID/Posting are set only when something was resolved or
// written; Note carries the human-readable outcome for the UI toast.
type Result struct {
	Kind           string         `json:"kind"`
	FetchStatus    string         `json:"fetch_status"`
	URL            string         `json:"url"` // final URL after redirects
	CompanyID      string         `json:"company_id,omitempty"`
	CompanyName    string         `json:"company_name,omitempty"`
	CompanyCreated bool           `json:"company_created"`
	Posting        *store.Posting `json:"posting,omitempty"`
	PostingUpdated bool           `json:"posting_updated"`
	Note           string         `json:"note,omitempty"`
}

// FetchError reports a page that couldn't be fetched as real content; Status
// is the enrichment fetch-taxonomy value ("challenge", "http_403", ...). The
// web layer maps it to a 422 so the UI can show the honest failure.
type FetchError struct{ Status string }

func (e FetchError) Error() string { return "fetch failed: " + e.Status }

// extraction is the JSON contract the extractor model must return.
type extraction struct {
	Kind            string `json:"kind"`
	CompanyName     string `json:"company_name"`
	CompanyDomain   string `json:"company_domain"`
	JobTitle        string `json:"job_title"`
	JobLocation     string `json:"job_location"`
	Summary         string `json:"summary"`
	Vertical        string `json:"vertical"`
	CompanyLocation string `json:"company_location"`
}

// apply overlays the user-typed fields onto the extraction — user input always
// wins, the extractor only fills what was left blank.
func (e *extraction) apply(f Fields) {
	if s := strings.TrimSpace(f.Name); s != "" {
		e.CompanyName = s
	}
	if s := strings.TrimSpace(f.Location); s != "" {
		e.CompanyLocation = s
	}
	if s := strings.TrimSpace(f.Vertical); s != "" {
		e.Vertical = s
	}
	if s := strings.TrimSpace(f.Title); s != "" {
		e.JobTitle = s
	}
}

// Run captures one pasted URL. Validation errors are prefixed "url " (the web
// layer maps them to 400); unfetchable pages return a FetchError (422); LLM or
// store failures are plain errors. On success the Result says what happened —
// including the no-write outcomes (kind "other", unidentifiable company),
// which are reported honestly rather than guessed at.
func (c *Capturer) Run(ctx context.Context, req Request) (*Result, error) {
	rawURL := strings.TrimSpace(req.URL)
	if rawURL == "" {
		return nil, errors.New("url required")
	}
	u, err := neturl.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("url must be http(s)")
	}

	httpc := c.HTTP
	if httpc == nil {
		httpc = enrich.NewHTTPClient(0)
	}

	// A posting link on a supported ATS resolves through the platform's own
	// API — exact fields, no LLM. Skipped when the user pinned the link as a
	// company page; a failed resolve falls through to the generic path.
	if req.Kind != KindCompany {
		if job := resolveATS(ctx, httpc, rawURL); job != nil {
			return c.runATS(rawURL, req, job)
		}
	}

	// low_content still goes to the extractor: ATS pages are often JS shells
	// whose residual text (title/meta) carries enough to extract from.
	text, finalURL, status := enrich.FetchPage(ctx, httpc, rawURL, maxPageRunes)
	if status != "ok" && status != "low_content" {
		return &Result{FetchStatus: status, URL: finalURL}, FetchError{Status: status}
	}

	ext, err := c.extract(ctx, finalURL, text, req.Kind)
	if err != nil {
		return &Result{FetchStatus: status, URL: finalURL}, fmt.Errorf("extract: %w", err)
	}
	// User-typed values win; extraction only fills the blanks.
	ext.apply(req.Fields)
	if req.Kind != "" {
		ext.Kind = req.Kind // the user said what this link is
	}

	res := &Result{Kind: ext.Kind, FetchStatus: status, URL: finalURL}
	if ext.Kind == KindOther {
		res.Note = "page doesn't look like a job posting or a company page — nothing added"
		return res, nil
	}

	name := strings.TrimSpace(ext.CompanyName)
	domain := resolveCompanyDomain(ext.CompanyDomain, rawURL, finalURL)
	if name == "" && domain == "" {
		res.Note = "couldn't identify the company behind the page — type a company name and retry"
		return res, nil
	}

	id, created, err := ingest.EnsureCompany(c.DB, ingest.CapturedCompany{
		Name:         name,
		Domain:       domain,
		Location:     ext.CompanyLocation,
		Vertical:     ext.Vertical,
		SourceURL:    finalURL,
		Headcount:    req.Fields.Headcount,
		FundingStage: req.Fields.FundingStage,
	})
	if err != nil {
		return res, err
	}
	res.CompanyID = id
	res.CompanyCreated = created
	if name == "" {
		name = domain
	}
	res.CompanyName = name

	switch ext.Kind {
	case KindCompany:
		// The page text is already in hand — seed the enrichment row so the next
		// verdict run can score the company without a separate Enrich pass. Only
		// when no enrichment exists: a capture of a careers page must not clobber
		// a real about-page summary.
		if existing, err := c.DB.GetEnrichment(id); err == nil && existing == nil {
			_ = c.DB.UpsertEnrichment(store.Enrichment{
				CompanyID:      id,
				WebsiteURL:     store.NullString(finalURL),
				WebsiteSummary: store.NullString(truncRunes(text, enrichSeedRunes)),
				FetchStatus:    status,
			})
		}
	case KindJob:
		p, updated, err := c.DB.UpsertCapturedPosting(store.CapturedPosting{
			CompanyID:   id,
			URL:         finalURL,
			PastedURL:   rawURL,
			Title:       ext.JobTitle,
			Location:    ext.JobLocation,
			Summary:     ext.Summary,
			FetchStatus: status,
		})
		if err != nil {
			return res, fmt.Errorf("store posting: %w", err)
		}
		res.Posting = &p
		res.PostingUpdated = updated
	}
	return res, nil
}

// runATS makes the same writes a captured job posting makes, from the
// platform-stated fields instead of an extraction. The ATS host never
// identifies the company, so its identity is the user-typed name or the
// board's (slug-derived for ashby/lever, API-stated for greenhouse) — never a
// domain. User-typed values win where they overlap, exactly like the LLM path.
func (c *Capturer) runATS(rawURL string, req Request, job *atsJob) (*Result, error) {
	res := &Result{Kind: KindJob, FetchStatus: "ok", URL: job.URL}

	name := strings.TrimSpace(req.Fields.Name)
	if name == "" {
		name = job.CompanyName
	}
	if name == "" {
		res.Note = "couldn't identify the company behind the page — type a company name and retry"
		return res, nil
	}
	id, created, err := ingest.EnsureCompany(c.DB, ingest.CapturedCompany{
		Name:         name,
		Location:     req.Fields.Location,
		Vertical:     req.Fields.Vertical,
		SourceURL:    job.URL,
		Headcount:    req.Fields.Headcount,
		FundingStage: req.Fields.FundingStage,
	})
	if err != nil {
		return res, err
	}
	res.CompanyID = id
	res.CompanyCreated = created
	res.CompanyName = name

	title := strings.TrimSpace(req.Fields.Title)
	if title == "" {
		title = job.Title
	}
	p, updated, err := c.DB.UpsertCapturedPosting(store.CapturedPosting{
		CompanyID:      id,
		URL:            job.URL,
		PastedURL:      rawURL,
		Title:          title,
		Location:       job.Location,
		FetchStatus:    "ok",
		PostedAt:       job.PostedAt,
		EmploymentType: job.EmploymentType,
		WorkplaceType:  job.WorkplaceType,
		Department:     job.Department,
		CompRange:      job.CompRange,
		Description:    job.Description,
	})
	if err != nil {
		return res, fmt.Errorf("store posting: %w", err)
	}
	res.Posting = &p
	res.PostingUpdated = updated
	res.Note = "details from the " + job.ATS + " posting API — no LLM pass needed"
	return res, nil
}

// captureContract is the extractor's system prompt — the JSON output contract
// plus the classification rules. Fixed in code, like the verdict contract.
const captureContract = `You are Scout's link-capture engine. The user pasted a link; you are given the fetched page's text. Classify the page and extract fields. Reply ONLY with valid JSON, no preamble, no markdown fences, exactly these fields:
{"kind": "job_posting" | "company_page" | "other",
 "company_name": "the hiring/owning company's name, or \"\"",
 "company_domain": "the company's OWN website domain (e.g. acme.com): the domain stated on the page, or — for a well-known company — its primary domain when you know it with high confidence. \"\" when unsure; never guess for small or unknown companies, and NEVER the host of a job board or ATS (greenhouse.io, lever.co, ashbyhq.com, workday, linkedin.com, indeed.com, ...)",
 "job_title": "the role's title, or \"\" if not a job posting",
 "job_location": "the role's location / remote policy, or \"\"",
 "summary": "1-2 plain sentences: for a job posting what the role is, for a company page what the company does",
 "vertical": "the company's industry/space in a few words, or \"\"",
 "company_location": "the company's HQ location if stated, or \"\""}

kind rules:
- "job_posting": the page describes ONE specific open role.
- "company_page": a company homepage, about page, or careers index.
- "other": anything else (an article, a list of many roles, a login wall, an empty shell).
Extract only what the page supports — never invent values.`

// extract runs the single Haiku pass over the page text. A pinned kind is
// passed along as a hint so extraction focuses on the right fields; the pin
// itself is enforced by the caller, not the model.
func (c *Capturer) extract(ctx context.Context, finalURL, text, kind string) (*extraction, error) {
	model := c.Model
	if model == "" {
		model = anthropic.DefaultModel
	}
	hint := ""
	switch kind {
	case KindJob:
		hint = "The user says this link is a job posting.\n"
	case KindCompany:
		hint = "The user says this link is a company page.\n"
	}
	user := fmt.Sprintf("%sURL: %s\n\nPage text (truncated):\n%s\n\nReturn the JSON now.", hint, finalURL, text)

	callCtx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	resp, err := c.Client.Send(callCtx, anthropic.Request{
		Model:     model,
		System:    captureContract,
		MaxTokens: llmMaxTokens,
		Messages:  []anthropic.Message{{Role: "user", Content: user}},
	})
	if err != nil {
		return nil, err
	}
	ext, err := parseExtraction(resp.Text())
	if err != nil {
		return nil, fmt.Errorf("%w (raw=%q)", err, truncRunes(resp.Text(), 200))
	}
	return ext, nil
}

// Extraction parsing: tolerant of surrounding noise and fenced code blocks,
// like the verdict parser. The contract JSON is flat, so the outermost braces
// are the object.
var reJSONBlock = regexp.MustCompile(`(?s)\{.*\}`)

func parseExtraction(s string) (*extraction, error) {
	s = strings.TrimSpace(s)
	candidates := []string{s}
	if m := reJSONBlock.FindString(s); m != "" {
		candidates = append([]string{m}, candidates...)
	}
	for _, cand := range candidates {
		var e extraction
		if err := json.Unmarshal([]byte(cand), &e); err != nil {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(e.Kind)) {
		case KindJob, KindCompany, KindOther:
			e.Kind = strings.ToLower(strings.TrimSpace(e.Kind))
			return &e, nil
		}
	}
	return nil, fmt.Errorf("no valid extraction JSON")
}

// atsHosts are applicant-tracking systems and job boards whose host routinely
// carries the posting but is never the company's own identity. Complements
// ingest's aggregator list (which already covers linkedin, indeed, glassdoor,
// wellfound, ...) with the hiring-specific platforms. Suffix-matched, so
// "boards.greenhouse.io" and "jobs.lever.co" are covered by their base.
var atsHosts = map[string]bool{
	"greenhouse.io": true, "lever.co": true, "ashbyhq.com": true,
	"workable.com": true, "workday.com": true, "myworkdayjobs.com": true,
	"icims.com": true, "smartrecruiters.com": true, "jobvite.com": true,
	"bamboohr.com": true, "breezy.hr": true, "recruitee.com": true,
	"teamtailor.com": true, "applytojob.com": true, "rippling-ats.com": true,
	"greenhouse.com": true, "jazz.co": true, "jazzhr.com": true,
	"workatastartup.com": true, "ycombinator.com": true, "otta.com": true,
	"builtin.com": true, "simplify.jobs": true, "hired.com": true,
}

func isATSHost(host string) bool {
	if host == "" {
		return false
	}
	if atsHosts[host] {
		return true
	}
	for base := range atsHosts {
		if strings.HasSuffix(host, "."+base) {
			return true
		}
	}
	return false
}

// CompanyDomainFromURL returns the company identity domain a pasted link's own
// host implies, or "" when the host can't identify a company (an ATS, a job
// board, an aggregator). The no-agent add path uses this to attach a posting
// on acme.com/careers to acme.com without a fetch or an LLM call.
func CompanyDomainFromURL(rawURL string) string {
	if u, err := neturl.Parse(strings.TrimSpace(rawURL)); err == nil {
		if d := ingest.IdentityDomain(u.Host); d != "" && !isATSHost(d) {
			return d
		}
	}
	return ""
}

// resolveCompanyDomain picks the company's identity domain: the extracted
// value when it's a real, non-ATS host, else the page's own host (a posting on
// acme.com/careers identifies acme.com; one on boards.greenhouse.io
// identifies nothing). ingest.IdentityDomain already rejects malformed hosts
// and shared aggregators; the ATS guard here is capture-specific.
func resolveCompanyDomain(extracted, pastedURL, finalURL string) string {
	if d := ingest.IdentityDomain(extracted); d != "" && !isATSHost(d) {
		return d
	}
	for _, raw := range []string{finalURL, pastedURL} {
		if u, err := neturl.Parse(raw); err == nil {
			if d := ingest.IdentityDomain(u.Host); d != "" && !isATSHost(d) {
				return d
			}
		}
	}
	return ""
}

func truncRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
