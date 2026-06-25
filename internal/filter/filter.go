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

// Taste is the structured pre-filter rule set (parsed from the singleton's
// TOML). The JSON tags expose the same shape to the dashboard's form editor —
// GET returns the parsed rules, PUT accepts them and re-encodes to TOML.
type Taste struct {
	Location struct {
		Allowed  []string `toml:"allowed" json:"allowed"`
		RemoteOK bool     `toml:"remote_ok" json:"remote_ok"`
	} `toml:"location" json:"location"`
	Headcount struct {
		Min int64 `toml:"min" json:"min"`
		Max int64 `toml:"max" json:"max"`
	} `toml:"headcount" json:"headcount"`
	Verticals struct {
		Allowed  []string `toml:"allowed" json:"allowed"`
		Excluded []string `toml:"excluded" json:"excluded"`
	} `toml:"verticals" json:"verticals"`
	FundingStage struct {
		Allowed []string `toml:"allowed" json:"allowed"`
	} `toml:"funding_stage" json:"funding_stage"`

	// Enabled is the master on/off switch, set from the DB (not the TOML) — a
	// disabled filter passes every company. Defaults to true so a directly
	// parsed rule set behaves like an active filter.
	Enabled bool `toml:"-" json:"-"`
}

// EncodeTOML serializes the rule set back to TOML — the storage format used by
// the singleton row and the compiled-in default. The form editor uses it to
// turn structured input back into the canonical on-disk shape. Enabled is
// excluded (toml:"-"); the master switch is stored separately in the DB.
func (t *Taste) EncodeTOML() (string, error) {
	var buf strings.Builder
	if err := toml.NewEncoder(&buf).Encode(t); err != nil {
		return "", fmt.Errorf("encode taste: %w", err)
	}
	return buf.String(), nil
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

	// Location — substring match is correct here: a free-form location string
	// ("San Francisco, CA") should match the rule "san francisco".
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

	// Verticals — the field is a comma-separated tag set ("Artificial
	// Intelligence (AI), Software"), so we match whole tags, not substrings of
	// the joined string. That's the difference between excluding the tag "Law"
	// and accidentally nuking "Law Enforcement" (a distinct tag).
	tags := verticalTags(s.Vertical)

	// Excluded verticals (hard reject): any company tag equal to an excluded term.
	for _, ex := range t.Verticals.Excluded {
		if ex = strings.ToLower(strings.TrimSpace(ex)); ex != "" && containsStr(tags, ex) {
			return "vertical_excluded"
		}
	}

	// Allowed verticals (if specified): at least one tag must match.
	if len(t.Verticals.Allowed) > 0 {
		ok := false
		for _, a := range t.Verticals.Allowed {
			if a = strings.ToLower(strings.TrimSpace(a)); a != "" && containsStr(tags, a) {
				ok = true
				break
			}
		}
		if !ok {
			return "vertical_not_allowed"
		}
	}

	// Funding stage — match on the normalized canonical label so "Pre Seed",
	// "pre-seed", and the rule "Pre-Seed" all line up.
	if len(t.FundingStage.Allowed) > 0 {
		stage := NormalizeStage(s.Stage)
		ok := false
		for _, a := range t.FundingStage.Allowed {
			if stage != "" && NormalizeStage(a) == stage {
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

// verticalTags splits a company's comma-separated vertical field into normalized
// (lowercased, trimmed) tags. Empty fragments are dropped.
func verticalTags(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.ToLower(strings.TrimSpace(p)); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func containsStr(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
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

// CanonicalStages is the normalized funding-stage vocabulary, ordered earliest
// to latest. The dashboard's stage multi-select offers these; matching compares
// the canonical labels (see NormalizeStage), so raw data like "Pre Seed" and a
// saved rule "Pre-Seed" line up.
var CanonicalStages = []string{"Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E+", "Growth", "Public"}

// NormalizeStage maps a raw funding-stage string to one of CanonicalStages. An
// unrecognized non-empty value is returned trimmed (so unusual stages stay
// selectable and matchable); a blank value normalizes to "".
func NormalizeStage(raw string) string {
	k := strings.NewReplacer(" ", "", "-", "", ".", "", "_", "").Replace(strings.ToLower(raw))
	switch k {
	case "":
		return ""
	case "preseed", "pre":
		return "Pre-Seed"
	case "seed":
		return "Seed"
	case "seriesa", "a":
		return "Series A"
	case "seriesb", "b":
		return "Series B"
	case "seriesc", "c":
		return "Series C"
	case "seriesd", "d":
		return "Series D"
	case "seriese", "e", "seriesf", "f", "seriesg", "g":
		return "Series E+"
	}
	switch {
	case strings.Contains(k, "growth"), strings.Contains(k, "late"):
		return "Growth"
	case strings.Contains(k, "ipo"), strings.Contains(k, "public"):
		return "Public"
	}
	return strings.TrimSpace(raw)
}
