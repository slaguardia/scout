package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/slaguardia/scout/internal/store"
)

func putJSON(t *testing.T, h http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func getJSON(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// PUT outreach_status persists and is reflected in the jobs list; an invalid
// value is a 400 (not 500, not silently ignored).
func TestOutreachStatusAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()
	p, err := s.DB.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	if err != nil {
		t.Fatalf("seed posting: %v", err)
	}

	rec := putJSON(t, h, "/api/postings/"+p.ID, `{"outreach_status":"awaiting"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT awaiting: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var got store.Posting
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.OutreachStatus != "awaiting" {
		t.Fatalf("PUT returned outreach_status=%q, want awaiting", got.OutreachStatus)
	}

	// The jobs list carries it.
	listRec := getJSON(t, h, "/api/postings")
	var list struct {
		Rows []store.JobRow `json:"rows"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode jobs list: %v", err)
	}
	if len(list.Rows) != 1 || list.Rows[0].OutreachStatus != "awaiting" {
		t.Fatalf("jobs list outreach_status not reflected: %+v", list.Rows)
	}

	// Invalid value → 400.
	if rec := putJSON(t, h, "/api/postings/"+p.ID, `{"outreach_status":"ghosted"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid outreach_status: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestFollowUpsAPI(t *testing.T) {
	s, cid := newTestServer(t)
	h := s.Handler()

	// Empty queue → 200 + empty array.
	rec := getJSON(t, h, "/api/follow-ups")
	if rec.Code != http.StatusOK {
		t.Fatalf("empty follow-ups: want 200, got %d", rec.Code)
	}
	var empty struct {
		FollowUps    []store.FollowUpDue `json:"follow_ups"`
		IntervalDays int                 `json:"interval_days"`
		Count        int                 `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &empty); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if empty.FollowUps == nil {
		t.Fatal("follow_ups must be [] not null when empty")
	}
	if empty.IntervalDays != store.DefaultFollowUpIntervalDays {
		t.Fatalf("interval_days = %d, want %d", empty.IntervalDays, store.DefaultFollowUpIntervalDays)
	}

	// A posting awaiting + last outreach 10 days ago shows up as due.
	p, _ := s.DB.AddPosting(cid, "https://acme.com/jobs/se", "SE")
	tenDaysAgo := time.Now().UTC().AddDate(0, 0, -10).Format("2006-01-02")
	if _, err := s.DB.UpdatePostingTracking(p.ID, store.PostingTracking{
		OutreachStatus: "awaiting", OutreachCount: 1, LastOutreachAt: tenDaysAgo,
	}); err != nil {
		t.Fatalf("set awaiting: %v", err)
	}
	rec = getJSON(t, h, "/api/follow-ups")
	var due struct {
		FollowUps []store.FollowUpDue `json:"follow_ups"`
		Count     int                 `json:"count"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &due)
	if due.Count != 1 || len(due.FollowUps) != 1 || due.FollowUps[0].PostingID != p.ID {
		t.Fatalf("expected the awaiting posting to be due, got %+v", due.FollowUps)
	}

	// Marking it replied removes it from the queue.
	if rec := putJSON(t, h, "/api/postings/"+p.ID, `{"outreach_status":"replied","outreach_count":1,"last_outreach_at":"`+tenDaysAgo+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT replied: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	rec = getJSON(t, h, "/api/follow-ups")
	_ = json.Unmarshal(rec.Body.Bytes(), &due)
	if due.Count != 0 {
		t.Fatalf("replied posting still in the queue: %+v", due.FollowUps)
	}
}

func TestFollowUpIntervalAPI(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	// GET default.
	rec := getJSON(t, h, "/api/settings/follow-up-interval")
	var g struct {
		Days int `json:"days"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &g)
	if rec.Code != http.StatusOK || g.Days != store.DefaultFollowUpIntervalDays {
		t.Fatalf("GET interval: want 200/%d, got %d/%d", store.DefaultFollowUpIntervalDays, rec.Code, g.Days)
	}

	// PUT a new value.
	if rec := putJSON(t, h, "/api/settings/follow-up-interval", `{"days":14}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT 14: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	rec = getJSON(t, h, "/api/settings/follow-up-interval")
	_ = json.Unmarshal(rec.Body.Bytes(), &g)
	if g.Days != 14 {
		t.Fatalf("interval after PUT = %d, want 14", g.Days)
	}

	// Non-positive → 400.
	if rec := putJSON(t, h, "/api/settings/follow-up-interval", `{"days":0}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("PUT 0: want 400, got %d", rec.Code)
	}
	// Non-integer → 400.
	if rec := putJSON(t, h, "/api/settings/follow-up-interval", `{"days":3.5}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("PUT 3.5: want 400, got %d", rec.Code)
	}
}
