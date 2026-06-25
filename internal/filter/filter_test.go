package filter

import "testing"

// A disabled pre-filter must pass every company so a bulk verdict run scores
// everything — even a row that an enabled filter would drop.
func TestDisabledFilterPassesEverything(t *testing.T) {
	var tas Taste
	tas.Verticals.Excluded = []string{"Law Enforcement"}
	tas.Location.RemoteOK = true

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

// Vertical matching is whole-tag, not substring: excluding "law" must NOT drop a
// company whose vertical carries the distinct tag "Law Enforcement". Excluding
// the actual tag does. This is the bug the structured form was built to kill.
func TestVerticalTagExactMatch(t *testing.T) {
	row := Survivor{ID: "1", Vertical: "Law Enforcement, GovTech"}
	base := func() Taste { var x Taste; x.Enabled = true; x.Location.RemoteOK = true; return x }

	t.Run("fragment does not match", func(t *testing.T) {
		tas := base()
		tas.Verticals.Excluded = []string{"law"}
		if got := tas.evaluate(row); got != "" {
			t.Fatalf(`"law" should not exclude tag "Law Enforcement"; got %q`, got)
		}
	})
	t.Run("whole tag matches, case-insensitively", func(t *testing.T) {
		tas := base()
		tas.Verticals.Excluded = []string{"law enforcement"}
		if got := tas.evaluate(row); got != "vertical_excluded" {
			t.Fatalf(`"law enforcement" should exclude the tag; got %q`, got)
		}
	})
	t.Run("allowed needs a whole-tag match", func(t *testing.T) {
		tas := base()
		tas.Verticals.Allowed = []string{"GovTech"}
		if got := tas.evaluate(row); got != "" {
			t.Fatalf("allowed tag present should pass; got %q", got)
		}
		tas.Verticals.Allowed = []string{"Gov"} // substring of "GovTech", not a whole tag
		if got := tas.evaluate(row); got != "vertical_not_allowed" {
			t.Fatalf(`"Gov" is not a whole tag, should not satisfy allowed; got %q`, got)
		}
	})
}

// Funding stage matches on the normalized canonical label, so messy raw data and
// a saved rule converge.
func TestStageNormalizationMatch(t *testing.T) {
	cases := []struct{ raw, rule string }{
		{"Pre Seed", "Pre-Seed"},
		{"series a", "Series A"},
		{"Seed", "Seed"},
	}
	for _, c := range cases {
		var tas Taste
		tas.Enabled = true
		tas.Location.RemoteOK = true
		tas.FundingStage.Allowed = []string{c.rule}
		row := Survivor{ID: "1", Stage: c.raw}
		if got := tas.evaluate(row); got != "" {
			t.Fatalf("stage %q vs rule %q: want pass, got drop %q", c.raw, c.rule, got)
		}
	}
	// A stage outside the allowed set is dropped.
	var tas Taste
	tas.Enabled = true
	tas.Location.RemoteOK = true
	tas.FundingStage.Allowed = []string{"Seed"}
	if got := tas.evaluate(Survivor{ID: "2", Stage: "Series B"}); got != "funding_stage" {
		t.Fatalf("Series B not in [Seed]: want funding_stage drop, got %q", got)
	}
}

func TestNormalizeStage(t *testing.T) {
	for raw, want := range map[string]string{
		"Pre Seed": "Pre-Seed", "pre-seed": "Pre-Seed",
		"Seed": "Seed", "SERIES A": "Series A", "series-b": "Series B",
		"Series E": "Series E+", "Growth Equity": "Growth", "IPO": "Public",
		"": "", "Crowdfunding": "Crowdfunding", // unknown passes through trimmed
	} {
		if got := NormalizeStage(raw); got != want {
			t.Errorf("NormalizeStage(%q) = %q, want %q", raw, got, want)
		}
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
