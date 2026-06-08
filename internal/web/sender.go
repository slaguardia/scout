package web

import (
	"encoding/json"
	"net/http"

	"github.com/slaguardia/scout/internal/outreach"
	"github.com/slaguardia/scout/internal/store"
)

// handleOutreachSender is the outreach identity editor.
//
//	GET  /api/outreach/sender -> the effective sender (stored identity, or the
//	                             neutral compiled-in default when none is set)
//	PUT  /api/outreach/sender -> upsert the identity {subject_name, signature,
//	                             lens, hook_prefs, arc}
//
// The identity lives only in the local DB — no personal data is baked into the
// repo. The engine reads it fresh from the DB at draft time, so a save takes
// effect on the next draft with no restart.
func (s *Server) handleOutreachSender(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, effectiveSender(s.DB))

	case http.MethodPut:
		var in store.SenderIdentity
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditorBytes)).Decode(&in); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.PutSenderIdentity(in); err != nil {
			http.Error(w, "save sender: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, in)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// effectiveSender mirrors the engine's resolution so the UI shows exactly what
// a draft would use: the stored identity, or the neutral compiled-in default
// when none is set.
func effectiveSender(db *store.DB) store.SenderIdentity {
	if db != nil {
		if got, err := db.GetSenderIdentity(); err == nil && got != nil {
			return *got
		}
	}
	d := outreach.DefaultSender
	return store.SenderIdentity{
		SubjectName: d.SubjectName, Signature: d.Signature,
		Lens: d.Lens, HookPrefs: d.HookPrefs, Arc: d.Arc,
	}
}
