package criteria

import (
	"context"
	"errors"
	"fmt"
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

// fakeDistiller stands in for *distill.Distiller so the resolver's cost cascade
// can be tested without a live brain corpus or an LLM call. It counts each phase
// so a test can assert which tier fired.
type fakeDistiller struct {
	chunks []brainbot.Chunk
	basis  string
	brief  string
	gErr   error // Gather error
	sErr   error // Synthesize error
	dErr   error // Distill error

	gather  int32
	synth   int32
	distill int32
}

func (f *fakeDistiller) Gather(context.Context) ([]brainbot.Chunk, string, error) {
	atomic.AddInt32(&f.gather, 1)
	if f.gErr != nil {
		return nil, "", f.gErr
	}
	return f.chunks, f.basis, nil
}

func (f *fakeDistiller) Synthesize(context.Context, []brainbot.Chunk) (string, error) {
	atomic.AddInt32(&f.synth, 1)
	if f.sErr != nil {
		return "", f.sErr
	}
	return f.brief, nil
}

func (f *fakeDistiller) Distill(context.Context) (string, string, error) {
	atomic.AddInt32(&f.distill, 1)
	if f.dErr != nil {
		return "", "", f.dErr
	}
	return f.brief, f.basis, nil
}

func (f *fakeDistiller) counts() (gather, synth, distill int32) {
	return atomic.LoadInt32(&f.gather), atomic.LoadInt32(&f.synth), atomic.LoadInt32(&f.distill)
}

// brainStub is a controllable brain HTTP surface for /health + /changes. It
// mimics the real contract: /changes reports changed=true unless `since` already
// equals the stub's current cursor.
type brainStub struct {
	cursor      string
	healthFail  bool
	changesFail bool

	healthHits  int32
	changesHits int32
}

func newBrain(t *testing.T, s *brainStub) *brainbot.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			atomic.AddInt32(&s.healthHits, 1)
			if s.healthFail {
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			}
			io.WriteString(w, `{"ok":true}`)
		case "/changes":
			atomic.AddInt32(&s.changesHits, 1)
			if s.changesFail {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			since := r.URL.Query().Get("since")
			fmt.Fprintf(w, `{"cursor":%q,"changed":%v}`, s.cursor, since != s.cursor)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return brainbot.New(srv.URL)
}

// deadBrainURL returns the URL of a server that's already been shut down, so
// connections to it are refused (a hard-unreachable brain).
func deadBrainURL(t *testing.T) string {
	t.Helper()
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	return url
}

// seedCache writes a cached brief with a known basis hash + cursor (the warm
// path's precondition).
func seedCache(t *testing.T, db *store.DB, url, body, basis, cursor string) {
	t.Helper()
	if err := db.PutBrainProfile(url, body, taste.Hash(basis), cursor); err != nil {
		t.Fatal(err)
	}
}

// --- Tier 0: nothing moved -> serve verbatim, no recall, no LLM ---

func TestCascadeTier0Unchanged(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-1"}
	c := newBrain(t, s)
	seedCache(t, db, c.BaseURL, "CACHED BODY", "BASIS-X", "cur-1") // cursor matches stub
	fd := &fakeDistiller{brief: "SHOULD NOT SYNTH", basis: "BASIS-X"}
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "CACHED BODY" {
		t.Fatalf("text = %q, want the cached body verbatim", blk.Text)
	}
	if g, sy, d := fd.counts(); g != 0 || sy != 0 || d != 0 {
		t.Fatalf("Tier 0 must do no work: gather=%d synth=%d distill=%d", g, sy, d)
	}
	if n := atomic.LoadInt32(&s.changesHits); n != 1 {
		t.Fatalf("changes hits = %d, want exactly 1 (one cheap Tier 0 call)", n)
	}
	// verified_at must have advanced (confirmed-current stamp).
	cp, _ := db.GetBrainProfile(c.BaseURL)
	if cp.VerifiedAgeSeconds < 0 {
		t.Fatal("Tier 0 should stamp verified_at, not leave it NULL")
	}
}

// --- Tier 1: brain moved but our basis didn't -> serve verbatim, no LLM ---

func TestCascadeTier1BasisUnchanged(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-2"} // differs from the cache's stored cursor
	c := newBrain(t, s)
	seedCache(t, db, c.BaseURL, "CACHED BODY", "BASIS-X", "cur-OLD")
	cp0, _ := db.GetBrainProfile(c.BaseURL)
	fd := &fakeDistiller{brief: "SHOULD NOT SYNTH", basis: "BASIS-X"} // SAME basis as cached
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "CACHED BODY" {
		t.Fatalf("text = %q, want cached body (Tier 1 absorb)", blk.Text)
	}
	if g, sy, _ := fd.counts(); g != 1 || sy != 0 {
		t.Fatalf("Tier 1: want 1 gather, 0 synth; got gather=%d synth=%d", g, sy)
	}
	if blk.Version != cp0.ContentHash {
		t.Fatalf("Version changed on a Tier 1 absorb: %q -> %q", cp0.ContentHash, blk.Version)
	}
	// The cursor must advance to the brain's new one so the next resolve is Tier 0.
	cp1, _ := db.GetBrainProfile(c.BaseURL)
	if cp1.Cursor != "cur-2" {
		t.Fatalf("cursor = %q after Tier 1, want cur-2 (advanced)", cp1.Cursor)
	}
	if cp1.ContentHash != cp0.ContentHash {
		t.Fatalf("Tier 1 must not rewrite content_hash: %q -> %q", cp0.ContentHash, cp1.ContentHash)
	}
}

// --- Tier 2: the basis actually changed -> synthesize, bump version ---

func TestCascadeTier2BasisChanged(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-3"}
	c := newBrain(t, s)
	seedCache(t, db, c.BaseURL, "OLD BODY", "BASIS-X", "cur-OLD")
	cp0, _ := db.GetBrainProfile(c.BaseURL)
	fd := &fakeDistiller{brief: "NEW BRIEF", basis: "BASIS-Y"} // DIFFERENT basis
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if !strings.Contains(blk.Text, "NEW BRIEF") {
		t.Fatalf("text = %q, want the re-synthesized brief", blk.Text)
	}
	if g, sy, _ := fd.counts(); g != 1 || sy != 1 {
		t.Fatalf("Tier 2: want 1 gather, 1 synth; got gather=%d synth=%d", g, sy)
	}
	if blk.Version == cp0.ContentHash {
		t.Fatalf("Version did not bump on a real basis change: still %q", blk.Version)
	}
	if blk.Version != taste.Hash("BASIS-Y") {
		t.Fatalf("Version = %q, want hash of the new basis", blk.Version)
	}
	// The cache must now hold the new brief, basis hash, and cursor.
	cp1, _ := db.GetBrainProfile(c.BaseURL)
	if !strings.Contains(cp1.Body, "NEW BRIEF") || cp1.ContentHash != taste.Hash("BASIS-Y") || cp1.Cursor != "cur-3" {
		t.Fatalf("cache not updated by Tier 2: %+v", cp1)
	}
}

// --- Tier 1 gather hiccup: keep the good cached brief, don't advance the cursor ---

func TestCascadeTier1GatherFails(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-2"} // differs from cache → changed=true
	c := newBrain(t, s)
	seedCache(t, db, c.BaseURL, "CACHED BODY", "BASIS-X", "cur-OLD")
	cp0, _ := db.GetBrainProfile(c.BaseURL)
	fd := &fakeDistiller{gErr: errors.New("recall hiccup")}
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "CACHED BODY" {
		t.Fatalf("text = %q, want the good cached brief on a gather hiccup", blk.Text)
	}
	if g, sy, _ := fd.counts(); g != 1 || sy != 0 {
		t.Fatalf("want 1 gather, 0 synth on a gather failure; got gather=%d synth=%d", g, sy)
	}
	// The cursor must NOT advance — the next resolve must re-check, not assume current.
	cp1, _ := db.GetBrainProfile(c.BaseURL)
	if cp1.Cursor != cp0.Cursor {
		t.Fatalf("cursor advanced on a gather failure: %q -> %q", cp0.Cursor, cp1.Cursor)
	}
	if cp1.ContentHash != cp0.ContentHash {
		t.Fatalf("content_hash changed on a gather failure: %q -> %q", cp0.ContentHash, cp1.ContentHash)
	}
}

// --- Tier 2 synthesis failure: serve the last-good brief, leave the cache intact ---

func TestCascadeTier2SynthFails(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-3"}
	c := newBrain(t, s)
	seedCache(t, db, c.BaseURL, "OLD BODY", "BASIS-X", "cur-OLD")
	cp0, _ := db.GetBrainProfile(c.BaseURL)
	// changed=true + a NEW basis reaches Tier 2, but synthesis fails.
	fd := &fakeDistiller{basis: "BASIS-Y", sErr: errors.New("llm boom")}
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "OLD BODY" {
		t.Fatalf("text = %q, want the last-good cached brief when synthesis fails", blk.Text)
	}
	if g, sy, _ := fd.counts(); g != 1 || sy != 1 {
		t.Fatalf("want 1 gather, 1 synth (attempted) on a synth failure; got gather=%d synth=%d", g, sy)
	}
	// The cache must be untouched — a failed re-distill must not corrupt the row.
	cp1, _ := db.GetBrainProfile(c.BaseURL)
	if cp1.Body != cp0.Body || cp1.ContentHash != cp0.ContentHash || cp1.Cursor != cp0.Cursor {
		t.Fatalf("a failed Tier 2 mutated the cache: before %+v after %+v", cp0, cp1)
	}
}

// --- Unreachable brain: serve the cached brief within the TTL ceiling ---

func TestCascadeBrainUnreachableServesCache(t *testing.T) {
	db := openDB(t)
	url := deadBrainURL(t)
	seedCache(t, db, url, "CACHED BODY", "BASIS-X", "cur-1") // verified now → within ceiling
	fd := &fakeDistiller{brief: "UNUSED", basis: "BASIS-X"}
	r := &Resolver{Brain: brainbot.New(url), Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "CACHED BODY" {
		t.Fatalf("text = %q, want cached body when the brain is unreachable", blk.Text)
	}
	if g, sy, d := fd.counts(); g != 0 || sy != 0 || d != 0 {
		t.Fatalf("an unreachable brain must do no distill work: gather=%d synth=%d distill=%d", g, sy, d)
	}
}

// --- Unreachable brain past the ceiling: fall to taste.md ---

func TestCascadeBrainUnreachablePastCeilingUsesTaste(t *testing.T) {
	db := openDB(t)
	url := deadBrainURL(t)
	seedCache(t, db, url, "STALE CACHED", "BASIS-X", "cur-1")
	// Age verified_at past the TTL ceiling so the cache is too stale to trust.
	if _, err := db.Exec(`UPDATE brain_profile_cache SET verified_at = datetime('now','-10 hours'), fetched_at = datetime('now','-10 hours') WHERE source_url = ?`, url); err != nil {
		t.Fatal(err)
	}
	md := filepath.Join(t.TempDir(), "taste.md")
	if err := os.WriteFile(md, []byte("LOCAL FALLBACK"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := &Resolver{Brain: brainbot.New(url), Distiller: &fakeDistiller{}, Store: db, TasteMDPath: md, TTL: time.Hour}

	blk, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if blk.Text != "LOCAL FALLBACK" {
		t.Fatalf("text = %q, want taste.md once the cache is past the ceiling", blk.Text)
	}
}

// --- Cold path then warm path: distill once, then zero synthesis ---

func TestColdThenWarmZeroSynthesis(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-fresh"}
	c := newBrain(t, s)
	fd := &fakeDistiller{brief: "DISTILLED BRIEF", basis: "BASIS-X"}
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	// Resolve #1: cold path → one full distill, cursor stored.
	blk1, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve #1: %v", err)
	}
	if !strings.Contains(blk1.Text, "DISTILLED BRIEF") {
		t.Fatalf("cold path text = %q", blk1.Text)
	}
	cp, _ := db.GetBrainProfile(c.BaseURL)
	if cp == nil || cp.Cursor != "cur-fresh" {
		t.Fatalf("cold path must store the cursor; got %+v", cp)
	}

	// Resolve #2: warm path, no brain edit → Tier 0 hit, zero further distill work.
	blk2, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve #2: %v", err)
	}
	if blk2.Text != blk1.Text {
		t.Fatalf("warm resolve wobbled the brief: %q -> %q", blk1.Text, blk2.Text)
	}
	if g, sy, d := fd.counts(); g != 0 || sy != 0 || d != 1 {
		t.Fatalf("want exactly 1 distill (cold) and 0 gather/synth across two resolves; got gather=%d synth=%d distill=%d", g, sy, d)
	}
}

// --- No brain at all: taste.md fallback ---

func TestResolveFallsBackToTasteMD(t *testing.T) {
	db := openDB(t)
	md := filepath.Join(t.TempDir(), "taste.md")
	if err := os.WriteFile(md, []byte("LOCAL FALLBACK"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Hard-unreachable brain, no cache → cold path fails → taste.md.
	r := &Resolver{Brain: brainbot.New(deadBrainURL(t)), Distiller: &fakeDistiller{brief: "unused"}, Store: db, TasteMDPath: md, TTL: time.Hour}

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

// --- Refresh: unconditional full distill, stores the cursor ---

func TestRefreshStoresCursor(t *testing.T) {
	db := openDB(t)
	s := &brainStub{cursor: "cur-refresh"}
	c := newBrain(t, s)
	// Even with an already-current cache, Refresh re-distills unconditionally.
	seedCache(t, db, c.BaseURL, "OLD BODY", "BASIS-X", "cur-refresh")
	fd := &fakeDistiller{brief: "REFRESHED BRIEF", basis: "BASIS-Z"}
	r := &Resolver{Brain: c, Distiller: fd, Store: db, TasteMDPath: noFile(t), TTL: time.Hour}

	blk, err := r.Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if !strings.Contains(blk.Text, "REFRESHED BRIEF") {
		t.Fatalf("Refresh text = %q", blk.Text)
	}
	if _, _, d := fd.counts(); d != 1 {
		t.Fatalf("Refresh must do exactly one full distill, got %d", d)
	}
	cp, _ := db.GetBrainProfile(c.BaseURL)
	if cp.Cursor != "cur-refresh" || cp.ContentHash != taste.Hash("BASIS-Z") {
		t.Fatalf("Refresh must store the new basis + cursor; got %+v", cp)
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
	r2 := &Resolver{Brain: newBrain(t, &brainStub{cursor: "x"}), Store: db, TasteMDPath: "taste.md", TTL: time.Hour}
	if _, err := r2.Refresh(context.Background()); err != ErrBrainUnavailable {
		t.Fatalf("Refresh (no distiller) err = %v, want ErrBrainUnavailable", err)
	}
}

// noFile returns a path to a non-existent taste.md so a test that should never
// reach the offline fallback fails loudly (LoadFile errors) if it does.
func noFile(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "none.md")
}
