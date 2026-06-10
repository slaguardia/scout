package web

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/criteria"
	"github.com/slaguardia/scout/internal/distill"
	"github.com/slaguardia/scout/internal/store"
)

// brainStateStub serves /health + /changes for the profile-state tests. /changes
// reports changed=true unless `since` already equals cursor (the real contract).
func brainStateStub(t *testing.T, cursor string, healthOK, changesOK bool) *brainbot.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			if !healthOK {
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			}
			io.WriteString(w, `{"ok":true}`)
		case "/changes":
			if !changesOK {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			since := r.URL.Query().Get("since")
			fmt.Fprintf(w, `{"cursor":%q,"changed":%v}`, cursor, since != cursor)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return brainbot.New(srv.URL)
}

func profileServer(t *testing.T, bc *brainbot.Client) *Server {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	// Distiller is non-nil so Resolver.Cached() reads the row; it is never invoked
	// by the read-only profile path.
	r := &criteria.Resolver{Brain: bc, Distiller: &distill.Distiller{Brain: bc}, Store: db, TTL: time.Hour}
	return &Server{DB: db, Brainbot: bc, Resolver: r}
}

// TestCriteriaStateTriState drives the three display states the panel renders and
// confirms the old age>=TTL "stale" boolean is gone.
func TestCriteriaStateTriState(t *testing.T) {
	t.Run("current — probe reports no change", func(t *testing.T) {
		bc := brainStateStub(t, "cur-1", true, true)
		s := profileServer(t, bc)
		if err := s.DB.PutBrainProfile(bc.BaseURL, "BRIEF", "h", "cur-1"); err != nil { // cursor matches
			t.Fatal(err)
		}
		out := s.profilePayload(context.Background(), false)
		if out["criteria_state"] != "current" {
			t.Fatalf("criteria_state = %v, want current", out["criteria_state"])
		}
		if _, ok := out["stale"]; ok {
			t.Fatal("the old 'stale' boolean must be gone")
		}
		if _, ok := out["verified_age_seconds"]; !ok {
			t.Fatal("verified_age_seconds should be exposed")
		}
	})

	t.Run("changed — probe reports the brain moved", func(t *testing.T) {
		bc := brainStateStub(t, "cur-NEW", true, true)
		s := profileServer(t, bc)
		if err := s.DB.PutBrainProfile(bc.BaseURL, "BRIEF", "h", "cur-OLD"); err != nil { // cursor differs
			t.Fatal(err)
		}
		out := s.profilePayload(context.Background(), false)
		if out["criteria_state"] != "changed" {
			t.Fatalf("criteria_state = %v, want changed", out["criteria_state"])
		}
	})

	t.Run("unverified — brain unreachable and cache past the ceiling", func(t *testing.T) {
		bc := brainStateStub(t, "cur-1", false, false) // health + changes both fail
		s := profileServer(t, bc)
		if err := s.DB.PutBrainProfile(bc.BaseURL, "BRIEF", "h", "cur-1"); err != nil {
			t.Fatal(err)
		}
		// Age it past the TTL ceiling so an unverifiable cache reads unverified.
		if _, err := s.DB.Exec(`UPDATE brain_profile_cache SET verified_at = datetime('now','-10 hours'), fetched_at = datetime('now','-10 hours') WHERE source_url = ?`, bc.BaseURL); err != nil {
			t.Fatal(err)
		}
		out := s.profilePayload(context.Background(), false)
		if out["criteria_state"] != "unverified" {
			t.Fatalf("criteria_state = %v, want unverified", out["criteria_state"])
		}
	})

	t.Run("unverified — a pre-0037 row has no cursor", func(t *testing.T) {
		bc := brainStateStub(t, "cur-1", true, true)
		s := profileServer(t, bc)
		// Legacy row: no cursor, verified_at NULL.
		if _, err := s.DB.Exec(`INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at) VALUES (?, 'BRIEF', 'h', CURRENT_TIMESTAMP)`, bc.BaseURL); err != nil {
			t.Fatal(err)
		}
		out := s.profilePayload(context.Background(), false)
		if out["criteria_state"] != "unverified" {
			t.Fatalf("criteria_state = %v, want unverified (no cursor)", out["criteria_state"])
		}
	})
}

// TestCriteriaStatePureDeriver locks the classification table directly.
func TestCriteriaStatePureDeriver(t *testing.T) {
	const ttl = time.Hour
	cases := []struct {
		name             string
		cursorPresent    bool
		verifiedAge, age int64
		changed, probed  bool
		want             string
	}{
		{"probe says unchanged", true, 10, 10, false, true, "current"},
		{"probe says changed", true, 10, 10, true, true, "changed"},
		{"no probe, within ceiling", true, 60, 60, false, false, "current"},
		{"no probe, past ceiling", true, 7200, 7200, false, false, "unverified"},
		{"no cursor", false, 10, 10, false, false, "unverified"},
		{"never verified (sentinel)", true, -1, 10, false, true, "unverified"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := criteriaState(c.cursorPresent, c.verifiedAge, c.age, ttl, c.changed, c.probed)
			if got != c.want {
				t.Fatalf("criteriaState = %q, want %q", got, c.want)
			}
		})
	}
}
