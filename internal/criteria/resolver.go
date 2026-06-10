// Package criteria resolves the user's criteria block (what the user wants) for
// the verdict stage, with a locally-cached distilled brief in front of the brain.
//
// Resolution follows the change-propagation cost cascade
// (brainbot/docs/change-propagation.md) rather than a dumb TTL: each tier only
// pays for the next when something genuinely changed.
//
//   - Warm path (a cached brief WITH a stored cursor):
//     Tier 0 — ask the brain GET /changes whether anything moved since the stored
//     cursor. Nothing moved → serve the cached brief VERBATIM (one cheap call, no
//     recall, no LLM), just re-stamping verified_at.
//     Tier 1 — something moved → re-run the recall gather and compare the distill
//     basis. The cursor is coarse (a no-op re-sync advances it), so a move there
//     need not touch what THIS view draws from; an unchanged basis → still serve
//     verbatim, no LLM.
//     Tier 2 — the basis actually changed → re-synthesize, store the new brief +
//     basis + cursor, and bump the version (which is keyed off the basis, so only
//     a real change re-scores).
//   - Cold path (no cache, or a pre-0037 row with no cursor): a full distill,
//     stored WITH the current cursor so the next resolve goes warm.
//   - Fallbacks: when the brain is unreachable, serve the last cached brief while
//     it is within the TTL ceiling; past the ceiling (or with no cache), fall back
//     to the offline taste.md file.
//
// TTL is no longer the trigger for re-distilling — it survives only as the
// ceiling above for serving an unverifiable cached brief, and as an input to the
// criteria-state display (internal/web/profile.go). The brain stays read-only;
// the cache lives in scout's SQLite working set (it is disposable, not the system
// of record).
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

