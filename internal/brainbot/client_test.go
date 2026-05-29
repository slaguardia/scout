package brainbot

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestServer returns a server whose handler the test supplies, plus a
// Client pointed at it.
func newTestServer(t *testing.T, h http.HandlerFunc) (*httptest.Server, *Client) {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv, New(srv.URL)
}

func TestHealth(t *testing.T) {
	t.Run("ok", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/health" {
				t.Errorf("path = %q, want /health", r.URL.Path)
			}
			io.WriteString(w, `{"ok":true}`)
		})
		if err := c.Health(context.Background()); err != nil {
			t.Fatalf("Health: %v", err)
		}
	})

	t.Run("ok false", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"ok":false}`)
		})
		if err := c.Health(context.Background()); err == nil {
			t.Fatal("Health: want error on ok=false")
		}
	})

	t.Run("5xx", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
		})
		if err := c.Health(context.Background()); err == nil {
			t.Fatal("Health: want error on 503")
		}
	})
}

func TestProfile(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/profile" {
			t.Errorf("path = %q, want /profile", r.URL.Path)
		}
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Errorf("Accept = %q", got)
		}
		io.WriteString(w, `{"count":2,"episodes":[
			{"name":"E1","body":"Alex avoids fintech and crypto.","source":"capture"},
			{"name":"E2","body":"  ","source":"capture"}
		]}`)
	})
	pr, err := c.Profile(context.Background())
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if pr.Count != 2 || len(pr.Episodes) != 2 {
		t.Fatalf("Profile count/episodes = %d/%d", pr.Count, len(pr.Episodes))
	}
	bodies := pr.Bodies()
	if len(bodies) != 1 || !strings.Contains(bodies[0], "avoids fintech") {
		t.Fatalf("Bodies = %v, want one non-empty body", bodies)
	}
}

func TestRecall(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/recall" {
			t.Errorf("path = %q, want /recall", r.URL.Path)
		}
		if q := r.URL.Query().Get("q"); q != "Acme" {
			t.Errorf("q = %q, want Acme", q)
		}
		if l := r.URL.Query().Get("limit"); l != "5" {
			t.Errorf("limit = %q, want 5", l)
		}
		io.WriteString(w, `{"query":"Acme","fact_count":2,"episode_count":1,
			"facts":[
				{"fact":"Acme builds developer tools.","name":"BUILDS","score":0.81,"valid_at":"2026-05-01T00:00:00+00:00","invalid_at":null},
				{"fact":"Acme is in SF.","name":"LOCATED_IN","score":0.32,"valid_at":null,"invalid_at":null}
			],
			"episodes":[{"name":"note","body":"Alex already dismissed Acme last cycle."}]}`)
	})
	rr, err := c.Recall(context.Background(), "Acme", 5)
	if err != nil {
		t.Fatalf("Recall: %v", err)
	}
	if rr.Query != "Acme" || len(rr.Facts) != 2 || len(rr.Episodes) != 1 {
		t.Fatalf("Recall shape: query=%q facts=%d episodes=%d", rr.Query, len(rr.Facts), len(rr.Episodes))
	}
	if rr.Facts[0].Score != 0.81 || rr.Facts[0].Name != "BUILDS" {
		t.Fatalf("fact[0] = %+v", rr.Facts[0])
	}
	if b := rr.Bodies(); len(b) != 1 || !strings.Contains(b[0], "dismissed Acme") {
		t.Fatalf("recall Bodies = %v", b)
	}
}

func TestRecallNoLimit(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.URL.Query()["limit"]; ok {
			t.Errorf("limit should be omitted when <= 0, got %q", r.URL.Query().Get("limit"))
		}
		io.WriteString(w, `{"query":"x","facts":[],"episodes":[]}`)
	})
	if _, err := c.Recall(context.Background(), "x", 0); err != nil {
		t.Fatalf("Recall: %v", err)
	}
}

func TestNon2xxCarriesErrorDetail(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		io.WriteString(w, `{"error":"q is required"}`)
	})
	_, err := c.Recall(context.Background(), "", 5)
	if err == nil {
		t.Fatal("Recall: want error on 400")
	}
	if !strings.Contains(err.Error(), "q is required") {
		t.Fatalf("error should carry body detail, got %v", err)
	}
}

func TestCriteria(t *testing.T) {
	t.Run("from profile bodies", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/profile" {
				t.Fatalf("should only hit /profile, got %s", r.URL.Path)
			}
			io.WriteString(w, `{"count":2,"episodes":[
				{"name":"A","body":"Alex wants dev-tools / AI infra roles."},
				{"name":"B","body":"Hard no: crypto, legal tech, insurance."}
			]}`)
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		if !strings.Contains(text, "AI infra") || !strings.Contains(text, "Hard no: crypto") {
			t.Fatalf("Criteria text missing bodies: %q", text)
		}
		if !strings.Contains(text, "\n\n") {
			t.Fatalf("bodies should be joined by blank line: %q", text)
		}
	})

	t.Run("falls back to recall when profile empty", func(t *testing.T) {
		var hitRecall bool
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/profile":
				io.WriteString(w, `{"count":0,"episodes":[]}`)
			case "/recall":
				hitRecall = true
				io.WriteString(w, `{"query":"x","facts":[],"episodes":[{"name":"c","body":"Alex avoids fintech."}]}`)
			default:
				t.Fatalf("unexpected path %s", r.URL.Path)
			}
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		if !hitRecall {
			t.Fatal("expected recall fallback when profile empty")
		}
		if !strings.Contains(text, "avoids fintech") {
			t.Fatalf("Criteria fallback text = %q", text)
		}
	})

	t.Run("empty brain yields empty text, no error", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/profile":
				io.WriteString(w, `{"count":0,"episodes":[]}`)
			case "/recall":
				io.WriteString(w, `{"query":"x","facts":[],"episodes":[]}`)
			}
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		if strings.TrimSpace(text) != "" {
			t.Fatalf("empty brain should yield empty criteria, got %q", text)
		}
	})
}

func TestDisabledClient(t *testing.T) {
	c := New("")
	if c.Enabled() {
		t.Fatal("empty base URL should be disabled")
	}
	if err := c.Health(context.Background()); err == nil {
		t.Fatal("disabled client Health should error")
	}
	if _, err := c.Profile(context.Background()); err == nil {
		t.Fatal("disabled client Profile should error")
	}
	if _, err := c.Recall(context.Background(), "x", 5); err == nil {
		t.Fatal("disabled client Recall should error")
	}
}

func TestNewTrimsTrailingSlash(t *testing.T) {
	c := New("http://example.com:8100/")
	if c.BaseURL != "http://example.com:8100" {
		t.Fatalf("BaseURL = %q, want trailing slash trimmed", c.BaseURL)
	}
}
