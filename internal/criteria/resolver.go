// Package criteria resolves the user's criteria block (what the user wants) for
// the verdict stage, with a locally-cached distilled brief in front of the brain.
//
// Source priority:
//
//  1. a FRESH locally-cached brief (within TTL) — no brain call;
//  2. a live distillation (recall + LLM synthesis, which refreshes the cache);
//  3. the LAST cached brief, even if stale, when the brain is unreachable;
//  4. the offline taste.md file.
//
// The brain holds the user's notes, not per-company data, and the distilled
// brief changes rarely, so caching it keeps every CLI run and server restart
// from re-distilling. The brain stays read-only; the cache lives in scout's
// SQLite working set (it is disposable, not the system of record).
package criteria

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

// healthTimeout bounds the liveness probe before a (potentially slow)
// distillation, so a hung brain doesn't stall resolution.
const healthTimeout = 5 * time.Second

// ErrBrainUnavailable is returned by Refresh when the brain isn't configured.
var ErrBrainUnavailable = errors.New("brain not configured")

// BriefSource produces the user's criteria from the brain: the brief (what the
// verdict LLM reads) and a stable basis (the version key). The concrete
// implementation is *distill.Distiller; the interface keeps the resolver
// testable without a live brain or LLM. An empty brief with a nil error means
// the brain genuinely knows nothing yet (fall back to local criteria); any
// error is surfaced so the resolver distinguishes an outage from an empty brain.
//
// basis keys the criteria version instead of the brief prose: the brief drifts
// cosmetically across re-distills, so versioning off basis avoids re-scoring
// every company when nothing actually changed (see distill.Result.Basis).
type BriefSource interface {
	Distill(context.Context) (brief, basis string, err error)
}

// Resolver resolves criteria with a TTL-cached distilled brief + taste.md fallback.
type Resolver struct {
	Brain       *brainbot.Client // optional; nil/disabled → straight to taste.md
	Distiller   BriefSource      // produces the brief; nil → straight to taste.md
	Store       *store.DB        // holds the brief cache
	TasteMDPath string
	TTL         time.Duration // cache freshness window; <= 0 means always refetch

	// Log, if set, receives one human-readable line per resolution decision.
	Log func(string)
}

func (r *Resolver) log(format string, args ...any) {
	if r.Log != nil {
		r.Log(fmt.Sprintf(format, args...))
	}
}

// brainEnabled requires both a reachable-configured brain client (for the
// health probe and cache key) and a distiller to produce the brief. Missing
// either drops resolution straight to the taste.md fallback.
func (r *Resolver) brainEnabled() bool {
	return r.Brain != nil && r.Brain.Enabled() && r.Distiller != nil
}

// brainSource is the stable criteria source label. It does NOT vary with
// cache-vs-live: the content (and thus the version) is identical either way, and
// a stable label keeps the stats/version display from flickering.
func brainSource(url string) string { return "brain:brief@" + url }

// blockFromCache builds a criteria block from a cached row. The version is keyed
// off the stored stable basis hash (content_hash), NOT the brief body — so a
// cosmetically-drifted re-distill that produced the same basis keeps the same
// version and doesn't re-score.
func blockFromCache(cp *store.BrainProfile, url string) *taste.Block {
	blk := taste.FromBrain(cp.Body, brainSource(url))
	blk.Version = cp.ContentHash
	return blk
}

// Resolve returns the current criteria block following the source priority in
// the package doc. It never returns a nil block without an error.
func (r *Resolver) Resolve(ctx context.Context) (*taste.Block, error) {
	if r.brainEnabled() {
		url := r.Brain.BaseURL

		// 1. Fresh cache → use it without touching the brain.
		if cp, err := r.Store.GetBrainProfile(url); err == nil && cp != nil && strings.TrimSpace(cp.Body) != "" {
			if r.TTL > 0 && time.Duration(cp.AgeSeconds)*time.Second < r.TTL {
				r.log("criteria: cached brain profile (age %ds < ttl %s)", cp.AgeSeconds, r.TTL)
				return blockFromCache(cp, url), nil
			}
		}

		// 2. Cache missing or stale → fetch live and refresh the cache.
		if blk, err := r.fetchAndCache(ctx, url); err == nil {
			r.log("criteria: refreshed brain profile from %s", url)
			return blk, nil
		} else {
			// 3. Couldn't refresh (brain unreachable, or healthy-but-empty) →
			// fall back to the last cached copy. The error string already says
			// which case it is, so surface it verbatim rather than labelling it
			// "unavailable" (a healthy-but-empty brain is reachable, just empty).
			if cp, cerr := r.Store.GetBrainProfile(url); cerr == nil && cp != nil && strings.TrimSpace(cp.Body) != "" {
				r.log("criteria: %v; using stale cached profile (age %ds)", err, cp.AgeSeconds)
				return blockFromCache(cp, url), nil
			}
			r.log("criteria: %v; no cache — falling back to %s", err, r.TasteMDPath)
		}
	}

	// 4. Offline fallback.
	return taste.LoadFile(r.TasteMDPath)
}

// Refresh forces a live brain fetch, updates the cache, and returns the new
// block. It errors (rather than silently falling back) so a manual refresh can
// report brain trouble to the caller.
func (r *Resolver) Refresh(ctx context.Context) (*taste.Block, error) {
	if !r.brainEnabled() {
		return nil, ErrBrainUnavailable
	}
	return r.fetchAndCache(ctx, r.Brain.BaseURL)
}

// Cached returns the cached profile row for the configured brain, or nil.
func (r *Resolver) Cached() (*store.BrainProfile, error) {
	if !r.brainEnabled() {
		return nil, nil
	}
	return r.Store.GetBrainProfile(r.Brain.BaseURL)
}

// fetchAndCache health-checks the brain, distills the criteria brief, writes the
// cache (best-effort), and returns the block. Errors on an unreachable brain or
// an empty (healthy-but-no-criteria) brain.
func (r *Resolver) fetchAndCache(ctx context.Context, url string) (*taste.Block, error) {
	hctx, cancel := context.WithTimeout(ctx, healthTimeout)
	herr := r.Brain.Health(hctx)
	cancel()
	if herr != nil {
		return nil, fmt.Errorf("brain unreachable at %s: %w", url, herr)
	}
	brief, basis, err := r.Distiller.Distill(ctx)
	if err != nil {
		return nil, fmt.Errorf("brain distillation: %w", err)
	}
	brief = strings.TrimSpace(brief)
	if brief == "" {
		return nil, fmt.Errorf("brain at %s is healthy but has no criteria captured yet", url)
	}
	// Version off the stable basis (synthesis prompt + chunk content), not the
	// brief prose — content_hash stores it, so a cosmetically-drifted brief over
	// unchanged inputs keeps the same version and doesn't re-score.
	version := taste.Hash(basis)
	if err := r.Store.PutBrainProfile(url, brief, version); err != nil {
		// A cache-write failure shouldn't block scoring — log and continue.
		r.log("criteria: cache write failed: %v", err)
	}
	blk := taste.FromBrain(brief, brainSource(url))
	blk.Version = version
	return blk, nil
}
