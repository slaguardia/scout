package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/capture"
)

func postCapture(t *testing.T, h http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/capture", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCaptureNeedsAPIKey(t *testing.T) {
	s, _ := newTestServer(t) // no Anthropic client configured
	rec := postCapture(t, s.Handler(), `{"url":"https://acme.com/jobs/1"}`)
	if rec.Code != http.StatusPreconditionFailed {
		t.Errorf("want 412 without key, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestCaptureEndToEnd(t *testing.T) {
	// A posting page with enough text to pass the low-content gate.
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "<html><body><h1>Platform Engineer</h1>%s</body></html>",
			strings.Repeat("<p>Acme builds AI infrastructure. </p>", 30))
	}))
	t.Cleanup(page.Close)

	// A fake Anthropic endpoint returning a job-posting extraction.
	ext := `{"kind":"job_posting","company_name":"Acme","company_domain":"acme.com",` +
		`"job_title":"Platform Engineer","job_location":"NYC","summary":"Infra role.",` +
		`"vertical":"AI infra","company_location":""}`
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "msg_1", "model": "test",
			"content":     []map[string]string{{"type": "text", "text": ext}},
			"stop_reason": "end_turn",
		})
	}))
	t.Cleanup(llm.Close)

	s, cid := newTestServer(t) // seeds Acme (acme.com) — capture must attach to it
	s.Anthropic = &anthropic.Client{APIKey: "test-key", Endpoint: llm.URL, HTTP: llm.Client()}
	h := s.Handler()

	// Bad URL → 400.
	if rec := postCapture(t, h, `{"url":"javascript:alert(1)"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad url: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Happy path: the posting attaches to the seeded company (no duplicate row)
	// and the result is echoed back.
	rec := postCapture(t, h, `{"url":"`+page.URL+`/jobs/1"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("capture: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var res capture.Result
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if res.Kind != "job_posting" || res.CompanyCreated || res.CompanyID != cid ||
		res.Posting == nil || res.Posting.Title != "Platform Engineer" {
		t.Errorf("unexpected result: %+v", res)
	}

	// The jobs view now serves the captured posting joined with its company.
	jr := httptest.NewRequest(http.MethodGet, "/api/postings", nil)
	jrec := httptest.NewRecorder()
	h.ServeHTTP(jrec, jr)
	if jrec.Code != http.StatusOK {
		t.Fatalf("postings: want 200, got %d", jrec.Code)
	}
	var jobs struct {
		Rows []struct {
			Company string `json:"company"`
			Title   string `json:"title"`
			Source  string `json:"source"`
		} `json:"rows"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(jrec.Body.Bytes(), &jobs); err != nil {
		t.Fatalf("decode jobs: %v", err)
	}
	if jobs.Count != 1 || jobs.Rows[0].Company != "Acme" ||
		jobs.Rows[0].Title != "Platform Engineer" || jobs.Rows[0].Source != "capture" {
		t.Errorf("unexpected jobs payload: %+v", jobs)
	}
}

func TestAddPostingDirect(t *testing.T) {
	s, cid := newTestServer(t) // seeds Acme (acme.com)
	h := s.Handler()

	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/postings", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// A posting on the company's own site needs no typed company — the link's
	// host identifies it, and it attaches to the seeded row (no duplicate).
	rec := post(`{"url":"https://acme.com/careers/123","title":"SE"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("own-site add: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var res struct {
		CompanyID      string `json:"company_id"`
		CompanyName    string `json:"company_name"`
		CompanyCreated bool   `json:"company_created"`
		Posting        struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"posting"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res.CompanyID != cid || res.CompanyCreated || res.Posting.Title != "SE" {
		t.Errorf("unexpected result: %+v", res)
	}

	// The same link again returns the same posting — idempotent by URL.
	rec = post(`{"url":"https://acme.com/careers/123"}`)
	var again struct {
		Posting struct {
			ID string `json:"id"`
		} `json:"posting"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &again)
	if rec.Code != http.StatusOK || again.Posting.ID != res.Posting.ID {
		t.Errorf("re-add: want same posting, got %d %s", rec.Code, rec.Body.String())
	}

	// An ATS link with a typed company creates the company by name.
	rec = post(`{"url":"https://boards.greenhouse.io/widgets/jobs/1","company":"Widgets"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("ATS+company add: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !res.CompanyCreated || res.CompanyName != "Widgets" {
		t.Errorf("typed company not created: %+v", res)
	}

	// An ATS link with no company named is rejected, and writes nothing.
	before, _ := s.DB.CountCompanies()
	if rec := post(`{"url":"https://boards.greenhouse.io/mystery/jobs/2"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("ATS bare: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if after, _ := s.DB.CountCompanies(); after != before {
		t.Errorf("rejected add wrote a company: %d -> %d", before, after)
	}

	// A bad URL is rejected before any write.
	if rec := post(`{"url":"javascript:alert(1)","company":"Evil"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad url: want 400, got %d", rec.Code)
	}
	if after, _ := s.DB.CountCompanies(); after != before {
		t.Errorf("bad-url add wrote a company: %d -> %d", before, after)
	}
}

func TestCaptureRejectsBadKind(t *testing.T) {
	s, _ := newTestServer(t)
	s.Anthropic = &anthropic.Client{APIKey: "test-key"} // key present; body invalid
	rec := postCapture(t, s.Handler(), `{"url":"https://acme.com","kind":"newsletter"}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("bad kind: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestCaptureFetchFailureIs422(t *testing.T) {
	deadPage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "<html><body>forbidden</body></html>")
	}))
	t.Cleanup(deadPage.Close)

	s, _ := newTestServer(t)
	s.Anthropic = &anthropic.Client{APIKey: "test-key"} // never reached: fetch fails first
	rec := postCapture(t, s.Handler(), `{"url":"`+deadPage.URL+`/jobs/1"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d (%s)", rec.Code, rec.Body.String())
	}
	var body struct {
		FetchStatus string `json:"fetch_status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.FetchStatus != "http_403" {
		t.Errorf("want fetch_status http_403, got %+v (err=%v)", body, err)
	}
}

func TestPostingTrackingAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()

	p, err := s.DB.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}

	put := func(id, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut, "/api/postings/"+id, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Happy path: tracking lands and the refreshed posting comes back.
	rec := put(p.ID, `{"applied_at":"2026-05-22","response":"screening","outreach_count":2,"last_outreach_at":"2026-05-30"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("track: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var got struct {
		AppliedAt     string `json:"applied_at"`
		Response      string `json:"response"`
		OutreachCount int    `json:"outreach_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.AppliedAt != "2026-05-22" || got.Response != "screening" || got.OutreachCount != 2 {
		t.Errorf("unexpected tracking payload: %+v", got)
	}

	// Validation → 400; unknown posting → 404; GET → 405.
	if rec := put(p.ID, `{"response":"ghosted"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad response: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if rec := put("nope", `{}`); rec.Code != http.StatusNotFound {
		t.Errorf("unknown posting: want 404, got %d", rec.Code)
	}
	getReq := httptest.NewRequest(http.MethodGet, "/api/postings/"+p.ID, nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET posting: want 405, got %d", getRec.Code)
	}

	// The jobs view reflects the update.
	jr := httptest.NewRequest(http.MethodGet, "/api/postings", nil)
	jrec := httptest.NewRecorder()
	h.ServeHTTP(jrec, jr)
	var jobs struct {
		Rows []struct {
			AppliedAt string `json:"applied_at"`
			Response  string `json:"response"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(jrec.Body.Bytes(), &jobs); err != nil || len(jobs.Rows) != 1 {
		t.Fatalf("jobs decode: rows=%d err=%v", len(jobs.Rows), err)
	}
	if jobs.Rows[0].AppliedAt != "2026-05-22" || jobs.Rows[0].Response != "screening" {
		t.Errorf("jobs view lifecycle mismatch: %+v", jobs.Rows[0])
	}
}
