package web

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/slaguardia/scout/internal/store"
)

// handleCompanyContacts is the company's contact list (M51). Dispatched from
// handleCompany for /api/companies/{id}/contacts.
//
//	GET  → list the company's active contacts
//	POST → create a contact {name, role, email}
func (s *Server) handleCompanyContacts(w http.ResponseWriter, r *http.Request, companyID string) {
	switch r.Method {
	case http.MethodGet:
		contacts, err := s.DB.ListContacts(companyID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, contacts)
	case http.MethodPost:
		var in store.ContactInput
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		c, err := s.DB.CreateContact(companyID, in)
		if err != nil {
			writeContactErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, c)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleContact edits or archives one contact. PUT/DELETE /api/contacts/{id}.
func (s *Server) handleContact(w http.ResponseWriter, r *http.Request) {
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/contacts/"), "/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPut:
		var in store.ContactInput
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		c, err := s.DB.UpdateContact(id, in)
		if err != nil {
			writeContactErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, c)
	case http.MethodDelete:
		if err := s.DB.ArchiveContact(id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"id": id})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// writeContactErr maps store contact errors to HTTP codes: unknown id → 404,
// duplicate email → 409, validation → 400, else 500.
func writeContactErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		http.Error(w, "not found", http.StatusNotFound)
	case errors.Is(err, store.ErrDuplicateContact):
		http.Error(w, err.Error(), http.StatusConflict)
	case strings.Contains(err.Error(), "contact "):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handlePostingOutreachLog is a posting's per-contact send log (M51).
// Dispatched from handlePosting for /api/postings/{id}/outreach-log.
//
//	GET  → list the posting's sends (newest first)
//	POST → log a send {contact_id, sent_at?, note?, followup_due_at?, no_followup?}
func (s *Server) handlePostingOutreachLog(w http.ResponseWriter, r *http.Request, postingID string) {
	switch r.Method {
	case http.MethodGet:
		entries, err := s.DB.ListOutreachForPosting(postingID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, entries)
	case http.MethodPost:
		var body struct {
			ContactID string `json:"contact_id"`
			store.OutreachInput
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.ContactID) == "" {
			http.Error(w, "contact_id is required", http.StatusBadRequest)
			return
		}
		e, err := s.DB.LogOutreach(postingID, body.ContactID, body.OutreachInput)
		if err != nil {
			writeOutreachErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, e)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleOutreachLog edits or deletes one logged send. PUT/DELETE
// /api/outreach-log/{id}.
func (s *Server) handleOutreachLog(w http.ResponseWriter, r *http.Request) {
	raw := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/outreach-log/"), "/")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPut:
		var e store.OutreachEntryEdit
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&e); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		out, err := s.DB.UpdateOutreachEntry(id, e)
		if err != nil {
			writeOutreachErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, out)
	case http.MethodDelete:
		if err := s.DB.DeleteOutreachEntry(id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"id": id})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// writeOutreachErr maps store outreach errors: unknown id → 404, the
// contact/date validation messages → 400, else 500.
func writeOutreachErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		http.Error(w, "not found", http.StatusNotFound)
	case strings.HasSuffix(err.Error(), "must be a YYYY-MM-DD date"),
		strings.HasPrefix(err.Error(), "contact not found"):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleFollowupInterval gets or sets the default follow-up interval in business
// days (M51). GET → {days}; PUT {days} → stores it (0–90; 0 disables auto-arm).
func (s *Server) handleFollowupInterval(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		n, err := s.DB.FollowupIntervalDays()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"days": n})
	case http.MethodPut:
		var body struct {
			Days int `json:"days"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.DB.SetFollowupIntervalDays(body.Days); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"days": body.Days})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
