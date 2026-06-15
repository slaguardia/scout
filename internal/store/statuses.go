package store

import (
	"encoding/json"
	"fmt"
	"strings"
)

// The two user-configurable status vocabularies, stored as JSON string arrays in
// the generic settings table (singletons, like the Anthropic key). They drive
// the dropdowns in the jobs view; "none" (empty) is always implicitly available
// and is NOT part of either list.
const (
	OutreachStatusesSetting  = "outreach_statuses"
	ApplicationStagesSetting = "application_stages"
	maxStatusListLen         = 30 // generous cap; the UI never needs this many
	maxStatusLabelLen        = 40
)

// DefaultOutreachStatuses is the reply axis: where a thread of outreach stands.
var DefaultOutreachStatuses = []string{"initial contact", "no response", "replied", "followed up"}

// DefaultApplicationStages is the application axis: the furthest pipeline stage
// reached. Ordered as a progression (the jobs view sorts by this order).
var DefaultApplicationStages = []string{"applied", "screening", "interview", "offer", "rejected"}

// statusList reads a JSON-array status setting, returning the default when unset
// or unparseable so a corrupt row never empties the dropdowns.
func (db *DB) statusList(key string, def []string) ([]string, error) {
	v, err := db.GetSetting(key)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(v) == "" {
		return append([]string(nil), def...), nil
	}
	var list []string
	if err := json.Unmarshal([]byte(v), &list); err != nil {
		return append([]string(nil), def...), nil
	}
	cleaned := sanitizeStatusList(list)
	if len(cleaned) == 0 {
		return append([]string(nil), def...), nil
	}
	return cleaned, nil
}

// setStatusList validates and stores a status list. The list must be non-empty;
// each label is trimmed, empties dropped, and case-insensitive duplicates
// collapsed (first spelling wins). Errors are prefixed "statuses " so the web
// layer can map them to a 400.
func (db *DB) setStatusList(key string, list []string) error {
	cleaned := sanitizeStatusList(list)
	if len(cleaned) == 0 {
		return fmt.Errorf("statuses must include at least one label")
	}
	if len(cleaned) > maxStatusListLen {
		return fmt.Errorf("statuses list is too long (max %d)", maxStatusListLen)
	}
	b, err := json.Marshal(cleaned)
	if err != nil {
		return err
	}
	return db.SetSetting(key, string(b))
}

// sanitizeStatusList trims, drops empties + over-long labels, and de-dupes
// case-insensitively (first spelling wins), preserving order.
func sanitizeStatusList(list []string) []string {
	out := make([]string, 0, len(list))
	seen := map[string]bool{}
	for _, s := range list {
		s = strings.TrimSpace(s)
		if s == "" || len(s) > maxStatusLabelLen {
			continue
		}
		key := strings.ToLower(s)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, s)
	}
	return out
}

// OutreachStatuses returns the configured outreach-status labels (or the
// default). SetOutreachStatuses persists a new list.
func (db *DB) OutreachStatuses() ([]string, error) {
	return db.statusList(OutreachStatusesSetting, DefaultOutreachStatuses)
}

func (db *DB) SetOutreachStatuses(list []string) error {
	return db.setStatusList(OutreachStatusesSetting, list)
}

// ApplicationStages returns the configured application-stage labels (or the
// default). SetApplicationStages persists a new list.
func (db *DB) ApplicationStages() ([]string, error) {
	return db.statusList(ApplicationStagesSetting, DefaultApplicationStages)
}

func (db *DB) SetApplicationStages(list []string) error {
	return db.setStatusList(ApplicationStagesSetting, list)
}