// BriefSource produces the user's criteria from the brain. It is split into the
// cost cascade's two phases so the resolver can gate the expensive LLM step on
// what actually changed (see brainbot/docs/change-propagation.md):
//
//   - Gather runs the brain read fan-out (recall + dedup, NO LLM) and returns the
//     gathered material plus a stable basis — the version key over the prompts +
//     recalled content. The resolver compares the basis (Tier 1) to decide
//     whether synthesis is needed, then carries the same chunks into Synthesize
//     without inspecting them, so a single resolve never does a second recall.
//   - Synthesize runs the LLM step over a prior Gather's chunks → brief. Reached
//     (Tier 2) only when the basis actually changed.
//   - Distill is the whole pipeline (Gather → Synthesize), used by the cold path,
//     Refresh(), and `scout distill`.
//
// The concrete implementation is *distill.Distiller; the interface keeps the
// resolver testable without a live brain or LLM. Contract: a non-empty brief with
// a nil error is a successful distillation. The resolver treats EVERY error as a
// signal to fall back (to the cached brief, then taste.md), so the concrete
// *distill.Distiller never returns an empty brief with a nil error — an empty
// corpus (a healthy brain with nothing to distill) is reported as an error, like
// any other failure. (A test fake may instead return an empty brief with a nil
// error to mean the same "brain knows nothing"; the resolver's "" checks tolerate
// both encodings.)
//
// basis keys the criteria version instead of the brief prose: the brief drifts
// cosmetically across re-distills, so versioning off basis avoids re-scoring
// every company when nothing actually changed (see distill.Result.Basis).
type BriefSource interface {
	Gather(ctx context.Context) (chunks []brainbot.Chunk, basis string, err error)
	Synthesize(ctx context.Context, chunks []brainbot.Chunk) (brief string, err error)
	Distill(ctx context.Context) (brief, basis string, err error)
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

// Resolve returns the current criteria block following the cost cascade in the
// package doc. It never returns a nil block without an error.
func (r *Resolver) Resolve(ctx context.Context) (*taste.Block, error) {
	if r.brainEnabled() {
		url := r.Brain.BaseURL
		cp, _ := r.Store.GetBrainProfile(url)
		hasCache := cp != nil && strings.TrimSpace(cp.Body) != ""

		// Warm path: a cached brief WITH a stored cursor → run the cascade.
		if hasCache && cp.Cursor != "" {
			if blk, err := r.cascade(ctx, url, cp); err == nil {
				return blk, nil
			} else {
				// The cascade only errors when the brain is unverifiable AND the
				// cached brief is past the TTL ceiling — fall through to taste.md.
				r.log("criteria: %v; falling back to %s", err, r.TasteMDPath)
				return taste.LoadFile(r.TasteMDPath)
			}
		}

		// Cold path: no cache, or a pre-0037 row with no cursor → full distill,
		// stored WITH the current cursor so the next resolve takes the warm path.
		if blk, err := r.fetchAndCache(ctx, url); err == nil {
			r.log("criteria: cold distill from %s (cursor stored)", url)
			return blk, nil
		} else if hasCache && r.withinCeiling(cp) {
			// Couldn't refresh (brain unreachable, or healthy-but-empty) but the
			// last brief is still within the TTL ceiling → serve it verbatim.
			r.log("criteria: %v; serving cached brief within ttl ceiling (verified %s)", err, verifiedAgo(cp))
			return blockFromCache(cp, url), nil
		} else {
			r.log("criteria: %v; no usable cache — falling back to %s", err, r.TasteMDPath)
		}
	}

	// Offline fallback.
	return taste.LoadFile(r.TasteMDPath)
}

// cascade runs the change-propagation cost cascade for a cached brief that has a
// stored cursor (cp non-nil, Body and Cursor non-empty). It returns the cached
// brief verbatim unless a real basis change forces a fresh synthesis; it only
// errors when the brain can't be reached for Tier 0 AND the cached brief is past
// the TTL ceiling (the caller then falls back to taste.md).
func (r *Resolver) cascade(ctx context.Context, url string, cp *store.BrainProfile) (*taste.Block, error) {
	// Tier 0: did anything in the brain move since we last confirmed-current?
	cr, err := r.Brain.Changes(ctx, cp.Cursor)
	if err != nil {
		if r.withinCeiling(cp) {
			r.log("criteria: Tier 0 unreachable (%v); serving cached brief within ttl ceiling (verified %s)", err, verifiedAgo(cp))
			return blockFromCache(cp, url), nil
		}
		return nil, fmt.Errorf("brain change-signal unreachable at %s and cached brief past ttl ceiling: %w", url, err)
	}
	if !cr.Changed {
		// Tier 0 hit: nothing moved. Stamp confirmed-current; serve verbatim.
		r.touch(url, cr.Cursor)
		r.log("criteria: Tier 0 — brain unchanged since cursor; cached brief served verbatim")
		return blockFromCache(cp, url), nil
	}

	// changed=true → Tier 1: re-run the recall gather and compare the basis.
	chunks, basis, err := r.Distiller.Gather(ctx)
	if err != nil {
		// A recall hiccup (or a momentarily-empty brain) mid-gather → don't drop
		// the good cached brief; serve it and re-check on the next resolve.
		r.log("criteria: Tier 1 gather failed (%v); serving cached brief", err)
		return blockFromCache(cp, url), nil
	}
	freshVersion := taste.Hash(basis)
	if freshVersion == cp.ContentHash {
		// Tier 1 absorb: the coarse cursor advanced (a re-sync, or an edit to a
		// page this view doesn't draw from) but OUR basis is unchanged. Stamp
		// confirmed-current and serve verbatim — no synthesis, no version bump.
		r.touch(url, cr.Cursor)
		r.log("criteria: Tier 1 — basis unchanged; cursor advanced, brief served verbatim")
		return blockFromCache(cp, url), nil
	}

	// Tier 2: the company-fit-relevant content actually changed → synthesize.
	brief, err := r.Distiller.Synthesize(ctx, chunks)
	if err != nil {
		r.log("criteria: Tier 2 synthesis failed (%v); serving cached brief", err)
		return blockFromCache(cp, url), nil
	}
	brief = strings.TrimSpace(brief)
	if brief == "" {
		r.log("criteria: Tier 2 produced an empty brief; serving cached brief")
		return blockFromCache(cp, url), nil
	}
	if perr := r.Store.PutBrainProfile(url, brief, freshVersion, cr.Cursor); perr != nil {
		r.log("criteria: cache write failed: %v", perr)
	}
	r.log("criteria: Tier 2 — basis changed; re-distilled (version %s)", freshVersion)
	blk := taste.FromBrain(brief, brainSource(url))
	blk.Version = freshVersion
	return blk, nil
}

// touch records "confirmed unchanged as of now" (cursor + verified_at), logging
// a write failure rather than failing the resolve.
func (r *Resolver) touch(url, cursor string) {
	if err := r.Store.TouchBrainProfile(url, cursor); err != nil {
		r.log("criteria: verified-stamp write failed: %v", err)
	}
}

// withinCeiling reports whether a cached brief is still fresh enough to serve
// when the brain can't be reached to verify it. The ceiling is the demoted TTL:
// it measures time since the brief was last CONFIRMED current (verified_at), or,
// for a never-verified legacy row, since it was fetched. A non-positive TTL means
// "no ceiling" — always prefer a cached brief over taste.md when the brain is down.
func (r *Resolver) withinCeiling(cp *store.BrainProfile) bool {
	if r.TTL <= 0 {
		return true
	}
	age := cp.VerifiedAgeSeconds
	if age < 0 {
		age = cp.AgeSeconds
	}
	return time.Duration(age)*time.Second < r.TTL
}

// verifiedAgo renders a cached row's confirmed-current age for logs.
func verifiedAgo(cp *store.BrainProfile) string {
	if cp.VerifiedAgeSeconds < 0 {
		return "never"
	}
	return fmt.Sprintf("%ds ago", cp.VerifiedAgeSeconds)
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

// fetchAndCache health-checks the brain, captures the current change cursor,
// distills the criteria brief, writes the cache (best-effort, stamping
// verified_at + cursor), and returns the block. It is the cold path and the
// Refresh() path — an UNCONDITIONAL full distill. Errors on an unreachable brain
// or an empty (healthy-but-no-criteria) brain.
func (r *Resolver) fetchAndCache(ctx context.Context, url string) (*taste.Block, error) {
	hctx, cancel := context.WithTimeout(ctx, healthTimeout)
	herr := r.Brain.Health(hctx)
	cancel()
	if herr != nil {
		return nil, fmt.Errorf("brain unreachable at %s: %w", url, herr)
	}
	// Capture the brain's cursor BEFORE distilling so the stored cursor reflects
	// (at worst, an earlier snapshot of) the state the brief was built from — if
	// the brain changes mid-distill, the next Tier 0 check conservatively re-checks
	// rather than masking the change. An empty `since` always reports changed=true;
	// we only want the cursor. A cursor read failure is non-fatal: store "" and the
	// next resolve takes the cold path again (e.g. a brain that predates /changes).
	cursor := ""
	if cr, cerr := r.Brain.Changes(ctx, ""); cerr == nil {
		cursor = cr.Cursor
	} else {
		r.log("criteria: cursor read failed during distill (%v); storing empty cursor", cerr)
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
	if err := r.Store.PutBrainProfile(url, brief, version, cursor); err != nil {
		// A cache-write failure shouldn't block scoring — log and continue.
		r.log("criteria: cache write failed: %v", err)
	}
	blk := taste.FromBrain(brief, brainSource(url))
	blk.Version = version
	return blk, nil
}
