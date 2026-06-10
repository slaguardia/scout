package capture

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	neturl "net/url"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// tripwire serves a failing handler — any request through it means a path
// that must stay offline (the LLM, the page fetch) was hit.
func tripwire(t *testing.T, what string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected %s call: %s %s", what, r.Method, r.URL)
		http.Error(w, "tripwire", http.StatusTeapot)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func overrideBase(t *testing.T, target *string, url string) {
	t.Helper()
	old := *target
	*target = url
	t.Cleanup(func() { *target = old })
}

const ashbyJobID = "edc19899-2e86-48e1-8b61-69cced824ab2"

// ashbyBoard mirrors the real posting-api shape (captured from a live board).
func ashbyBoard(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/posting-api/job-board/foresight-health" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `{"apiVersion":"1","jobs":[
		  {"id":"other-job","title":"Founder's Associate"},
		  {"id":%q,"title":"Founding Engineer","department":"Engineering","team":"Engineering",
		   "employmentType":"FullTime","location":"San Francisco","isRemote":false,"workplaceType":"OnSite",
		   "publishedAt":"2026-04-14T18:01:28.407+00:00",
		   "jobUrl":"https://jobs.ashbyhq.com/foresight-health/%s",
		   "descriptionPlain":"About us: we raised a seed round.\n\nRole: build the core clinical platform.",
		   "compensation":{"compensationTierSummary":"","scrapeableCompensationSalarySummary":"$150K – $200K"}}
		]}`, ashbyJobID, ashbyJobID)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// TestRunResolvesAshbyWithoutLLM is the feature's contract: an ashby posting
// link resolves entirely through the board API — the model and the page are
// never fetched — and the platform-stated details land on the posting row.
func TestRunResolvesAshbyWithoutLLM(t *testing.T) {
	overrideBase(t, &ashbyAPIBase, ashbyBoard(t).URL)
	c := newCapturer(t, tripwire(t, "LLM"))

	pasted := "https://jobs.ashbyhq.com/foresight-health/" + ashbyJobID
	res, err := c.Run(context.Background(), Request{URL: pasted})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Kind != KindJob || res.FetchStatus != "ok" {
		t.Fatalf("unexpected result: %+v", res)
	}
	if res.CompanyName != "Foresight Health" || !res.CompanyCreated {
		t.Errorf("company: %+v", res)
	}
	if !strings.Contains(res.Note, "no LLM") {
		t.Errorf("note should say the LLM was skipped: %q", res.Note)
	}
	p := res.Posting
	if p == nil {
		t.Fatal("no posting written")
	}
	checks := map[string][2]string{
		"title":           {p.Title, "Founding Engineer"},
		"location":        {p.Location, "San Francisco"},
		"department":      {p.Department, "Engineering"},
		"employment_type": {p.EmploymentType, "Full-time"},
		"workplace_type":  {p.WorkplaceType, "On-site"},
		"posted_at":       {p.PostedAt, "2026-04-14"},
		"comp_range":      {p.CompRange, "$150K – $200K"},
		"source":          {p.Source, "capture"},
	}
	for field, c := range checks {
		if c[0] != c[1] {
			t.Errorf("%s = %q, want %q", field, c[0], c[1])
		}
	}
	if !strings.Contains(p.Description, "core clinical platform") {
		t.Errorf("description not stored: %q", p.Description)
	}
	// The ATS host never identifies the company — keyed by name only.
	if res.CompanyID != store.CompanyID("", "Foresight Health") {
		t.Errorf("company keyed wrong: %q", res.CompanyID)
	}

	// Same link again → refresh in place, not a duplicate.
	res2, err := c.Run(context.Background(), Request{URL: pasted})
	if err != nil {
		t.Fatalf("Run twice: %v", err)
	}
	if res2.CompanyCreated || !res2.PostingUpdated || res2.Posting.ID != p.ID {
		t.Errorf("re-capture: %+v", res2)
	}
}

func TestRunATSUserFieldsWin(t *testing.T) {
	overrideBase(t, &ashbyAPIBase, ashbyBoard(t).URL)
	c := newCapturer(t, tripwire(t, "LLM"))

	res, err := c.Run(context.Background(), Request{
		URL:    "https://jobs.ashbyhq.com/foresight-health/" + ashbyJobID,
		Kind:   KindJob,
		Fields: Fields{Name: "Foresight", Title: "Founding Engineer (Platform)"},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.CompanyName != "Foresight" {
		t.Errorf("typed company name should win: %q", res.CompanyName)
	}
	if res.Posting.Title != "Founding Engineer (Platform)" {
		t.Errorf("typed title should win: %q", res.Posting.Title)
	}
	// The board's fields still fill everything the user didn't type.
	if res.Posting.Department != "Engineering" || res.Posting.PostedAt != "2026-04-14" {
		t.Errorf("board details missing: %+v", res.Posting)
	}
}

func TestResolveGreenhouse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/boards/acme/jobs/123":
			fmt.Fprint(w, `{"title":"Staff Engineer","absolute_url":"https://boards.greenhouse.io/acme/jobs/123",
			  "location":{"name":"Remote - US"},"first_published":"2026-03-02T09:00:00-04:00",
			  "departments":[{"name":"No Department"},{"name":"Platform"}],
			  "content":"&lt;p&gt;Build &amp;amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;",
			  "pay_input_ranges":[{"min_cents":15000000,"max_cents":20000000,"currency_type":"USD"}]}`)
		case "/v1/boards/acme":
			fmt.Fprint(w, `{"name":"Acme Corp"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	job, err := resolveGreenhouse(context.Background(), srv.Client(), srv.URL, "acme", "123")
	if err != nil {
		t.Fatalf("resolveGreenhouse: %v", err)
	}
	if job.CompanyName != "Acme Corp" { // board-stated, not slug-derived
		t.Errorf("company = %q", job.CompanyName)
	}
	if job.Title != "Staff Engineer" || job.Location != "Remote - US" || job.PostedAt != "2026-03-02" {
		t.Errorf("fields: %+v", job)
	}
	if job.Department != "Platform" { // "No Department" placeholder skipped
		t.Errorf("department = %q", job.Department)
	}
	if job.CompRange != "$150K – $200K / year" {
		t.Errorf("comp = %q", job.CompRange)
	}
	// Blank line at the paragraph→list boundary, single-spaced items inside.
	if want := "Build & ship.\n\n- Go\n- SQL"; job.Description != want {
		t.Errorf("description = %q, want %q", job.Description, want)
	}
}

