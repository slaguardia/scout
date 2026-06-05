package outreach

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestFetchJDGreenhouse points the Greenhouse host at a fake board API and
// asserts the engine reads the JSON path (not the HTML fallback). The regexes
// match on the host substring, so the test rewrites only the API base via a
// custom transport — instead, we drive the parser directly through the public
// FetchJD by serving a Greenhouse-shaped URL from httptest and rewriting the
// API host with a RoundTripper.
func TestFetchJDGreenhouse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/v1/boards/acme/jobs/123") {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("content") != "true" {
			t.Errorf("greenhouse: missing content=true; got %q", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"title":"Backend Engineer","location":{"name":"Remote"},"content":"<p>You will deploy into customer environments &amp; own reliability.</p>"}`))
	}))
	defer srv.Close()

	// Redirect boards-api.greenhouse.io to the test server.
	httpc := &http.Client{Transport: rewriteHost{"boards-api.greenhouse.io", srv.URL}}
	res := FetchJD(context.Background(), httpc, "https://boards.greenhouse.io/acme/jobs/123")
	if !strings.HasPrefix(res.Status, "ok") {
		t.Fatalf("status = %q, want ok*", res.Status)
	}
	if !strings.Contains(res.Text, "deploy into customer environments & own reliability") {
		t.Errorf("description not extracted/unescaped:\n%s", res.Text)
	}
	if !strings.Contains(res.Text, "Backend Engineer") || !strings.Contains(res.Text, "Remote") {
		t.Errorf("title/location missing:\n%s", res.Text)
	}
}

// TestFetchJDLever drives the Lever v0 postings API.
func TestFetchJDLever(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"text":"Platform Engineer","descriptionPlain":"Build deployment tooling for embedded teams.","categories":{"location":"NYC"}}`))
	}))
	defer srv.Close()
	httpc := &http.Client{Transport: rewriteHost{"api.lever.co", srv.URL}}
	res := FetchJD(context.Background(), httpc, "https://jobs.lever.co/acme/abc-123")
	if !strings.HasPrefix(res.Status, "ok") {
		t.Fatalf("status = %q", res.Status)
	}
	if !strings.Contains(res.Text, "Build deployment tooling") {
		t.Errorf("lever desc missing:\n%s", res.Text)
	}
}

// TestFetchJDAshbyMatchesPosting asserts the board API is filtered by posting id.
func TestFetchJDAshbyMatchesPosting(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jobs":[
			{"id":"00000000-0000-0000-0000-000000000001","title":"Other","location":"X","descriptionPlain":"wrong one"},
			{"id":"abcdef00-0000-0000-0000-000000000002","title":"Backend","location":"Remote","descriptionPlain":"the right description"}
		]}`))
	}))
	defer srv.Close()
	httpc := &http.Client{Transport: rewriteHost{"api.ashbyhq.com", srv.URL}}
	res := FetchJD(context.Background(), httpc, "https://jobs.ashbyhq.com/acme/abcdef00-0000-0000-0000-000000000002")
	if !strings.HasPrefix(res.Status, "ok") {
		t.Fatalf("status = %q", res.Status)
	}
	if !strings.Contains(res.Text, "the right description") {
		t.Errorf("ashby matched wrong posting:\n%s", res.Text)
	}
	if strings.Contains(res.Text, "wrong one") {
		t.Errorf("ashby returned the non-matching posting:\n%s", res.Text)
	}
}

// TestFetchJDPlainFallback strips HTML when no ATS matches.
func TestFetchJDPlainFallback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><style>.x{}</style></head><body><h1>Senior Engineer</h1><p>Own the platform.</p><script>noise()</script></body></html>`))
	}))
	defer srv.Close()
	res := FetchJD(context.Background(), srv.Client(), srv.URL+"/careers/role")
	if !strings.HasPrefix(res.Status, "ok") {
		t.Fatalf("status = %q", res.Status)
	}
	if !strings.Contains(res.Text, "Senior Engineer") || !strings.Contains(res.Text, "Own the platform.") {
		t.Errorf("plain text not extracted:\n%s", res.Text)
	}
	if strings.Contains(res.Text, "noise()") || strings.Contains(res.Text, ".x{}") {
		t.Errorf("script/style not stripped:\n%s", res.Text)
	}
}

// TestFetchJDEmptyURL reports the no-URL status without erroring.
func TestFetchJDEmptyURL(t *testing.T) {
	if got := FetchJD(context.Background(), nil, ""); got.Status != "no JD URL" {
		t.Errorf("status = %q, want 'no JD URL'", got.Status)
	}
}

// rewriteHost is a RoundTripper that redirects requests to a single upstream
// host to the test server, leaving the path/query intact — lets the tests
// exercise the real ATS-host regexes and URL construction.
type rewriteHost struct {
	host   string // e.g. "boards-api.greenhouse.io"
	target string // test server base URL, e.g. "http://127.0.0.1:NNNNN"
}

func (rt rewriteHost) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host == rt.host {
		base := strings.TrimPrefix(rt.target, "http://")
		req.URL.Scheme = "http"
		req.URL.Host = base
	}
	return http.DefaultTransport.RoundTrip(req)
}
