package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func TestReviewedAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()

	put := func(id, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut,
			"/api/companies/"+id+"/reviewed",
			bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// A fresh company is unreviewed.
	if rows, err := s.DB.TriageRows(); err != nil {
		t.Fatalf("triage: %v", err)
	} else if len(rows) != 1 || rows[0].Reviewed {
		t.Fatalf("seed company should start unreviewed, got %+v", rows)
	}

	// Mark reviewed → 200 and the detail reflects it.
	rec := put(cid, `{"reviewed":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("mark reviewed: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var d store.CompanyDetail
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if !d.Reviewed || d.ReviewedAt == "" {
		t.Errorf("after mark: reviewed=%v at=%q", d.Reviewed, d.ReviewedAt)
	}

	// The triage row now reads reviewed.
	if rows, _ := s.DB.TriageRows(); !rows[0].Reviewed {
		t.Errorf("triage row should be reviewed after mark")
	}

	// Toggle back to new → reviewed clears.
	if rec := put(cid, `{"reviewed":false}`); rec.Code != http.StatusOK {
		t.Fatalf("mark new: want 200, got %d", rec.Code)
	}
	if rows, _ := s.DB.TriageRows(); rows[0].Reviewed {
		t.Errorf("triage row should be unreviewed after toggle back")
	}

	// Unknown company → 404.
	if rec := put("no-such-company-uuid", `{"reviewed":true}`); rec.Code != http.StatusNotFound {
		t.Errorf("bad company: want 404, got %d", rec.Code)
	}

	// Wrong method → 405.
	getReq := httptest.NewRequest(http.MethodGet, "/api/companies/"+cid+"/reviewed", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET reviewed: want 405, got %d", getRec.Code)
	}
}
