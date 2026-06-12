package web

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

// handleAnthropicKey is the dashboard's Anthropic-key integration:
//
//	GET    /api/integrations/anthropic -> {has_key, key_source}   (never the key)
//	PUT    /api/integrations/anthropic {key} -> verify, store, re-key the client
//	DELETE /api/integrations/anthropic       -> remove the DB key, fall back to env
//
// The key is write-only from the browser: we store it but never echo it back. A
// UI-stored key wins over ANTHROPIC_API_KEY; removing it falls back to the env.
// PUT validates the key against the API before storing (a 401 → 400) so a typo
// can't silently disable scoring.
func (s *Server) handleAnthropicKey(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		_, source := s.activeAnthropicKey()
		writeJSON(w, http.StatusOK, map[string]any{
			"has_key": source != "", "key_source": nullable(source),
		})

	case http.MethodPut:
		var body struct {
			Key string `json:"key"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil || strings.TrimSpace(body.Key) == "" {
			http.Error(w, "missing required field: key", http.StatusBadRequest)
			return
		}
		key := strings.TrimSpace(body.Key)
		verify := s.KeyVerifier
		if verify == nil {
			verify = anthropic.Verify
		}
		if err := verify(r.Context(), key); err != nil {
			http.Error(w, "Anthropic rejected the key: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.SetSetting(store.AnthropicKeySetting, key); err != nil {
			http.Error(w, "store failed", http.StatusInternalServerError)
			return
		}
		if s.Anthropic != nil {
			s.Anthropic.SetAPIKey(key)
		}
		s.afterKeyChange()
		writeJSON(w, http.StatusOK, map[string]any{"has_key": true, "key_source": "db"})

	case http.MethodDelete:
		if err := s.DB.DeleteSetting(store.AnthropicKeySetting); err != nil {
			http.Error(w, "remove failed", http.StatusInternalServerError)
			return
		}
		key, source := s.activeAnthropicKey() // may fall back to env
		if s.Anthropic != nil {
			s.Anthropic.SetAPIKey(key)
		}
		s.afterKeyChange()
		writeJSON(w, http.StatusOK, map[string]any{"has_key": source != "", "key_source": nullable(source)})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// nullable maps "" to a JSON null and any other string to itself, so key_source
// serializes as null / "db" / "env" — matching the brain's integration shape.
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
