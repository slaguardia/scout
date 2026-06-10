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

func TestRecall(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/recall" {
			t.Errorf("path = %q, want /recall", r.URL.Path)
		}
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Errorf("Accept = %q", got)
		}
		if q := r.URL.Query().Get("q"); q != "what does the user want" {
			t.Errorf("q = %q", q)
		}
		if k := r.URL.Query().Get("k"); k != "5" {
			t.Errorf("k = %q, want 5", k)
		}
		// Scope must never be sent — recall(query) is the whole interface.
		if _, ok := r.URL.Query()["scope"]; ok {
			t.Errorf("scope must never be sent, got %q", r.URL.Query().Get("scope"))
		}
		io.WriteString(w, `{"chunks":[
			{"heading":"Target company","text":"Wants 0→1 product companies.","score":0.81,"path":"Job Hunting/Target company"},
			{"heading":"Job Hunting","text":"Avoids fintech and crypto.","score":0.32,"path":"Job Hunting"}
		]}`)
	})
	rr, err := c.Recall(context.Background(), "what does the user want", 5)
	if err != nil {
		t.Fatalf("Recall: %v", err)
	}
	if len(rr.Chunks) != 2 {
		t.Fatalf("Recall chunks = %d, want 2", len(rr.Chunks))
	}
	got := rr.Chunks[0]
	if got.Heading != "Target company" || got.Path != "Job Hunting/Target company" {
		t.Fatalf("chunk[0] heading/path = %q/%q", got.Heading, got.Path)
	}
	if got.Score != 0.81 || !strings.Contains(got.Text, "0→1") {
		t.Fatalf("chunk[0] score/text = %v/%q", got.Score, got.Text)
	}
}

func TestRecallNoK(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.URL.Query()["k"]; ok {
			t.Errorf("k should be omitted when <= 0, got %q", r.URL.Query().Get("k"))
		}
		io.WriteString(w, `{"chunks":[]}`)
	})
	if _, err := c.Recall(context.Background(), "x", 0); err != nil {
		t.Fatalf("Recall: %v", err)
	}
}

func TestNon2xxCarriesErrorDetail(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		io.WriteString(w, `{"error":"missing required query param: q"}`)
	})
	_, err := c.Recall(context.Background(), "", 5)
	if err == nil {
		t.Fatal("Recall: want error on 400")
	}
	if !strings.Contains(err.Error(), "missing required query param: q") {
		t.Fatalf("error should carry body detail, got %v", err)
	}
}

func TestBearerAuth(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer s3cret" {
			t.Errorf("Authorization = %q, want Bearer s3cret", got)
		}
		io.WriteString(w, `{"chunks":[]}`)
	})
	c.Auth = "s3cret"
	if _, err := c.Recall(context.Background(), "x", 1); err != nil {
		t.Fatalf("Recall: %v", err)
	}
}

func TestDisabledClient(t *testing.T) {
	c := New("")
	if c.Enabled() {
		t.Fatal("empty base URL should be disabled")
	}
	if err := c.Health(context.Background()); err == nil {
		t.Fatal("disabled client Health should error")
	}
	if _, err := c.Recall(context.Background(), "x", 5); err == nil {
		t.Fatal("disabled client Recall should error")
	}
	if _, err := c.Changes(context.Background(), "anything"); err == nil {
		t.Fatal("disabled client Changes should error (not panic)")
	}
}

func TestNewTrimsTrailingSlash(t *testing.T) {
	c := New("http://example.com:8100/")
	if c.BaseURL != "http://example.com:8100" {
		t.Fatalf("BaseURL = %q, want trailing slash trimmed", c.BaseURL)
	}
}

func TestRecallComplete(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("complete"); got != "true" {
			t.Errorf("complete = %q, want true", got)
		}
		if got := r.URL.Query().Get("k"); got != "50" {
			t.Errorf("k = %q, want 50", got)
		}
		io.WriteString(w, `{"chunks":[{"id":"u1","heading":"h","text":"t","score":0.9,"path":"p"}]}`)
	})
	got, err := c.RecallComplete(context.Background(), "dealbreakers", 50)
	if err != nil {
		t.Fatalf("RecallComplete: %v", err)
	}
	if len(got.Chunks) != 1 || got.Chunks[0].ID != "u1" {
		t.Fatalf("chunks = %+v", got.Chunks)
	}
}