func TestResolveLever(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v0/postings/acme/abc" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, `{"text":"Backend Engineer","hostedUrl":"https://jobs.lever.co/acme/abc",
		  "createdAt":1769904000000,"workplaceType":"hybrid",
		  "categories":{"commitment":"Full-time","department":"Eng","location":"NYC"},
		  "descriptionPlain":"We build things.",
		  "lists":[{"text":"<b>Requirements</b>","content":"<li>Go</li><li>Postgres</li>"}],
		  "salaryRange":{"min":140000,"max":180000,"currency":"USD","interval":"per-year-salary"}}`)
	}))
	t.Cleanup(srv.Close)
	job, err := resolveLever(context.Background(), srv.Client(), srv.URL, "acme", "abc")
	if err != nil {
		t.Fatalf("resolveLever: %v", err)
	}
	if job.Title != "Backend Engineer" || job.Department != "Eng" ||
		job.EmploymentType != "Full-time" || job.WorkplaceType != "Hybrid" {
		t.Errorf("fields: %+v", job)
	}
	if job.PostedAt != "2026-02-01" {
		t.Errorf("posted_at = %q", job.PostedAt)
	}
	if job.CompRange != "$140K – $180K / year" {
		t.Errorf("comp = %q", job.CompRange)
	}
	if want := "We build things.\n\nRequirements\n- Go\n- Postgres"; job.Description != want {
		t.Errorf("description = %q, want %q", job.Description, want)
	}
}

func TestResolveRippling(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/platform/api/ats/v1/board/plenful/jobs/"+ashbyJobID {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `{"uuid":%q,"name":"Product Engineer","companyName":"Plenful",
		  "url":"https://ats.rippling.com/plenful/jobs/%s",
		  "createdOn":"2026-06-04T10:56:08.683000-07:00",
		  "description":{"company":"<p>About Plenful.</p>","role":"<p>Build things.</p><ul><li>Go</li><li>SQL</li></ul>"},
		  "workLocations":["San Francisco, CA","Hybrid (Seattle, Washington, US)"],
		  "department":{"name":"Engineering"},
		  "employmentType":{"label":"SALARIED_FT","id":"Salaried, full-time"},
		  "payRangeDetails":[{"location":"US","currency":"USD","frequency":"YEAR","rangeStart":200000,"rangeEnd":215000},
		    {"location":"NY","currency":"USD","frequency":"YEAR","rangeStart":220000,"rangeEnd":235000}]}`, ashbyJobID, ashbyJobID)
	}))
	t.Cleanup(srv.Close)
	job, err := resolveRippling(context.Background(), srv.Client(), srv.URL, "plenful", ashbyJobID)
	if err != nil {
		t.Fatalf("resolveRippling: %v", err)
	}
	if job.CompanyName != "Plenful" { // API-stated, not slug-derived
		t.Errorf("company = %q", job.CompanyName)
	}
	if job.Title != "Product Engineer" || job.Department != "Engineering" ||
		job.EmploymentType != "Salaried, full-time" || job.PostedAt != "2026-06-04" {
		t.Errorf("fields: %+v", job)
	}
	if job.Location != "San Francisco, CA; Hybrid (Seattle, Washington, US)" {
		t.Errorf("location = %q", job.Location)
	}
	if job.CompRange != "$200K – $215K / year +" { // first geo tier + the "more tiers" mark
		t.Errorf("comp = %q", job.CompRange)
	}
	if want := "About Plenful.\n\nBuild things.\n\n- Go\n- SQL"; job.Description != want {
		t.Errorf("description = %q, want %q", job.Description, want)
	}
}

// TestResolveATSRecognition covers the URL gate: which links enter the ATS
// path at all. Unrecognized shapes must return nil before any network call
// (httpc is nil — a fetch would panic).
func TestResolveATSRecognition(t *testing.T) {
	for _, url := range []string{
		"https://jobs.ashbyhq.com/foresight-health",      // board index, no job id
		"https://jobs.ashbyhq.com/org/not-a-uuid",        // slug where the uuid goes
		"https://ats.rippling.com/plenful",               // board index
		"https://ats.rippling.com/plenful/jobs/not-uuid", // non-uuid id
		"https://ats.rippling.com/plenful/" + ashbyJobID, // missing /jobs/ segment
		"https://jobs.lever.co/acme",                     // board index
		"https://boards.greenhouse.io/acme",              // board index
		"https://boards.greenhouse.io/acme/jobs/notnum",  // non-numeric id
		"https://acme.com/careers/123",                   // company-hosted
		"https://www.linkedin.com/jobs/view/123",         // aggregator
		"https://greenhouse.io.evil.com/acme/jobs/123",   // host suffix spoof
		"https://jobs-ashbyhq-com.evil.com/org/" + ashbyJobID,
	} {
		if job := resolveATS(context.Background(), nil, url); job != nil {
			t.Errorf("%s: resolved to %+v, want nil", url, job)
		}
	}
}

func TestGreenhouseOrgJob(t *testing.T) {
	cases := []struct {
		url, org, id string
	}{
		{"https://boards.greenhouse.io/acme/jobs/4012345", "acme", "4012345"},
		{"https://job-boards.greenhouse.io/acme/jobs/4012345", "acme", "4012345"},
		{"https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345", "acme", "4012345"},
		{"https://boards.greenhouse.io/embed/job_app?for=acme", "", ""}, // no token
	}
	for _, c := range cases {
		u, _ := neturl.Parse(c.url)
		segs := strings.FieldsFunc(u.EscapedPath(), func(r rune) bool { return r == '/' })
		org, id := greenhouseOrgJob(segs, u.Query())
		if org != c.org || id != c.id {
			t.Errorf("%s: got (%q, %q), want (%q, %q)", c.url, org, id, c.org, c.id)
		}
	}
}

func TestMoneyRange(t *testing.T) {
	cases := []struct {
		min, max float64
		cur, ivl string
		want     string
	}{
		{140000, 180000, "USD", "per-year-salary", "$140K – $180K / year"},
		{150000, 150000, "USD", "year", "$150K / year"},
		{0, 90000, "USD", "", "$90K"},
		{60, 75, "USD", "per-hour", "$60 – $75 / hour"},
		{80000, 100000, "CAD", "year", "80K – 100K CAD / year"},
		{0, 0, "USD", "year", ""},
	}
	for _, c := range cases {
		if got := moneyRange(c.min, c.max, c.cur, c.ivl); got != c.want {
			t.Errorf("moneyRange(%v, %v, %q, %q) = %q, want %q", c.min, c.max, c.cur, c.ivl, got, c.want)
		}
	}
}

func TestSlugName(t *testing.T) {
	for slug, want := range map[string]string{
		"foresight-health": "Foresight Health",
		"acme":             "Acme",
		"big_co":           "Big Co",
	} {
		if got := slugName(slug); got != want {
			t.Errorf("slugName(%q) = %q, want %q", slug, got, want)
		}
	}
}

func TestIsoDate(t *testing.T) {
	for in, want := range map[string]string{
		"2026-04-14T18:01:28.407+00:00": "2026-04-14",
		"2026-03-02T09:00:00-04:00":     "2026-03-02",
		"2026-04-14":                    "2026-04-14",
		"not a date":                    "",
		"":                              "",
	} {
		if got := isoDate(in); got != want {
			t.Errorf("isoDate(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestATSTargetFor covers the positive routing side of recognition: which
// platform, which regional API base, and the extracted org/id — still no
// network (pure URL-shape parsing).
func TestATSTargetFor(t *testing.T) {
	cases := []struct {
		url, ats, base, org, id string
	}{
		{"https://jobs.ashbyhq.com/foresight-health/" + ashbyJobID,
			"ashby", ashbyAPIBase, "foresight-health", ashbyJobID},
		{"https://ats.rippling.com/plenful/jobs/" + ashbyJobID,
			"rippling", ripplingAPIBase, "plenful", ashbyJobID},
		{"https://jobs.lever.co/acme/" + ashbyJobID,
			"lever", leverAPIBase, "acme", ashbyJobID},
		{"https://jobs.eu.lever.co/acme/" + ashbyJobID,
			"lever", leverEUAPIBase, "acme", ashbyJobID},
		{"https://boards.greenhouse.io/acme/jobs/4012345",
			"greenhouse", greenhouseAPIBase, "acme", "4012345"},
		{"https://job-boards.eu.greenhouse.io/acme/jobs/4012345",
			"greenhouse", greenhouseEUAPIBase, "acme", "4012345"},
		{"https://boards.eu.greenhouse.io/embed/job_app?for=acme&token=4012345",
			"greenhouse", greenhouseEUAPIBase, "acme", "4012345"},
	}
	for _, c := range cases {
		got := atsTargetFor(c.url)
		if got == nil {
			t.Errorf("%s: not recognized", c.url)
			continue
		}
		if got.ats != c.ats || got.base != c.base || got.org != c.org || got.id != c.id {
			t.Errorf("%s: got %+v, want {%s %s %s %s}", c.url, got, c.ats, c.base, c.org, c.id)
		}
		if !IsATSPosting(c.url) {
			t.Errorf("%s: IsATSPosting = false", c.url)
		}
	}
	if IsATSPosting("https://acme.com/careers/123") {
		t.Error("company-hosted link must not count as an ATS posting")
	}
}
