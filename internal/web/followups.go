package web

import (
	"encoding/json"
	"net/http"
	"strings"
)

// handleFollowUps serves the follow-up queue: every posting overdue for a nudge
// under the current cadence, most-overdue first. GET /api/follow-ups ->
// {follow_ups: [...], interval_days: N, count: M}. An empty queue returns an
// empty array (never null), so the view renders its empty state, not a break.
// A read-only view over the postings table — no Runner involved.
func (s *Server) handleFollowUps(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.DB.ListFollowUpsDue()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	interval, err := s.DB.FollowUpIntervalDays()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"follow_ups":    rows,
		"interval_days": interval,
		"count":         len(rows),
	})
}

// handleFollowUpInterval reads/writes the follow-up cadence singleton. GET
// /api/settings/follow-up-interval -> {days: N}; PUT {days: N} updates it. A
// non-positive or non-integer value is a 400 (the JSON decode rejects a
// non-integer; the store rejects <1). Returns the stored value on success.
func (s *Server) handleFollowUpInterval(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		days, err := s.DB.FollowUpIntervalDays()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"days": days})

	case http.MethodPut, http.MethodPost:
		var body struct {
			Days int `json:"days"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.SetFollowUpIntervalDays(body.Days); err != nil {
			if strings.HasPrefix(err.Error(), "days ") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		days, err := s.DB.FollowUpIntervalDays()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"days": days})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
