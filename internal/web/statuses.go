package web

import (
	"encoding/json"
	"net/http"
	"strings"
)

// handleOutreachStatuses / handleApplicationStages read and write the two
// user-configurable status vocabularies (the dropdown labels for the jobs view's
// reply axis and application axis). GET -> {statuses: [...]}; PUT {statuses:
// [...]} replaces the list (empty/garbage rejected as 400). DB singletons, like
// the email template — no Runner involved.
func (s *Server) handleOutreachStatuses(w http.ResponseWriter, r *http.Request) {
	s.handleStatusList(w, r, s.DB.OutreachStatuses, s.DB.SetOutreachStatuses)
}

func (s *Server) handleApplicationStages(w http.ResponseWriter, r *http.Request) {
	s.handleStatusList(w, r, s.DB.ApplicationStages, s.DB.SetApplicationStages)
}

func (s *Server) handleStatusList(w http.ResponseWriter, r *http.Request, get func() ([]string, error), set func([]string) error) {
	switch r.Method {
	case http.MethodGet:
		list, err := get()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"statuses": list})

	case http.MethodPut, http.MethodPost:
		var body struct {
			Statuses []string `json:"statuses"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := set(body.Statuses); err != nil {
			if strings.HasPrefix(err.Error(), "statuses ") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		list, err := get()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"statuses": list})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
