package web

import (
	"context"
	"net/http"
	"time"
)

// The profile endpoints expose the locally-cached brain profile read-only, so
// the user can see exactly what the brain returned (and tell at a glance whether
// the brain is working), plus refresh it on demand. They never write the brain —
// refresh only re-reads /profile and updates the local cache.

// handleProfile (GET /api/profile) returns the cached criteria text the verdict
// stage feeds the LLM, plus freshness metadata. Read-only.
func (s *Server) handleProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, s.profilePayload(r.Context(), false))
}

// handleProfileRefresh (POST /api/profile/refresh) forces a refetch of the brain
// profile, updates the cache, and rebuilds the active criteria (the version may
// change → verdicts go stale). Returns the refreshed payload, or 502 when the
// brain is unreachable or has no criteria captured yet.
func (s *Server) handleProfileRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.Resolver == nil || s.Brainbot == nil || !s.Brainbot.Enabled() {
		http.Error(w, "brain not configured", http.StatusNotFound)
		return
	}
	// Distillation is two sequential Sonnet calls (classify, then synthesize)
	// after a recall fan-out — 25s wasn't enough headroom and the refresh died
	// mid-classify with a deadline error. Give it room; this is a manual button
	// press, not a hot path.
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
	defer cancel()
	if _, err := s.Resolver.Refresh(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	s.ReloadTaste() // adopt the refreshed criteria immediately
	writeJSON(w, http.StatusOK, s.profilePayload(r.Context(), true))
}

// profilePayload assembles the profile view: configuration + reachability, the
// cached body + freshness, and the currently-active criteria source/version.
// skipHealth avoids a redundant liveness probe right after a successful refresh.
//
// It emits criteria_state (current | unverified | changed) instead of the old
// age>=TTL "stale" boolean — an honest read of whether the cached brief is
// confirmed current against the brain, derived by criteriaState below. The only
// brain call it makes is at most ONE cheap Tier 0 /changes probe (no recall, no
// LLM, no distill — the same cost class as the /health probe), so handleProfile
// stays a cheap read.
func (s *Server) profilePayload(ctx context.Context, skipHealth bool) map[string]any {
	configured := s.Brainbot != nil && s.Brainbot.Enabled()
	out := map[string]any{"configured": configured}
	reachable := false
	if configured {
		out["source_url"] = s.Brainbot.BaseURL
		reachable = skipHealth || s.brainHealthy(ctx)
		out["reachable"] = reachable
	}
	if s.Resolver != nil {
		ttl := s.Resolver.TTL
		out["ttl_seconds"] = int64(ttl.Seconds())
		if cp, err := s.Resolver.Cached(); err == nil && cp != nil {
			out["body"] = cp.Body
			out["chars"] = len([]rune(cp.Body))
			out["fetched_at"] = cp.FetchedAt
			out["age_seconds"] = cp.AgeSeconds
			out["verified_at"] = cp.VerifiedAt
			out["verified_age_seconds"] = cp.VerifiedAgeSeconds

			// Tier 0 change probe: one cheap /changes call to see whether the brain
			// moved since we last confirmed-current. Only when it can help and is
			// cheap — configured, reachable, a cursor to compare, and NOT right
			// after a refresh (which just confirmed it). Bounded so a hung brain
			// can't stall the panel; on any error we simply don't probe.
			changed, probed := false, false
			if configured && reachable && !skipHealth && cp.Cursor != "" {
				pctx, cancel := context.WithTimeout(ctx, 3*time.Second)
				if cr, cerr := s.Brainbot.Changes(pctx, cp.Cursor); cerr == nil {
					changed, probed = cr.Changed, true
				}
				cancel()
			}
			out["criteria_state"] = criteriaState(cp.Cursor != "", cp.VerifiedAgeSeconds, cp.AgeSeconds, ttl, changed, probed)
		}
	}
	if tb := s.currentTaste(); tb != nil {
		out["active_source"] = tb.Source
		out["active_version"] = tb.Version
	}
	return out
}

// criteriaState derives the Criteria-panel badge from cheap, already-available
// signals — it is pure/display-only and never runs a recall or a distill. Three
// states:
//
//   - "current"    — confirmed current against the brain: either a fresh Tier 0
//     /changes probe reported no change (probed && !changed), or — when we can't
//     probe (brain unreachable / probe skipped) — the brief was confirmed-current
//     within the TTL ceiling.
//   - "changed"    — a Tier 0 probe reported the brain moved since we last
//     confirmed-current; a re-distill is pending (the Refresh action re-distills
//     and returns the panel to "current").
//   - "unverified" — we cannot assert current: no cursor yet (a pre-0037 / never-
//     confirmed row), or the brain is unreachable AND the last confirmation is
//     older than the TTL ceiling.
//
// probed reports whether a fresh /changes result is available; changed is only
// meaningful when probed is true. The handler does the one cheap probe; this
// function just classifies.
func criteriaState(cursorPresent bool, verifiedAgeSeconds, ageSeconds int64, ttl time.Duration, changed, probed bool) string {
	if !cursorPresent || verifiedAgeSeconds < 0 {
		return "unverified"
	}
	if probed {
		if changed {
			return "changed"
		}
		return "current"
	}
	if withinTTLCeiling(verifiedAgeSeconds, ageSeconds, ttl) {
		return "current"
	}
	return "unverified"
}

// withinTTLCeiling mirrors the resolver's demoted-TTL ceiling: time since the
// brief was last CONFIRMED current (verified_at), or, for a never-verified legacy
// row, since it was fetched. A non-positive TTL means "no ceiling".
func withinTTLCeiling(verifiedAgeSeconds, ageSeconds int64, ttl time.Duration) bool {
	if ttl <= 0 {
		return true
	}
	age := verifiedAgeSeconds
	if age < 0 {
		age = ageSeconds
	}
	return time.Duration(age)*time.Second < ttl
}
