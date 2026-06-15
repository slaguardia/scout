package capture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

func TestParseExtraction(t *testing.T) {
	clean := `{"kind":"job_posting","company_name":"Acme","company_domain":"acme.com","job_title":"SE","job_location":"SF","summary":"Sells things.","vertical":"AI","company_location":""}`

	for name, raw := range map[string]string{
		"clean":    clean,
		"fenced":   "```json\n" + clean + "\n```",
		"preamble": "Here is the JSON:\n" + clean,
		"caps":     strings.Replace(clean, "job_posting", "JOB_POSTING", 1),
	} {
		e, err := parseExtraction(raw)
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if e.Kind != KindJob || e.CompanyName != "Acme" || e.JobTitle != "SE" {
			t.Errorf("%s: unexpected extraction %+v", name, e)
		}
	}

	for name, raw := range map[string]string{
		"empty":    "",
		"prose":    "I cannot classify this page.",
		"bad kind": `{"kind":"newsletter"}`,
	} {
		if _, err := parseExtraction(raw); err == nil {
			t.Errorf("%s: want parse error", name)
		}
	}
}

func TestResolveCompanyDomain(t *testing.T) {
	cases := []struct {
		extracted, pasted, final, want string
	}{
		// LLM value wins when real.
		{"acme.com", "https://boards.greenhouse.io/acme/jobs/1", "https://boards.greenhouse.io/acme/jobs/1", "acme.com"},
		// ATS host extracted by mistake → fall through; ATS page host → nothing.
		{"greenhouse.io", "https://boards.greenhouse.io/acme/jobs/1", "https://boards.greenhouse.io/acme/jobs/1", ""},
		// Posting hosted on the company's own site → host identifies it.
		{"", "https://acme.com/careers/123", "https://www.acme.com/careers/123", "acme.com"},
		// Aggregators (ingest's list) rejected the same way.
		{"linkedin.com", "https://www.linkedin.com/jobs/view/1", "https://www.linkedin.com/jobs/view/1", ""},
		// Suffix-matched ATS subdomains.
		{"acme.ashbyhq.com", "https://jobs.ashbyhq.com/acme/1", "https://jobs.ashbyhq.com/acme/1", ""},
	}
	for _, c := range cases {
		if got := resolveCompanyDomain(c.extracted, c.pasted, c.final); got != c.want {
			t.Errorf("resolveCompanyDomain(%q, %q, %q) = %q, want %q", c.extracted, c.pasted, c.final, got, c.want)
		}
	}
}

