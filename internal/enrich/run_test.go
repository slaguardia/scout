package enrich

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/slaguardia/scout/internal/store"
)

// TestRunEmitsParallelProgress proves Run announces the worker count up front
// and emits a "picked up" line per company — the cues that make the otherwise
// one-at-a-time completion feed legibly parallel.
func TestRunEmitsParallelProgress(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html><body>" + realContent + "</body></html>"))
	}))
	defer srv.Close()
	domain := strings.TrimPrefix(srv.URL, "https://")

	db, err := store.Open(t.TempDir() + "/scout.db")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	names := []string{"Acme", "Beta", "Gamma"}
	for i, name := range names {
		if _, err := db.Exec(
			`INSERT INTO companies (id, source, name, domain, raw_json) VALUES (?, 'test', ?, ?, '{}')`,
			fmt.Sprintf("c%d", i), name, domain,
		); err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
	}

	var mu sync.Mutex
	var lines []string
	e := &Enricher{
		DB:       db,
		Client:   srv.Client(),
		Workers:  2,
		Progress: func(s string) { mu.Lock(); lines = append(lines, s); mu.Unlock() },
	}
	if _, err := e.Run(context.Background(), true); err != nil {
		t.Fatalf("Run: %v", err)
	}

	joined := strings.Join(lines, "\n")
	if want := "enriching 3 companies · 2 workers in parallel"; !strings.Contains(joined, want) {
		t.Errorf("missing header line %q in:\n%s", want, joined)
	}
	for _, name := range names {
		if start := "· " + name + "…"; !strings.Contains(joined, start) {
			t.Errorf("missing pick-up line %q in:\n%s", start, joined)
		}
	}
}
