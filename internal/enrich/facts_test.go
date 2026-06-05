package enrich

import "testing"

// TestParseFacts pins the extraction parse: clean JSON, JSON wrapped in prose
// or fences (the regex pull), negative headcount clamped, and garbage rejected.
func TestParseFacts(t *testing.T) {
	f, err := parseFacts(`{"name":"Acme","vertical":"Robotics, AI","location":"Austin, TX","headcount":120,"funding_stage":"Series A"}`)
	if err != nil {
		t.Fatalf("clean JSON: %v", err)
	}
	if f.Name != "Acme" || f.Vertical != "Robotics, AI" || f.Headcount != 120 || f.FundingStage != "Series A" {
		t.Errorf("clean JSON parsed wrong: %+v", f)
	}

	f, err = parseFacts("Here you go:\n```json\n{\"name\": \" Acme \", \"headcount\": -3}\n```")
	if err != nil {
		t.Fatalf("wrapped JSON: %v", err)
	}
	if f.Name != "Acme" {
		t.Errorf("name not trimmed: %q", f.Name)
	}
	if f.Headcount != 0 {
		t.Errorf("negative headcount must clamp to 0, got %d", f.Headcount)
	}

	if _, err := parseFacts("no json here"); err == nil {
		t.Error("garbage should error")
	}
}

// TestNamePlaceholder pins what counts as "still unnamed": empty, or exactly
// the bare-domain default a name-less add gets — but never a real name.
func TestNamePlaceholder(t *testing.T) {
	cases := []struct {
		name, domain string
		want         bool
	}{
		{"", "acme.com", true},
		{"acme.com", "acme.com", true},
		{"ACME.COM ", "acme.com", true},
		{"Acme", "acme.com", false},
	}
	for _, c := range cases {
		if got := namePlaceholder(c.name, c.domain); got != c.want {
			t.Errorf("namePlaceholder(%q, %q) = %v, want %v", c.name, c.domain, got, c.want)
		}
	}
}