// fakeAnthropic serves a canned extraction for every /v1/messages call.
func fakeAnthropic(t *testing.T, ext extraction) *httptest.Server {
	t.Helper()
	body, _ := json.Marshal(ext)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"id": "msg_1", "model": "test",
			"content":     []map[string]string{{"type": "text", "text": string(body)}},
			"stop_reason": "end_turn",
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// jobPage serves a plausible posting page with enough text to pass the
// low-content gate.
func jobPage(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "<html><body><h1>Solutions Engineer</h1>%s</body></html>",
			strings.Repeat("<p>Acme builds AI infrastructure for ML platform teams. </p>", 20))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newCapturer(t *testing.T, llm *httptest.Server) *Capturer {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return &Capturer{
		DB:     db,
		Client: &anthropic.Client{APIKey: "test-key", Endpoint: llm.URL, HTTP: llm.Client()},
	}
}

func TestRunCapturesJobPosting(t *testing.T) {
	page := jobPage(t)
	llm := fakeAnthropic(t, extraction{
		Kind: KindJob, CompanyName: "Acme", CompanyDomain: "acme.com",
		JobTitle: "Solutions Engineer", JobLocation: "SF / remote",
		Vertical: "AI infra",
	})
	c := newCapturer(t, llm)

	res, err := c.Run(context.Background(), Request{URL: page.URL + "/jobs/1"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Kind != KindJob || res.FetchStatus != "ok" {
		t.Fatalf("unexpected result: %+v", res)
	}
	if res.CompanyID == "" || !res.CompanyCreated || res.CompanyName != "Acme" {
		t.Errorf("company not created: %+v", res)
	}
	if res.Posting == nil || res.Posting.Title != "Solutions Engineer" ||
		res.Posting.Location != "SF / remote" || res.Posting.Source != "capture" {
		t.Errorf("unexpected posting: %+v", res.Posting)
	}
	// The non-ATS path keeps the fetched page text as the posting body (no LLM
	// blurb) — it's what outreach/chat read.
	if res.Posting != nil && !strings.Contains(res.Posting.Description, "AI infrastructure") {
		t.Errorf("posting description not seeded from page text: %q", res.Posting.Description)
	}
	// The company row landed under the extracted domain.
	if res.CompanyID != store.CompanyID("acme.com", "Acme") {
		t.Errorf("company keyed wrong: %q", res.CompanyID)
	}

	// Same link again → refresh, not duplicate; company already known.
	res2, err := c.Run(context.Background(), Request{URL: page.URL + "/jobs/1"})
	if err != nil {
		t.Fatalf("Run twice: %v", err)
	}
	if res2.CompanyCreated || !res2.PostingUpdated || res2.Posting.ID != res.Posting.ID {
		t.Errorf("re-capture: %+v", res2)
	}
	if rows, _ := c.DB.ListJobRows(); len(rows) != 1 {
		t.Errorf("want 1 job row, got %d", len(rows))
	}
}

func TestRunCapturesCompanyPage(t *testing.T) {
	page := jobPage(t)
	llm := fakeAnthropic(t, extraction{
		Kind: KindCompany, CompanyName: "Acme", CompanyDomain: "acme.com",
		Vertical: "AI infra", CompanyLocation: "San Francisco",
	})
	c := newCapturer(t, llm)

	res, err := c.Run(context.Background(), Request{URL: page.URL + "/about"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Kind != KindCompany || !res.CompanyCreated || res.Posting != nil {
		t.Fatalf("unexpected result: %+v", res)
	}
	// The fetched page text seeded the enrichment row, so the next verdict run
	// can score the company without a separate Enrich pass.
	e, err := c.DB.GetEnrichment(res.CompanyID)
	if err != nil || e == nil {
		t.Fatalf("enrichment not seeded: e=%v err=%v", e, err)
	}
	if e.FetchStatus != "ok" || !strings.Contains(e.WebsiteSummary.String, "AI infrastructure") {
		t.Errorf("unexpected seeded enrichment: %+v", e)
	}
}

func TestRunOtherKindWritesNothing(t *testing.T) {
	page := jobPage(t)
	llm := fakeAnthropic(t, extraction{Kind: KindOther})
	c := newCapturer(t, llm)

	res, err := c.Run(context.Background(), Request{URL: page.URL})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Kind != KindOther || res.CompanyID != "" || res.Note == "" {
		t.Errorf("unexpected result: %+v", res)
	}
	if n, _ := c.DB.CountCompanies(); n != 0 {
		t.Errorf("kind=other wrote %d companies", n)
	}
}

func TestRunPinnedKindOverridesClassifier(t *testing.T) {
	// The extractor says "other" (a JS shell, say) but the user toggled "job"
	// in the Add dialog — the pin wins, and the typed fields fill what the
	// extraction couldn't.
	page := jobPage(t)
	llm := fakeAnthropic(t, extraction{Kind: KindOther})
	c := newCapturer(t, llm)

	res, err := c.Run(context.Background(), Request{
		URL:    page.URL + "/jobs/1",
		Kind:   KindJob,
		Fields: Fields{Name: "Acme", Title: "Solutions Engineer"},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Kind != KindJob || res.CompanyID == "" || !res.CompanyCreated {
		t.Fatalf("pinned kind ignored: %+v", res)
	}
	if res.Posting == nil || res.Posting.Title != "Solutions Engineer" {
		t.Errorf("typed title lost: %+v", res.Posting)
	}
}

func TestRunUserFieldsWinOverExtraction(t *testing.T) {
	page := jobPage(t)
	llm := fakeAnthropic(t, extraction{
		Kind: KindCompany, CompanyName: "Acme Robotics", CompanyDomain: "acme.com",
		Vertical: "robots", CompanyLocation: "Austin",
	})
	c := newCapturer(t, llm)

	res, err := c.Run(context.Background(), Request{
		URL:  page.URL + "/about",
		Kind: KindCompany,
		Fields: Fields{
			Name: "Acme", Location: "NYC", Vertical: "AI infra",
			Headcount: "250", FundingStage: "Series B",
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.CompanyName != "Acme" {
		t.Errorf("typed name lost: %+v", res)
	}
	d, err := c.DB.GetCompanyDetail(res.CompanyID)
	if err != nil || d == nil {
		t.Fatalf("detail: d=%v err=%v", d, err)
	}
	if d.Location != "NYC" || d.Vertical != "AI infra" ||
		d.Headcount != 250 || d.FundingStage != "Series B" {
		t.Errorf("typed fields didn't reach the row: location=%q vertical=%q headcount=%d stage=%q",
			d.Location, d.Vertical, d.Headcount, d.FundingStage)
	}
}

func TestRunFetchFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "<html><body>forbidden</body></html>")
	}))
	t.Cleanup(srv.Close)
	llm := fakeAnthropic(t, extraction{Kind: KindJob})
	c := newCapturer(t, llm)

	res, err := c.Run(context.Background(), Request{URL: srv.URL + "/jobs/1"})
	var fe FetchError
	if !errors.As(err, &fe) || fe.Status != "http_403" {
		t.Fatalf("want FetchError http_403, got %v", err)
	}
	if res == nil || res.FetchStatus != "http_403" {
		t.Errorf("unexpected result: %+v", res)
	}
}

func TestRunBadURL(t *testing.T) {
	c := newCapturer(t, fakeAnthropic(t, extraction{Kind: KindOther}))
	for _, bad := range []string{"", "   ", "javascript:alert(1)", "ftp://x.com/j", "not a url"} {
		_, err := c.Run(context.Background(), Request{URL: bad})
		if err == nil || !strings.HasPrefix(err.Error(), "url ") {
			t.Errorf("Run(%q): want url-prefixed error, got %v", bad, err)
		}
	}
}