func TestDoc(t *testing.T) {
	t.Run("ok", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/doc" {
				t.Errorf("path = %q, want /doc", r.URL.Path)
			}
			if got := r.URL.Query().Get("id"); got != "abc-123" {
				t.Errorf("id = %q", got)
			}
			io.WriteString(w, `{"id":"abc-123","title":"T","path":"A/T","version":"v9","text":"verbatim — body"}`)
		})
		got, err := c.Doc(context.Background(), "abc-123")
		if err != nil {
			t.Fatalf("Doc: %v", err)
		}
		if got.Version != "v9" || got.Text != "verbatim — body" {
			t.Fatalf("doc = %+v", got)
		}
	})

	t.Run("404 is IsNotFound", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			io.WriteString(w, `{"error":"unknown id"}`)
		})
		_, err := c.Doc(context.Background(), "gone")
		if err == nil {
			t.Fatal("Doc: want error on 404")
		}
		if !IsNotFound(err) {
			t.Fatalf("IsNotFound = false for %v", err)
		}
		if !strings.Contains(err.Error(), "unknown id") {
			t.Errorf("error detail lost: %v", err)
		}
	})

	t.Run("400 is not IsNotFound", func(t *testing.T) {
		_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			io.WriteString(w, `{"error":"malformed id"}`)
		})
		_, err := c.Doc(context.Background(), "???")
		if err == nil || IsNotFound(err) {
			t.Fatalf("want non-404 error, got %v", err)
		}
	})
}

func TestMap(t *testing.T) {
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/map" {
			t.Errorf("path = %q, want /map", r.URL.Path)
		}
		io.WriteString(w, `{"sources":[
			{"id":"root1","title":"Outreach","path":"Outreach","parent_id":null,"version":"v1"},
			{"id":"kid1","title":"Templates","path":"Outreach/Templates","parent_id":"root1","version":"v2"}]}`)
	})
	got, err := c.Map(context.Background())
	if err != nil {
		t.Fatalf("Map: %v", err)
	}
	if len(got.Sources) != 2 {
		t.Fatalf("sources = %+v", got.Sources)
	}
	if got.Sources[0].ParentID != nil {
		t.Errorf("root parent = %v, want nil", *got.Sources[0].ParentID)
	}
	if got.Sources[1].ParentID == nil || *got.Sources[1].ParentID != "root1" {
		t.Errorf("child parent = %v", got.Sources[1].ParentID)
	}
}

func TestChanges(t *testing.T) {
	// The stub mimics the brain: it echoes its current cursor and reports
	// changed=true unless `since` already equals that cursor — exactly the
	// documented contract (changed when since is absent/stale, false on a match).
	const current = "cur-7"
	_, c := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/changes" {
			t.Errorf("path = %q, want /changes", r.URL.Path)
		}
		// `since` must be wired onto the query string, present even when empty.
		if _, ok := r.URL.Query()["since"]; !ok {
			t.Errorf("since param missing from %q", r.URL.RawQuery)
		}
		since := r.URL.Query().Get("since")
		changed := since != current
		w.Write([]byte(`{"cursor":"` + current + `","changed":` + boolJSON(changed) + `}`))
	})

	// Empty since → changed=true and the current cursor comes back.
	got, err := c.Changes(context.Background(), "")
	if err != nil {
		t.Fatalf("Changes(\"\"): %v", err)
	}
	if got.Cursor != current || !got.Changed {
		t.Fatalf("empty since: got %+v, want {cursor:%q, changed:true}", got, current)
	}

	// Passing the returned cursor back → changed=false (a stable view).
	got2, err := c.Changes(context.Background(), got.Cursor)
	if err != nil {
		t.Fatalf("Changes(cursor): %v", err)
	}
	if got2.Cursor != current || got2.Changed {
		t.Fatalf("matched since: got %+v, want {cursor:%q, changed:false}", got2, current)
	}
}

func boolJSON(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
