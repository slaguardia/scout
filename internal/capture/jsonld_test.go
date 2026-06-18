package capture

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// a full, realistic Google-for-Jobs JobPosting blob.
const jobPostingLDFixture = `{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Backend Engineer",
  "description": "<p>Build our core platform &amp; ship.</p><ul><li>Go</li><li>SQL</li></ul>",
  "datePosted": "2026-05-01T00:00:00Z",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {"@type": "Organization", "name": "Acme Robotics", "sameAs": "https://acme.com"},
  "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress",
    "addressLocality": "San Francisco", "addressRegion": "CA",
    "addressCountry": {"@type": "Country", "name": "US"}}},
  "baseSalary": {"@type": "MonetaryAmount", "currency": "USD",
    "value": {"@type": "QuantitativeValue", "minValue": 150000, "maxValue": 190000, "unitText": "YEAR"}}
}`

func TestParseJobPostingLD(t *testing.T) {
	html := `<html><head><script type="application/ld+json">` + jobPostingLDFixture +
		`</script></head><body>...</body></html>`
	jp := parseJobPostingLD([]byte(html))
	if jp == nil {
		t.Fatal("parseJobPostingLD returned nil")
	}
	if jp.Title != "Senior Backend Engineer" || jp.EmploymentType != "Full-time" ||
		jp.PostedAt != "2026-05-01" || jp.Location != "San Francisco, CA, US" {
		t.Errorf("fields: %+v", jp)
	}
	if jp.CompRange != "$150K – $190K / year" {
		t.Errorf("comp = %q", jp.CompRange)
	}
	if jp.CompanyName != "Acme Robotics" || jp.CompanyURL != "https://acme.com" {
		t.Errorf("company = %q / %q", jp.CompanyName, jp.CompanyURL)
	}
	if want := "Build our core platform & ship.\n\n- Go\n- SQL"; jp.Description != want {
		t.Errorf("description = %q, want %q", jp.Description, want)
	}
}

// JobPosting nested in an @graph and typed as an array — both common shapes.
func TestParseJobPostingLDGraphAndArrayType(t *testing.T) {
	html := `<script type='application/ld+json'>
	{"@context":"https://schema.org","@graph":[
	  {"@type":"Organization","name":"Ignore Me"},
	  {"@type":["JobPosting"],"title":"Founding Designer",
	   "hiringOrganization":{"name":"Beta","url":"https://beta.io"},
	   "jobLocationType":"TELECOMMUTE",
	   "applicantLocationRequirements":{"@type":"Country","name":"United States"}}
	]}</script>`
	jp := parseJobPostingLD([]byte(html))
	if jp == nil {
		t.Fatal("nil for @graph JobPosting")
	}
	if jp.Title != "Founding Designer" || jp.CompanyName != "Beta" || jp.CompanyURL != "https://beta.io" {
		t.Errorf("fields: %+v", jp)
	}
	if jp.WorkplaceType != "Remote" || jp.Location != "United States" {
		t.Errorf("remote mapping: workplace=%q location=%q", jp.WorkplaceType, jp.Location)
	}
}

// A flat baseSalary value (no min/max range) and a numeric-string bound.
func TestParseJobPostingLDFlatSalary(t *testing.T) {
	html := `<script type="application/ld+json">{"@type":"JobPosting","title":"X",
	  "baseSalary":{"currency":"USD","value":{"value":"60","unitText":"HOUR"}}}</script>`
	jp := parseJobPostingLD([]byte(html))
	if jp == nil || jp.CompRange != "$60 / hour" {
		t.Fatalf("flat salary: %+v", jp)
	}
}

// No usable JobPosting → nil, so Run falls through to the LLM extractor.
func TestParseJobPostingLDNone(t *testing.T) {
	for _, h := range []string{
		`<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>`,
		`<script type="application/ld+json">{"@type":"JobPosting"}</script>`, // no title
		`<script type="application/ld+json">not json</script>`,
		`<html><body>no ld+json here</body></html>`,
	} {
		if jp := parseJobPostingLD([]byte(h)); jp != nil {
			t.Errorf("%s: got %+v, want nil", h, jp)
		}
	}
}

// TestRunResolvesJSONLDWithoutLLM is the feature's contract: a non-ATS job page
// that embeds a JobPosting resolves entirely from the markup, with no Anthropic
// key at all (a keyless Capturer — the extractor would error if reached), and
// the embedded fields land on the posting, the company identified by the hiring
// org's own site. (Question detection's HTML+LLM fallback is the one part that
// still needs a key; with none it cleanly reports unsupported — exercised
// elsewhere — so it can't fire here.)
func TestRunResolvesJSONLDWithoutLLM(t *testing.T) {
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `<html><head><script type="application/ld+json">%s</script></head>`+
			`<body><h1>Senior Backend Engineer</h1>%s</body></html>`,
			jobPostingLDFixture, strings.Repeat("<p>We build robots for warehouses. </p>", 20))
	}))
	t.Cleanup(page.Close)
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	c := &Capturer{DB: db} // no Client: a fully keyless capture

	res, err := c.Run(context.Background(), Request{URL: page.URL + "/careers/eng"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Kind != KindJob {
		t.Fatalf("unexpected result: %+v", res)
	}
	if res.CompanyName != "Acme Robotics" || !res.CompanyCreated {
		t.Errorf("company: %+v", res)
	}
	if !strings.Contains(res.Note, "no LLM") {
		t.Errorf("note: %q", res.Note)
	}
	if res.Posting == nil || res.Posting.Title != "Senior Backend Engineer" ||
		res.Posting.Location != "San Francisco, CA, US" || res.Posting.CompRange != "$150K – $190K / year" {
		t.Errorf("posting: %+v", res.Posting)
	}
	// The company was identified by the JSON-LD hiring org's own domain, not the
	// page host (an httptest 127.0.0.1 address).
	if _, domain, _ := c.DB.GetCompanyName(res.CompanyID); domain != "acme.com" {
		t.Errorf("company domain = %q, want acme.com", domain)
	}
}
