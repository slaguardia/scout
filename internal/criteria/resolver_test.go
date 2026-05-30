package criteria

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

func openDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "scout.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// brainServer serves /health + /profile, counting every request via hits.
func brainServer(t *testing.T, hits *int32, body string) *brainbot.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(hits, 1)
		switch r.URL.Path {
		case "/health":
			io.WriteString(w, `{"ok":true}`)
		case "/profile":
			fmt.Fprintf(w, `{"count":1,"episodes":[{"name":"e","body":%q}]}`, body)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return brainbot.New(srv.URL)
}

// deadBrainURL returns the URL of a server that's already been shut down, so
// connections to it are refused.
func deadBrainURL(t *testing.T) string {
	t.Helper()
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	return url
}

func TestResolveFreshCacheAvoidsBrain(t *testing.T) {
	db := openDB(t)
	var hits int32
	c := brainServer(t, &hits, "FROM BRAIN")
	if err := db.PutBrainProfile(c.BaseURL, "CACHED CRITERIA", taste.Hash("CACHED CRITERIA")); err != nil {
		t.Fatal(err)
	}
	r := &Resolver{Brain: c, Store: db, TasteMDPath: "taste.md", TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "CACHED CRITERIA" {
		t.Fatalf("text = %q, want the cached body", blk.Text)
	}
	if n := atomic.LoadInt32(&hits); n != 0 {
		t.Fatalf("brain hit %d times; a fresh cache must not touch the brain", n)
	}
}

func TestResolveFetchesAndCaches(t *testing.T) {
	db := openDB(t)
	var hits int32
	c := brainServer(t, &hits, "BRAIN CRITERIA")
	r := &Resolver{Brain: c, Store: db, TasteMDPath: filepath.Join(t.TempDir(), "none.md"), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "BRAIN CRITERIA" {
		t.Fatalf("text = %q, want the brain body", blk.Text)
	}
	cp, err := db.GetBrainProfile(c.BaseURL)
	if err != nil || cp == nil {
		t.Fatalf("expected cache to be written, got cp=%v err=%v", cp, err)
	}
	if cp.Body != "BRAIN CRITERIA" {
		t.Fatalf("cached body = %q", cp.Body)
	}
	// A second resolve must be served from the cache — no further brain traffic.
	before := atomic.LoadInt32(&hits)
	if _, err := r.Resolve(context.Background()); err != nil {
		t.Fatalf("Resolve #2: %v", err)
	}
	if after := atomic.LoadInt32(&hits); after != before {
		t.Fatalf("second resolve hit the brain (%d → %d); want a cache hit", before, after)
	}
}

func TestResolveBrainDownUsesStaleCache(t *testing.T) {
	db := openDB(t)
	url := deadBrainURL(t)
	if err := db.PutBrainProfile(url, "STALE CACHED", taste.Hash("STALE CACHED")); err != nil {
		t.Fatal(err)
	}
	// Age the row well past the TTL so resolution must try (and fail) the brain.
	if _, err := db.Exec(`UPDATE brain_profile_cache SET fetched_at = datetime('now','-10 hours') WHERE source_url = ?`, url); err != nil {
		t.Fatal(err)
	}
	r := &Resolver{Brain: brainbot.New(url), Store: db, TasteMDPath: filepath.Join(t.TempDir(), "none.md"), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "STALE CACHED" {
		t.Fatalf("text = %q, want the stale cached body when the brain is down", blk.Text)
	}
}

func TestResolveFallsBackToTasteMD(t *testing.T) {
	db := openDB(t)
	md := filepath.Join(t.TempDir(), "taste.md")
	if err := os.WriteFile(md, []byte("LOCAL FALLBACK"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := &Resolver{Brain: brainbot.New(deadBrainURL(t)), Store: db, TasteMDPath: md, TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "LOCAL FALLBACK" {
		t.Fatalf("text = %q, want taste.md content", blk.Text)
	}
	if blk.Source != "file:"+md {
		t.Fatalf("source = %q, want file:%s", blk.Source, md)
	}
}

func TestRefreshErrorsWhenBrainDisabled(t *testing.T) {
	db := openDB(t)
	r := &Resolver{Brain: nil, Store: db, TasteMDPath: "taste.md", TTL: time.Hour}
	if _, err := r.Refresh(context.Background()); err != ErrBrainUnavailable {
		t.Fatalf("Refresh err = %v, want ErrBrainUnavailable", err)
	}
}
