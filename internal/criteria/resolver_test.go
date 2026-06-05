package criteria

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

// fakeDistiller stands in for *distill.Distiller so the resolver's source
// priority can be tested without a live brain corpus or an LLM call.
type fakeDistiller struct {
	text  string
	basis string
	err   error
	calls *int32
}

func (f *fakeDistiller) Distill(context.Context) (string, string, error) {
	if f.calls != nil {
		atomic.AddInt32(f.calls, 1)
	}
	return f.text, f.basis, f.err
}

// brainServer serves only /health (the resolver's liveness probe), counting
// every request via hits. Distillation is injected via fakeDistiller, so the
// brain HTTP surface the resolver touches is just the health check.
func brainServer(t *testing.T, hits *int32) *brainbot.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(hits, 1)
		switch r.URL.Path {
		case "/health":
			io.WriteString(w, `{"ok":true}`)
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
	var hits, distills int32
	c := brainServer(t, &hits)
	if err := db.PutBrainProfile(c.BaseURL, "CACHED CRITERIA", taste.Hash("CACHED CRITERIA")); err != nil {
		t.Fatal(err)
	}
	r := &Resolver{Brain: c, Distiller: &fakeDistiller{text: "FROM BRAIN", calls: &distills}, Store: db, TasteMDPath: "taste.md", TTL: time.Hour}

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
	if n := atomic.LoadInt32(&distills); n != 0 {
		t.Fatalf("distilled %d times; a fresh cache must not re-distill", n)
	}
}

func TestResolveFetchesAndCaches(t *testing.T) {
	db := openDB(t)
	var hits, distills int32
	c := brainServer(t, &hits)
	r := &Resolver{Brain: c, Distiller: &fakeDistiller{text: "BRAIN CRITERIA", calls: &distills}, Store: db, TasteMDPath: filepath.Join(t.TempDir(), "none.md"), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !strings.Contains(blk.Text, "BRAIN CRITERIA") {
		t.Fatalf("text = %q, want a block containing the distilled brief", blk.Text)
	}
	if !strings.HasPrefix(blk.Source, "brain:brief@") {
		t.Fatalf("source = %q, want a brain:brief@ label", blk.Source)
	}
	cp, err := db.GetBrainProfile(c.BaseURL)
	if err != nil || cp == nil {
		t.Fatalf("expected cache to be written, got cp=%v err=%v", cp, err)
	}
	if !strings.Contains(cp.Body, "BRAIN CRITERIA") {
		t.Fatalf("cached body = %q, want it to contain the brief", cp.Body)
	}
	// A second resolve must be served from the cache — no re-distill, no traffic.
	beforeHits := atomic.LoadInt32(&hits)
	if _, err := r.Resolve(context.Background()); err != nil {
		t.Fatalf("Resolve #2: %v", err)
	}
	if after := atomic.LoadInt32(&hits); after != beforeHits {
		t.Fatalf("second resolve hit the brain (%d → %d); want a cache hit", beforeHits, after)
	}
	if n := atomic.LoadInt32(&distills); n != 1 {
		t.Fatalf("distilled %d times; want exactly once across two resolves", n)
	}
}

func TestResolveVersionTracksBasisNotBrief(t *testing.T) {
	db := openDB(t)
	var hits int32
	c := brainServer(t, &hits)
	// TTL 0 → always re-distill, so each Resolve exercises fetchAndCache.
	r := &Resolver{Brain: c, Store: db, TasteMDPath: filepath.Join(t.TempDir(), "none.md"), TTL: 0}

	// Run 1: brief A, basis X.
	r.Distiller = &fakeDistiller{text: "BRIEF A", basis: "BASIS-X"}
	blk1, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve #1: %v", err)
	}

	// Run 2: the brief drifted (reworded), but the basis is unchanged. Version
	// must stay put — this is the whole point: no spurious re-score.
	r.Distiller = &fakeDistiller{text: "BRIEF A — reworded, bullets reordered", basis: "BASIS-X"}
	blk2, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve #2: %v", err)
	}
	if blk2.Version != blk1.Version {
		t.Fatalf("version changed on cosmetic brief drift: %q → %q", blk1.Version, blk2.Version)
	}

	// Run 3: the basis actually changed (notes/prompt changed) → version must change.
	r.Distiller = &fakeDistiller{text: "BRIEF A", basis: "BASIS-Y"}
	blk3, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve #3: %v", err)
	}
	if blk3.Version == blk1.Version {
		t.Fatalf("version unchanged when basis changed: %q", blk3.Version)
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
	r := &Resolver{Brain: brainbot.New(url), Distiller: &fakeDistiller{text: "SHOULD NOT BE USED"}, Store: db, TasteMDPath: filepath.Join(t.TempDir(), "none.md"), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "STALE CACHED" {
		t.Fatalf("text = %q, want the stale cached body when the brain is down", blk.Text)
	}
}

func TestResolveDistillErrorUsesStaleCache(t *testing.T) {
	db := openDB(t)
	var hits int32
	c := brainServer(t, &hits) // healthy brain...
	if err := db.PutBrainProfile(c.BaseURL, "STALE CACHED", taste.Hash("STALE CACHED")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE brain_profile_cache SET fetched_at = datetime('now','-10 hours') WHERE source_url = ?`, c.BaseURL); err != nil {
		t.Fatal(err)
	}
	// ...but distillation fails (e.g. LLM error). The resolver must fall back to
	// the stale cache rather than erroring out.
	r := &Resolver{Brain: c, Distiller: &fakeDistiller{err: errors.New("llm boom")}, Store: db, TasteMDPath: filepath.Join(t.TempDir(), "none.md"), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "STALE CACHED" {
		t.Fatalf("text = %q, want the stale cached body when distillation fails", blk.Text)
	}
}

func TestResolveFallsBackToTasteMD(t *testing.T) {
	db := openDB(t)
	md := filepath.Join(t.TempDir(), "taste.md")
	if err := os.WriteFile(md, []byte("LOCAL FALLBACK"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := &Resolver{Brain: brainbot.New(deadBrainURL(t)), Distiller: &fakeDistiller{text: "unused"}, Store: db, TasteMDPath: md, TTL: time.Hour}

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
	// No brain client at all.
	r := &Resolver{Brain: nil, Store: db, TasteMDPath: "taste.md", TTL: time.Hour}
	if _, err := r.Refresh(context.Background()); err != ErrBrainUnavailable {
		t.Fatalf("Refresh err = %v, want ErrBrainUnavailable", err)
	}
	// Brain configured but no distiller wired — also unavailable, no panic.
	var hits int32
	r2 := &Resolver{Brain: brainServer(t, &hits), Store: db, TasteMDPath: "taste.md", TTL: time.Hour}
	if _, err := r2.Refresh(context.Background()); err != ErrBrainUnavailable {
		t.Fatalf("Refresh (no distiller) err = %v, want ErrBrainUnavailable", err)
	}
}
