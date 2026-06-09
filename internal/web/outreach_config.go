package web

import (
	"encoding/json"
	"net/http"

	"github.com/slaguardia/scout/internal/outreach"
)

// handleOutreachConfig is the outreach knobs editor:
//
//	GET /api/outreach/config -> the effective config (stored, or the compiled-in
//	                            defaults when none is set)
//	PUT /api/outreach/config -> validate + upsert {word_min, word_max,
//	                            subject_format, structure[]}
//
// The config lives only in the local DB. The engine reads it fresh at draft
// time, so a save takes effect on the next draft with no restart. An invalid
// config (bad word window, or a structure that can't render — e.g. a model slot
// that is not a drafter paragraph, or PAST_EXPERIENCE_FULL placed in the body)
// is rejected 400; drafting never runs on something unrenderable.
func (s *Server) handleOutreachConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cfg, err := outreach.LoadConfig(s.DB)
		if err != nil {
			http.Error(w, "load config: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, cfg)

	case http.MethodPut:
		var in outreach.Config
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&in); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := outreach.SaveConfig(s.DB, in); err != nil {
			http.Error(w, "save config: "+err.Error(), http.StatusBadRequest)
			return
		}
		cfg, err := outreach.LoadConfig(s.DB)
		if err != nil {
			http.Error(w, "reload config: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, cfg)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
