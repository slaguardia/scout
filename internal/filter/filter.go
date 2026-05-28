// Package filter applies the taste rules against the companies table.
package filter

import (
	"fmt"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/slaguardia/scout/internal/store"
)

// Taste is the structured rule set loaded from taste.toml.
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
}

// LoadTaste reads a taste.toml from path.
func LoadTaste(path string) (*Taste, error) {
	var t Taste
	if _, err := toml.DecodeFile(path, &t); err != nil {
		return nil, fmt.Errorf("load taste: %w", err)
	}
	return &t, nil
}

// Survivor is the projection returned for triage.
type Survivor struct {
	ID        int64
	Name      string
	Domain    string
	Location  string
	Vertical  string
	Headcount int64
	Stage     string
}

// Apply runs the rules and returns survivors, plus a summary breakdown of why rows were dropped.
type Result struct {
	Total      int
	Survivors  []Survivor
	DroppedBy  map[string]int // reason -> count
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
