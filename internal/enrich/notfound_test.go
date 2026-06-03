package enrich

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

func TestLooksLikeNotFound(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{
			name: "classic soft 404",
			text: "404 Error. The page you were looking for could not be found. Go back home.",
			want: true,
		},
		{
			name: "page not found",
			text: "Oops! Page not found. Try searching instead.",
			want: true,
		},
		{
			name: "ok real about page",
			text: "Acme Corp builds AI infrastructure for machine learning platforms. We are a Series B startup based in San Francisco with a distributed team. We're hiring senior engineers across the stack. Founded in 2022.",
			want: false,
		},
		{
			name: "long page incidentally mentioning page not found",
			text: longString("Welcome to our site. ", 60) + " page not found ", // > 1000 runes so the keyword shouldn't flip the verdict
			want: false,
		},
		{
			name: "empty",
			text: "",
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := looksLikeNotFound(tc.text); got != tc.want {
				t.Errorf("looksLikeNotFound(%q...) = %v, want %v", first(tc.text, 60), got, tc.want)
			}
		})
	}
}

// realContent is comfortably above minContentRunes so a 200 isn't flagged
// low_content.
var realContent = longString("Acme builds developer tools for AI teams. ", 20)

// newEnricher wires an Enricher to a test server, mirroring the scheme-forcing
// fetchOne does ("https://" + domain + path).
func newEnricher(srv *httptest.Server) (*Enricher, string) {
	domain := strings.TrimPrefix(srv.URL, "https://")
	return &Enricher{Client: srv.Client()}, domain
}

// TestFetchOneStoresFinalURL proves we store where we actually landed after a
// redirect, not the path we guessed — the core fix for about links that 301 at
// fetch time but would 404 if we stored the pre-redirect URL.
func TestFetchOneStoresFinalURL(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/about":
			http.Redirect(w, r, "/company", http.StatusMovedPermanently)
		case "/company":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html><body>" + realContent + "</body></html>"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	e, domain := newEnricher(srv)
	rec := e.fetchOne(context.Background(), store.EnrichmentTarget{CompanyID: "c1", Domain: domain})

	if rec.FetchStatus != "ok" {
		t.Fatalf("FetchStatus = %q, want ok", rec.FetchStatus)
	}
	want := srv.URL + "/company"
	if rec.WebsiteURL.String != want {
		t.Errorf("WebsiteURL = %q, want %q (final URL after redirect, not the /about guess)", rec.WebsiteURL.String, want)
	}
}

// TestFetchOneSkipsSoftFofour proves a 200-with-not-found-body candidate is
// skipped and leaves nothing behind, falling through to a real page.
func TestFetchOneSkipsSoftFofour(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		switch r.URL.Path {
		case "/about", "/about-us", "/company":
			// soft 404: 200 status, not-found body
			_, _ = w.Write([]byte("<html><body>Page not found. Try our homepage.</body></html>"))
		default:
			_, _ = w.Write([]byte("<html><body>" + realContent + "</body></html>"))
		}
	}))
	defer srv.Close()

	e, domain := newEnricher(srv)
	rec := e.fetchOne(context.Background(), store.EnrichmentTarget{CompanyID: "c1", Domain: domain})

	if rec.FetchStatus != "ok" {
		t.Fatalf("FetchStatus = %q, want ok (should fall through soft-404s to /)", rec.FetchStatus)
	}
	if want := srv.URL + "/"; rec.WebsiteURL.String != want {
		t.Errorf("WebsiteURL = %q, want %q", rec.WebsiteURL.String, want)
	}
	if strings.Contains(strings.ToLower(rec.WebsiteSummary.String), "page not found") {
		t.Errorf("WebsiteSummary still holds the soft-404 body: %q", rec.WebsiteSummary.String)
	}
}

// TestFetchOneAllSoftFofour proves a target whose every candidate is a soft 404
// stores no URL at all, rather than handing the user a dead link.
func TestFetchOneAllSoftFofour(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html><body>404 Error. Page not found.</body></html>"))
	}))
	defer srv.Close()

	e, domain := newEnricher(srv)
	rec := e.fetchOne(context.Background(), store.EnrichmentTarget{CompanyID: "c1", Domain: domain})

	if rec.WebsiteURL.Valid {
		t.Errorf("WebsiteURL = %q, want NULL (every candidate was a soft 404)", rec.WebsiteURL.String)
	}
	if rec.FetchStatus != "soft_404" {
		t.Errorf("FetchStatus = %q, want soft_404", rec.FetchStatus)
	}
}
