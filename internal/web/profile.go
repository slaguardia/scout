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
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
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
func (s *Server) profilePayload(ctx context.Context, skipHealth bool) map[string]any {
	configured := s.Brainbot != nil && s.Brainbot.Enabled()
	out := map[string]any{"configured": configured}
	if configured {
		out["source_url"] = s.Brainbot.BaseURL
		out["reachable"] = skipHealth || s.brainHealthy(ctx)
	}
	if s.Resolver != nil {
		out["ttl_seconds"] = int64(s.Resolver.TTL.Seconds())
		if cp, err := s.Resolver.Cached(); err == nil && cp != nil {
			out["body"] = cp.Body
			out["chars"] = len([]rune(cp.Body))
			out["fetched_at"] = cp.FetchedAt
			out["age_seconds"] = cp.AgeSeconds
			out["stale"] = s.Resolver.TTL > 0 && time.Duration(cp.AgeSeconds)*time.Second >= s.Resolver.TTL
		}
	}
	if tb := s.currentTaste(); tb != nil {
		out["active_source"] = tb.Source
		out["active_version"] = tb.Version
	}
	return out
}
