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
		io.WriteString(w, `{"count":2,"facts":[
			{"fact":"The user avoids fintech and crypto.","polarity":"negative","strength":"hard","valid_at":"2026-05-01T00:00:00+00:00","name":"ASSERTS"},
			{"fact":"The user worked at Acme as an engineer.","polarity":null,"strength":null,"valid_at":null,"name":"WORKED_AT"}
		]}`)
	})
	pr, err := c.Profile(context.Background())
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if pr.Count != 2 || len(pr.Facts) != 2 {
		t.Fatalf("Profile count/facts = %d/%d", pr.Count, len(pr.Facts))
	}
	if pr.Facts[0].Polarity != "negative" || pr.Facts[0].Strength != "hard" {
		t.Fatalf("fact[0] stance = %q/%q, want negative/hard", pr.Facts[0].Polarity, pr.Facts[0].Strength)
	}
	if !strings.Contains(pr.Facts[0].Fact, "avoids fintech") {
		t.Fatalf("fact[0] = %q", pr.Facts[0].Fact)
	}
	// A null-stance biographical fact decodes to empty polarity/strength.
	if pr.Facts[1].Polarity != "" || pr.Facts[1].Strength != "" {
		t.Fatalf("fact[1] stance = %q/%q, want empty/empty", pr.Facts[1].Polarity, pr.Facts[1].Strength)
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
		io.WriteString(w, `{"query":"Acme","fact_count":2,
			"facts":[
				{"fact":"Acme builds developer tools.","name":"BUILDS","score":0.81,"polarity":"positive","strength":"soft","valid_at":"2026-05-01T00:00:00+00:00","invalid_at":null},
				{"fact":"Acme is in SF.","name":"LOCATED_IN","score":0.32,"polarity":null,"strength":null,"valid_at":null,"invalid_at":null}
			]}`)
	})
	rr, err := c.Recall(context.Background(), "Acme", 5)
	if err != nil {
		t.Fatalf("Recall: %v", err)
	}
	if rr.Query != "Acme" || len(rr.Facts) != 2 || rr.FactCount != 2 {
		t.Fatalf("Recall shape: query=%q facts=%d fact_count=%d", rr.Query, len(rr.Facts), rr.FactCount)
	}
	if rr.Facts[0].Score != 0.81 || rr.Facts[0].Name != "BUILDS" {
		t.Fatalf("fact[0] = %+v", rr.Facts[0])
	}
	if rr.Facts[0].Polarity != "positive" || rr.Facts[0].Strength != "soft" {
		t.Fatalf("fact[0] stance = %q/%q, want positive/soft", rr.Facts[0].Polarity, rr.Facts[0].Strength)
	}
}

