package filter

import "testing"

// A disabled pre-filter must pass every company so a bulk verdict run scores
// everything — even a row that an enabled filter would drop.
func TestDisabledFilterPassesEverything(t *testing.T) {
	var tas Taste
	tas.Verticals.Excluded = []string{"law"}
	tas.Location.RemoteOK = true

	// "Law Enforcement" matches the "law" exclusion substring.
	row := Survivor{ID: "1", Name: "Peregrine", Vertical: "Law Enforcement, GovTech"}

	tas.Enabled = true
	if got := tas.evaluate(row); got != "vertical_excluded" {
		t.Fatalf("enabled: want drop reason vertical_excluded, got %q", got)
	}

	tas.Enabled = false
	if got := tas.evaluate(row); got != "" {
		t.Fatalf("disabled: want pass (\"\"), got drop reason %q", got)
	}
}

// ParseTaste yields an enabled filter by default (a directly parsed rule set
// behaves like an active filter; the DB layer sets enabled explicitly).
func TestParseTasteEnabledByDefault(t *testing.T) {
	tas, err := ParseTaste(DefaultTasteTOML)
	if err != nil {
		t.Fatalf("parse default: %v", err)
	}
	if !tas.Enabled {
		t.Fatal("ParseTaste should default Enabled=true")
	}
}
