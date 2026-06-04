package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func TestFlaggedAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()

	put := func(id, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut,
			"/api/companies/"+id+"/flagged",
			bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// A fresh company starts unflagged.
	if rows, err := s.DB.TriageRows(); err != nil {
		t.Fatalf("triage: %v", err)
	} else if len(rows) != 1 || rows[0].Flagged {
		t.Fatalf("seed company should start unflagged, got %+v", rows)
	}

	// Flag → 200, detail and triage row reflect it.
	rec := put(cid, `{"flagged":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("flag: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var d store.CompanyDetail
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if !d.Flagged || d.FlaggedAt == "" {
		t.Errorf("after flag: flagged=%v at=%q", d.Flagged, d.FlaggedAt)
	}
	if rows, _ := s.DB.TriageRows(); !rows[0].Flagged {
		t.Errorf("triage row should be flagged")
	}

	// Unflag → cleared.
	if rec := put(cid, `{"flagged":false}`); rec.Code != http.StatusOK {
		t.Fatalf("unflag: want 200, got %d", rec.Code)
	}
	if rows, _ := s.DB.TriageRows(); rows[0].Flagged {
		t.Errorf("triage row should be unflagged")
	}

	// Unknown company → 404.
	if rec := put("no-such-company-uuid", `{"flagged":true}`); rec.Code != http.StatusNotFound {
		t.Errorf("bad company: want 404, got %d", rec.Code)
	}

	// Wrong method → 405.
	getReq := httptest.NewRequest(http.MethodGet, "/api/companies/"+cid+"/flagged", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET flagged: want 405, got %d", getRec.Code)
	}

	// The reviewed route is gone → 404.
	revReq := httptest.NewRequest(http.MethodPut, "/api/companies/"+cid+"/reviewed",
		bytes.NewBufferString(`{"reviewed":true}`))
	revRec := httptest.NewRecorder()
	h.ServeHTTP(revRec, revReq)
	if revRec.Code != http.StatusNotFound {
		t.Errorf("PUT reviewed: want 404 (removed), got %d", revRec.Code)
	}
}