func TestRecallNoLimit(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.URL.Query()["limit"]; ok {
			t.Errorf("limit should be omitted when <= 0, got %q", r.URL.Query().Get("limit"))
		}
		io.WriteString(w, `{"query":"x","facts":[]}`)
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
	t.Run("renders grouped block from facts", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/profile" {
				t.Fatalf("should only hit /profile, got %s", r.URL.Path)
			}
			io.WriteString(w, `{"count":5,"facts":[
				{"fact":"only consider roles in the SF Bay Area","polarity":"positive","strength":"hard","name":"ASSERTS"},
				{"fact":"excludes fintech","polarity":"negative","strength":"hard","name":"ASSERTS"},
				{"fact":"values being customer-facing","polarity":"positive","strength":"soft","name":"ASSERTS"},
				{"fact":"less interested in horizontal dev tooling","polarity":"negative","strength":"soft","name":"ASSERTS"},
				{"fact":"worked at Acme as an engineer","polarity":null,"strength":null,"name":"WORKED_AT"}
			]}`)
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}

		// All three section headers present.
		for _, header := range []string{
			"HARD REQUIREMENTS / DEALBREAKERS",
			"PREFERENCES (weigh, don't gate):",
			"CONTEXT (background, not a filter):",
		} {
			if !strings.Contains(text, header) {
				t.Fatalf("missing header %q in:\n%s", header, text)
			}
		}

		// Each fact lands under the right tag.
		wantLines := []string{
			"- [requires] only consider roles in the SF Bay Area",
			"- [excludes] excludes fintech",
			"- [seeks] values being customer-facing",
			"- [avoids] less interested in horizontal dev tooling",
			"- worked at Acme as an engineer",
		}
		for _, line := range wantLines {
			if !strings.Contains(text, line) {
				t.Fatalf("missing line %q in:\n%s", line, text)
			}
		}

		// Hard gates must precede preferences, which precede context.
		idxHard := strings.Index(text, "HARD REQUIREMENTS")
		idxPref := strings.Index(text, "PREFERENCES")
		idxCtx := strings.Index(text, "CONTEXT")
		if !(idxHard < idxPref && idxPref < idxCtx) {
			t.Fatalf("section order wrong: hard=%d pref=%d ctx=%d\n%s", idxHard, idxPref, idxCtx, text)
		}

		// The biographical fact is context, not a gate: it must NOT be tagged.
		if strings.Contains(text, "[gate] worked at Acme") {
			t.Fatalf("null-strength fact should be untagged context, got:\n%s", text)
		}
	})

	t.Run("empty brain yields empty text, no error (no recall call)", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/profile" {
				t.Fatalf("empty brain must only hit /profile (no recall fallback), got %s", r.URL.Path)
			}
			io.WriteString(w, `{"count":0,"facts":[]}`)
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		if strings.TrimSpace(text) != "" {
			t.Fatalf("empty brain should yield empty criteria, got %q", text)
		}
	})

	t.Run("profile fetch error surfaces", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
			io.WriteString(w, `{"error":"profile backend down"}`)
		})
		text, err := c.Criteria(context.Background())
		if err == nil {
			t.Fatal("expected error when /profile fails")
		}
		if !strings.Contains(err.Error(), "profile backend down") {
			t.Fatalf("error should carry profile detail, got %v", err)
		}
		if text != "" {
			t.Fatalf("failed profile should yield empty text, got %q", text)
		}
	})

	t.Run("polarity without strength is a preference, not context", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"count":3,"facts":[
				{"fact":"avoids crypto","polarity":"negative","strength":null,"name":"ASSERTS"},
				{"fact":"values mission-driven teams","polarity":"positive","strength":null,"name":"ASSERTS"},
				{"fact":"holds Secret-level clearance","polarity":null,"strength":null,"name":"ASSERTS"}
			]}`)
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		// Stance-with-null-strength keeps its seek/avoid signal in PREFERENCES.
		for _, line := range []string{
			"- [avoids] avoids crypto",
			"- [seeks] values mission-driven teams",
		} {
			if !strings.Contains(text, line) {
				t.Fatalf("missing preference line %q in:\n%s", line, text)
			}
		}
		// A genuinely neutral null/null fact is still untagged CONTEXT.
		if !strings.Contains(text, "- holds Secret-level clearance") {
			t.Fatalf("neutral fact should be context, got:\n%s", text)
		}
		// The stance facts must NOT be demoted to CONTEXT.
		ctx := text[strings.Index(text, "CONTEXT"):]
		if strings.Contains(ctx, "crypto") || strings.Contains(ctx, "mission-driven") {
			t.Fatalf("stance facts leaked into CONTEXT:\n%s", text)
		}
	})

	t.Run("duplicate facts collapse to one line", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"count":2,"facts":[
				{"fact":"avoids pure infrastructure work","polarity":"negative","strength":"soft","name":"ASSERTS"},
				{"fact":"avoids pure infrastructure work","polarity":"negative","strength":"soft","name":"ASSERTS"}
			]}`)
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		if n := strings.Count(text, "avoids pure infrastructure work"); n != 1 {
			t.Fatalf("duplicate brain fact should render once, got %d:\n%s", n, text)
		}
	})

	t.Run("strength/polarity casing is normalized", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"count":2,"facts":[
				{"fact":"excludes fintech","polarity":"NEGATIVE","strength":"Hard","name":"ASSERTS"},
				{"fact":"prefers small teams","polarity":"Positive","strength":"SOFT","name":"ASSERTS"}
			]}`)
		})
		text, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		if !strings.Contains(text, "HARD REQUIREMENTS") || !strings.Contains(text, "- [excludes] excludes fintech") {
			t.Fatalf("upper-case Hard/NEGATIVE should bucket as hard exclusion:\n%s", text)
		}
		if !strings.Contains(text, "- [seeks] prefers small teams") {
			t.Fatalf("upper-case SOFT/Positive should bucket as soft seek:\n%s", text)
		}
	})

	t.Run("rendered block is deterministic across calls", func(t *testing.T) {
		body := `{"count":4,"facts":[
			{"fact":"only consider Bay Area","polarity":"positive","strength":"hard","name":"ASSERTS"},
			{"fact":"avoids crypto","polarity":"negative","strength":"soft","name":"ASSERTS"},
			{"fact":"worked at Acme","polarity":null,"strength":null,"name":"ASSERTS"},
			{"fact":"excludes fintech","polarity":"negative","strength":"hard","name":"ASSERTS"}
		]}`
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, body)
		})
		first, err := c.Criteria(context.Background())
		if err != nil {
			t.Fatalf("Criteria: %v", err)
		}
		for i := 0; i < 5; i++ {
			again, err := c.Criteria(context.Background())
			if err != nil {
				t.Fatalf("Criteria: %v", err)
			}
			if again != first {
				t.Fatalf("renderFacts not deterministic:\n--- first ---\n%s\n--- again ---\n%s", first, again)
			}
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
