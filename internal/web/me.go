package web

import "net/http"

// handleMe echoes the signed-in identity for the PWA's session helper. Auth
// lives at the shared edge (oauth2-proxy injects X-Auth-Request-Email); this
// handler reads ONLY that trusted header — never a client-supplied value — and
// returns {"email": "..."} when present, or {} when there is none (local dev
// with no edge in front). Always HTTP 200: "no identity" is a normal state, not
// an error, and the toolkit's currentUser() treats a missing email as null.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email := r.Header.Get("X-Auth-Request-Email")
	if email == "" {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": email})
}
