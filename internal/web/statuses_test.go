package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func TestStatusConfigAPI(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	get := func(path string) []string {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s: want 200, got %d", path, rec.Code)
		}
		var body struct {
			Statuses []string `json:"statuses"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		return body.Statuses
	}
	put := func(path, body string) int {
		req := httptest.NewRequest(http.MethodPut, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	// Defaults come back when unset.
	if got := get("/api/outreach-statuses"); len(got) != len(store.DefaultOutreachStatuses) || got[0] != "initial contact" {
		t.Fatalf("default outreach statuses = %v", got)
	}
	if got := get("/api/application-stages"); len(got) != len(store.DefaultApplicationStages) || got[0] != "applied" {
		t.Fatalf("default application stages = %v", got)
	}

	// PUT replaces and GET reflects it.
	if code := put("/api/application-stages", `{"statuses":["applied","onsite","offer"]}`); code != http.StatusOK {
		t.Fatalf("PUT stages: want 200, got %d", code)
	}
	if got := get("/api/application-stages"); len(got) != 3 || got[1] != "onsite" {
		t.Fatalf("stages after PUT = %v", got)
	}

	// Empty list → 400.
	if code := put("/api/outreach-statuses", `{"statuses":[]}`); code != http.StatusBadRequest {
		t.Fatalf("empty list: want 400, got %d", code)
	}
}
