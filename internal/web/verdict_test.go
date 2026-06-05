package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func TestManualVerdictAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()

	put := func(id, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPut,
			"/api/companies/"+id+"/verdict",
			bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	// Happy path: returns 200 + the refreshed detail, stamped model "manual".
	rec := put(cid, `{"verdict":"no","reason":"crypto wallet (excluded)"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("set: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var d store.CompanyDetail
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if !d.HasVerdict || d.Verdict != "no" || d.Reason != "crypto wallet (excluded)" {
		t.Errorf("unexpected verdict: has=%v v=%q r=%q", d.HasVerdict, d.Verdict, d.Reason)
	}
	if d.Model != store.ManualModel {
		t.Errorf("model = %q, want %q", d.Model, store.ManualModel)
	}

	// Verdict is normalized to lower case and the row is overwritten in place.
	if rec := put(cid, `{"verdict":"YES","reason":""}`); rec.Code != http.StatusOK {
		t.Fatalf("override: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	v, err := s.DB.GetVerdict(cid)
	if err != nil || v == nil {
		t.Fatalf("get verdict: %v (nil=%v)", err, v == nil)
	}
	if v.Verdict != "yes" || v.Model != store.ManualModel {
		t.Errorf("after override: v=%q model=%q", v.Verdict, v.Model)
	}

	// Each call appends a decision-trail row (two calls → two rows).
	events, err := s.DB.CompanyTrace(cid)
	if err != nil {
		t.Fatalf("trace: %v", err)
	}
	if len(events) != 2 {
		t.Errorf("trace rows = %d, want 2", len(events))
	}

	// Each call also appends a durable override row. The two calls form a
	// timeline: (unscored → no), then (no → yes).
	var overrideCount int
	if err := s.DB.QueryRow(`SELECT COUNT(1) FROM verdict_override WHERE company_id = ?`, cid).
		Scan(&overrideCount); err != nil {
		t.Fatalf("count overrides: %v", err)
	}
	if overrideCount != 2 {
		t.Errorf("override rows = %d, want 2", overrideCount)
	}
	// The first override had no prior verdict (from NULL); the latest records the
	// no → yes delta with the criteria version stamped.
	var from, to, version string
	if err := s.DB.QueryRow(
		`SELECT COALESCE(from_verdict,''), to_verdict, COALESCE(criteria_version,'')
		   FROM verdict_override WHERE company_id = ? ORDER BY id DESC LIMIT 1`, cid,
	).Scan(&from, &to, &version); err != nil {
		t.Fatalf("read latest override: %v", err)
	}
	if from != "no" || to != "yes" {
		t.Errorf("latest override delta = %q → %q, want no → yes", from, to)
	}

	// Invalid verdict value → 400.
	for _, bad := range []string{`{"verdict":"strong-yes"}`, `{"verdict":""}`, `{"reason":"x"}`} {
		if rec := put(cid, bad); rec.Code != http.StatusBadRequest {
			t.Errorf("bad verdict %q: want 400, got %d", bad, rec.Code)
		}
	}

	// Unknown company → 404 (no dangling verdict).
	if rec := put("no-such-company-uuid", `{"verdict":"yes"}`); rec.Code != http.StatusNotFound {
		t.Errorf("bad company: want 404, got %d", rec.Code)
	}

	// Wrong method → 405.
	getReq := httptest.NewRequest(http.MethodGet, "/api/companies/"+cid+"/verdict", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET verdict: want 405, got %d", getRec.Code)
	}
}
