package web

import (
	"os"

	"github.com/slaguardia/scout/internal/store"
)

// activeAnthropicKey resolves the Anthropic key in effect and where it came from:
// a UI-stored key ("db") wins over ANTHROPIC_API_KEY ("env"); neither -> ("", "").
// The twin of the brain's _active_anthropic_key. DB-over-env so an owner can
// provision the key from the dashboard without redeploying, and removing it falls
// back to the env.
func (s *Server) activeAnthropicKey() (key, source string) {
	if s.DB != nil {
		if v, err := s.DB.GetSetting(store.AnthropicKeySetting); err == nil && v != "" {
			return v, "db"
		}
	}
	if v := os.Getenv("ANTHROPIC_API_KEY"); v != "" {
		return v, "env"
	}
	return "", ""
}

// ensureAnthropicKey resolves the live key and re-keys the shared client so a
// dashboard key change takes effect with no restart. Returns the resolved key so
// a call-time-gated handler can do `if s.ensureAnthropicKey() == "" { 412 }`.
// Cheap (one indexed SQLite read + a locked string swap) — fine per request.
func (s *Server) ensureAnthropicKey() string {
	key, _ := s.activeAnthropicKey()
	if s.Anthropic != nil {
		s.Anthropic.SetAPIKey(key)
	}
	return key
}

// EnsureAnthropicKey seeds the shared client's key from the DB-over-env resolver.
// The exported entry point cmdServe calls once at startup (before it decides
// whether to wire the startup-only engines), so a dashboard-stored key from a
// prior run is in effect at boot.
func (s *Server) EnsureAnthropicKey() { s.ensureAnthropicKey() }

// afterKeyChange is the single seam invoked after the dashboard stores or removes
// the key. Under the current MVP the call-time-gated features (verdict, capture,
// discovery, enrichment) pick up the new key on their next request via
// ensureAnthropicKey, so nothing more is needed here. The startup-wired engines
// (outreach, chat, answers) are built in cmdServe only when a key was present at
// boot; lighting them up after a first-ever key save still needs a restart. This
// hook is where lazy engine wiring would slot in if that restart proves annoying.
func (s *Server) afterKeyChange() {}
