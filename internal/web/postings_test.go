package web

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func newTestServer(t *testing.T) (*Server, string) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	cid, err := db.UpsertCompany(store.Company{Source: "test", Name: "Acme", Domain: sql.NullString{String: "acme.com", Valid: true}, RawJSON: "{}"})
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	return &Server{DB: db}, cid
}

func TestPostingsAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()

	post := func(id, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost,
			"/api/companies/"+id+"/postings",
			bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Happy path: returns 200 + the created posting.
	rec := post(cid, `{"url":"https://acme.com/jobs/se","title":"SE"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("add: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var p store.Posting
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatalf("decode posting: %v", err)
	}
	if p.ID == "" || p.URL != "https://acme.com/jobs/se" || p.Title != "SE" {
		t.Errorf("unexpected posting: %+v", p)
	}

	// Empty url → 400.
	if rec := post(cid, `{"url":"  "}`); rec.Code != http.StatusBadRequest {
		t.Errorf("empty url: want 400, got %d", rec.Code)
	}

	// Non-http(s) scheme (XSS vector) → 400, not 500. The store rejects it with
	// a "url "-prefixed validation error the handler maps to a bad request.
	for _, bad := range []string{"javascript:alert(1)", "data:text/html,x", "ftp://x.com/job"} {
		if rec := post(cid, `{"url":"`+bad+`"}`); rec.Code != http.StatusBadRequest {
			t.Errorf("bad-scheme url %q: want 400, got %d (%s)", bad, rec.Code, rec.Body.String())
		}
	}

	// Unknown company → 404.
	if rec := post("no-such-company-uuid", `{"url":"https://x.com/job"}`); rec.Code != http.StatusNotFound {
		t.Errorf("bad company: want 404, got %d", rec.Code)
	}

	// GET wrong method on the postings route → 405.
	getReq := httptest.NewRequest(http.MethodGet, "/api/companies/"+cid+"/postings", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET postings: want 405, got %d", getRec.Code)
	}

	// Detail payload carries the posting.
	detReq := httptest.NewRequest(http.MethodGet, "/api/companies/"+cid, nil)
	detRec := httptest.NewRecorder()
	h.ServeHTTP(detRec, detReq)
	if detRec.Code != http.StatusOK {
		t.Fatalf("detail: want 200, got %d", detRec.Code)
	}
	var detail store.CompanyDetail
	if err := json.Unmarshal(detRec.Body.Bytes(), &detail); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if len(detail.Postings) != 1 || detail.Postings[0].URL != "https://acme.com/jobs/se" {
		t.Errorf("detail postings = %+v", detail.Postings)
	}
}

// TestPostingRecapture covers the network-free contract of the re-enrich
// endpoint: routing, method handling, and the LLM-path key gate. The happy
// path (actual ATS/LLM resolve) needs the network and is not exercised here.
func TestPostingRecapture(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "") // force the no-key state regardless of CI env
	s, cid := newTestServer(t)
	h := s.Handler()
	p, err := s.DB.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}

	do := func(method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Unknown posting → 404.
	if rec := do(http.MethodPost, "/api/postings/no-such-id/recapture"); rec.Code != http.StatusNotFound {
		t.Errorf("unknown posting: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Wrong method → 405.
	if rec := do(http.MethodGet, "/api/postings/"+p.ID+"/recapture"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET recapture: want 405, got %d", rec.Code)
	}

	// A non-ATS link with no key can't run the LLM pass → 412 (precondition).
	if rec := do(http.MethodPost, "/api/postings/"+p.ID+"/recapture"); rec.Code != http.StatusPreconditionFailed {
		t.Errorf("non-ATS recapture without key: want 412, got %d (%s)", rec.Code, rec.Body.String())
	}
}
