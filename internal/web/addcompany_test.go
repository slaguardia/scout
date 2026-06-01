package web

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// TestAddCompanyAPI covers POST /api/companies: a valid add returns 200 and is
// retrievable, a missing website is a 400 (not 500), and a re-add of the same
// domain — including the seed company — is rejected with 409 (never overwritten).
func TestAddCompanyAPI(t *testing.T) {
	s, _ := newTestServer(t) // seeds an "Acme" company at acme.com
	h := s.Handler()

	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/companies", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Happy path → 200, and the row is retrievable by the returned id.
	rec := post(`{"website":"https://www.globex.io/","name":"Globex","vertical":"Fintech"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("add: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var got struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.CompanyID == "" {
		t.Errorf("unexpected response: %+v", got)
	}
	d, err := s.DB.GetCompanyDetail(got.CompanyID)
	if err != nil || d == nil || d.Domain != "globex.io" || d.Source != "manual" {
		t.Errorf("stored company wrong: err=%v detail=%+v", err, d)
	}

	// Missing website → 400, not 500.
	if rec := post(`{"name":"No Website"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("missing website: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Re-add the same domain → 409, and the message names the existing company.
	rec = post(`{"website":"globex.io","location":"NYC"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("re-add: want 409, got %d (%s)", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "Globex") || !strings.Contains(body, "globex.io") {
		t.Errorf("409 body = %q, want it to name Globex (globex.io)", body)
	}

	// A domain already present from another source (the seed) is also rejected.
	if rec := post(`{"website":"acme.com","name":"Acme Reborn"}`); rec.Code != http.StatusConflict {
		t.Errorf("add existing acme.com: want 409, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Wrong method on the collection route → 405.
	req := httptest.NewRequest(http.MethodDelete, "/api/companies", nil)
	mrec := httptest.NewRecorder()
	h.ServeHTTP(mrec, req)
	if mrec.Code != http.StatusMethodNotAllowed {
		t.Errorf("DELETE /api/companies: want 405, got %d", mrec.Code)
	}

	// GET still lists companies (the seed + the two manual adds collapse to 2 distinct).
	greq := httptest.NewRequest(http.MethodGet, "/api/companies", nil)
	grec := httptest.NewRecorder()
	h.ServeHTTP(grec, greq)
	if grec.Code != http.StatusOK {
		t.Fatalf("GET companies: want 200, got %d", grec.Code)
	}
	if n, _ := s.DB.CountCompanies(); n != 2 {
		t.Errorf("companies=%d, want 2 (seed acme.com + globex.io)", n)
	}
}

// TestFacetsAPI checks that GET /api/facets returns distinct funding stages and
// verticals split out of composite "A, B, C" cells, deduped case-insensitively
// across companies, and sorted — the data the Add-company dropdowns consume.
func TestFacetsAPI(t *testing.T) {
	s, _ := newTestServer(t) // seeds Acme with no vertical/stage (excluded)
	seed := func(name, domain, vertical, stage string) {
		if _, err := s.DB.UpsertCompany(store.Company{
			Source:       "test",
			Name:         name,
			Domain:       sql.NullString{String: domain, Valid: true},
			Vertical:     sql.NullString{String: vertical, Valid: vertical != ""},
			FundingStage: sql.NullString{String: stage, Valid: stage != ""},
			RawJSON:      "{}",
		}); err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
	}
	seed("Vapi", "vapi.com", "Artificial Intelligence (AI), Developer Platform, Software", "Series B")
	seed("Armada", "armada.ai", "Artificial Intelligence (AI), Cloud Computing, Software", "Series A")

	req := httptest.NewRequest(http.MethodGet, "/api/facets", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("facets: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var f struct {
		Verticals     []string `json:"verticals"`
		FundingStages []string `json:"funding_stages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &f); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// "Software" + "Artificial Intelligence (AI)" appear in both rows → deduped.
	wantV := []string{"Artificial Intelligence (AI)", "Cloud Computing", "Developer Platform", "Software"}
	if !reflect.DeepEqual(f.Verticals, wantV) {
		t.Errorf("verticals = %v, want %v", f.Verticals, wantV)
	}
	if wantS := []string{"Series A", "Series B"}; !reflect.DeepEqual(f.FundingStages, wantS) {
		t.Errorf("funding_stages = %v, want %v", f.FundingStages, wantS)
	}
}
