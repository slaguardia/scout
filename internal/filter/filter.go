// Package filter applies the pre-filter rules against the companies table. The
// rules live in the DB as a singleton (edited from the dashboard); this package
// parses the raw TOML and evaluates it. The compiled-in default is used until
// the user saves their own.
package filter

import (
	_ "embed"
	"fmt"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/slaguardia/scout/internal/store"
)

// DefaultTasteTOML is the compiled-in starting pre-filter, used until the user
// saves their own from the dashboard. Kept as a reviewable TOML file and
// embedded so the default is a single source of truth.
//
//go:embed taste_default.toml
var DefaultTasteTOML string

// Taste is the structured pre-filter rule set (parsed from the singleton's TOML).
type Taste struct {
	Location struct {
		Allowed  []string `toml:"allowed"`
		RemoteOK bool     `toml:"remote_ok"`
	} `toml:"location"`
	Headcount struct {
		Min int64 `toml:"min"`
		Max int64 `toml:"max"`
	} `toml:"headcount"`
	Verticals struct {
		Allowed  []string `toml:"allowed"`
		Excluded []string `toml:"excluded"`
	} `toml:"verticals"`
	FundingStage struct {
		Allowed []string `toml:"allowed"`
	} `toml:"funding_stage"`

	// Enabled is the master on/off switch, set from the DB (not the TOML) — a
	// disabled filter passes every company. Defaults to true so a directly
	// parsed rule set behaves like an active filter.
	Enabled bool `toml:"-"`
}

// ParseTaste parses pre-filter rules from raw TOML text. A blank string yields
// a zero Taste (everything passes the verticals/stage rules; headcount bounds
// at 0 mean "no bound") — callers wanting the default should pass DefaultTasteTOML.
// The returned filter is Enabled; callers gate that separately (see TasteFromDB).
func ParseTaste(content string) (*Taste, error) {
	var t Taste
	if _, err := toml.Decode(content, &t); err != nil {
		return nil, fmt.Errorf("parse taste: %w", err)
	}
	t.Enabled = true
	return &t, nil
}

// TasteFromDB loads the saved pre-filter rules from the singleton row, falling
// back to the compiled-in default when none is saved (or on a read error — a
// run shouldn't break because the rules row is missing). It also carries the
// enabled flag: a disabled filter still parses, but Apply passes everything.
// This is the canonical way to obtain the active filter; there is no longer a
// file on disk.
func TasteFromDB(db *store.DB) (*Taste, error) {
	content, enabled := DefaultTasteTOML, true
	if db != nil {
		if c, en, err := db.GetTasteFilter(); err == nil {
			enabled = en
			if strings.TrimSpace(c) != "" {
				content = c
			}
		}
	}
	t, err := ParseTaste(content)
	if err != nil {
		return nil, err
	}
	t.Enabled = enabled
	return t, nil
}

// Survivor is the projection returned for triage.
type Survivor struct {
	ID        string
	Name      string
	Domain    string
	Location  string
	Vertical  string
	Headcount int64
	Stage     string
}

// Apply runs the rules and returns survivors, plus a summary breakdown of why rows were dropped.
type Result struct {
	Total     int
	Survivors []Survivor
	DroppedBy map[string]int // reason -> count
}

func (t *Taste) Apply(db *store.DB) (*Result, error) {
	total, err := db.CountCompanies()
	if err != nil {
		return nil, err
	}

	// Pull all rows, evaluate in Go. SQLite-side filtering would be faster, but we want
	// per-reason drop counts for visibility and the row counts here are small (low thousands).
	rows, err := db.Query(`
SELECT id, name, COALESCE(domain,''), COALESCE(location,''), COALESCE(vertical,''),
       COALESCE(headcount, 0), COALESCE(funding_stage,'')
FROM companies`)
	if err != nil {
		return nil, fmt.Errorf("scan companies: %w", err)
	}
	defer rows.Close()

	res := &Result{Total: total, DroppedBy: map[string]int{}}
	for rows.Next() {
		var s Survivor
		if err := rows.Scan(&s.ID, &s.Name, &s.Domain, &s.Location, &s.Vertical, &s.Headcount, &s.Stage); err != nil {
			return nil, err
		}
		if reason := t.evaluate(s); reason != "" {
			res.DroppedBy[reason]++
			continue
		}
		res.Survivors = append(res.Survivors, s)
	}
	return res, rows.Err()
}

// evaluate returns "" if the row passes, or the reason it was dropped.
func (t *Taste) evaluate(s Survivor) string {
	// Master switch: a disabled pre-filter passes everything, so a bulk verdict
	// run scores every company.
	if !t.Enabled {
		return ""
	}

	loc := strings.ToLower(s.Location)
	vert := strings.ToLower(s.Vertical)

	// Location
	if !t.locationOK(loc) {
		return "location"
	}

	// Headcount (only checked when we have a value)
	if s.Headcount > 0 {
		if t.Headcount.Min > 0 && s.Headcount < t.Headcount.Min {
			return "headcount_min"
		}
		if t.Headcount.Max > 0 && s.Headcount > t.Headcount.Max {
			return "headcount_max"
		}
	}

	// Excluded verticals (hard reject)
	for _, ex := range t.Verticals.Excluded {
		if ex != "" && strings.Contains(vert, strings.ToLower(ex)) {
			return "vertical_excluded"
		}
	}

	// Allowed verticals (if specified)
	if len(t.Verticals.Allowed) > 0 {
		ok := false
		for _, a := range t.Verticals.Allowed {
			if a != "" && strings.Contains(vert, strings.ToLower(a)) {
				ok = true
				break
			}
		}
		if !ok {
			return "vertical_not_allowed"
		}
	}

	// Funding stage
	if len(t.FundingStage.Allowed) > 0 {
		stage := strings.ToLower(s.Stage)
		ok := false
		for _, a := range t.FundingStage.Allowed {
			if a != "" && strings.Contains(stage, strings.ToLower(a)) {
				ok = true
				break
			}
		}
		if !ok {
			return "funding_stage"
		}
	}

	return ""
}

func (t *Taste) locationOK(loc string) bool {
	if loc == "" {
		// No location data — pass only if remote_ok (we can't verify, give benefit of the doubt).
		return t.Location.RemoteOK
	}
	for _, a := range t.Location.Allowed {
		if a != "" && strings.Contains(loc, strings.ToLower(a)) {
			return true
		}
	}
	return false
}
