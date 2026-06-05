package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// TestEditCompanyAPI covers PUT /api/companies/:id: a full-replace edit of the
// hand-editable fields returns the refreshed detail, a blank name is a 400,
// and an unknown id is a 404.
func TestEditCompanyAPI(t *testing.T) {
	s, cid := newTestServer(t) // seeds "Acme" at acme.com
	h := s.Handler()

	put := func(id, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut, "/api/companies/"+id, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Happy path: every editable field lands, headcount parses a range, and the
	// response is the refreshed detail.
	rec := put(cid, `{"name":"Acme Robotics","headcount":"11-50","funding_stage":"Series A","location":"Austin, TX","vertical":"Robotics, AI"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("edit: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var d store.CompanyDetail
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if d.Name != "Acme Robotics" || d.Headcount != 50 || d.FundingStage != "Series A" ||
		d.Location != "Austin, TX" || d.Vertical != "Robotics, AI" {
		t.Errorf("edited detail wrong: %+v", d)
	}
	if d.Domain != "acme.com" {
		t.Errorf("domain must be untouched, got %q", d.Domain)
	}

	// Full replace: blanks clear the optional fields.
	rec = put(cid, `{"name":"Acme Robotics","headcount":"","funding_stage":"","location":"","vertical":""}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("clear: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if d.Headcount != 0 || d.FundingStage != "" || d.Location != "" || d.Vertical != "" {
		t.Errorf("blanks should clear: %+v", d)
	}

	// Blank name → 400.
	if rec := put(cid, `{"name":"  "}`); rec.Code != http.StatusBadRequest {
		t.Errorf("blank name: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Unknown id → 404.
	if rec := put("00000000-0000-0000-0000-000000000000", `{"name":"Ghost"}`); rec.Code != http.StatusNotFound {
		t.Errorf("unknown id: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}
