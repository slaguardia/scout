package outreach

import (
	"strings"
	"testing"
)

func codes(fs []LintFinding) map[string]bool {
	m := map[string]bool{}
	for _, f := range fs {
		m[f.Code] = true
	}
	return m
}

// clean96 is a 96-word, rule-clean body used as the baseline.
var clean96 = strings.TrimSpace(strings.Repeat("plain honest words about deployment work and customer teams in the field every day. ", 6) + "Open to a quick call in the next week or two about the platform role?")

func TestLintClean(t *testing.T) {
	if fs := Lint(clean96, ""); len(fs) != 0 {
		t.Fatalf("clean text flagged: %+v", fs)
	}
}

func TestLintRules(t *testing.T) {
	cases := []struct {
		name, text, want string
		p2               string
	}{
		{"em dash", clean96 + " thing — other", "em_dash", ""},
		{"banned phrase", strings.Replace(clean96, "plain honest", "resonates with", 1), "banned_phrase", ""},
		{"excited opener", "Excited to " + clean96, "banned_phrase", ""},
		{"applied mention", strings.Replace(clean96, "plain honest words", "I applied and have words", 1), "applied_mention", ""},
		{"doubled word", strings.Replace(clean96, "plain honest", "plain plain", 1), "doubled_word", ""},
		{"too short", "five words is too short", "word_count", ""},
		{"p2 missing", clean96, "p2_missing", "the frozen paragraph"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := codes(Lint(c.text, c.p2))
			if !got[c.want] {
				t.Fatalf("want %s in %v", c.want, got)
			}
		})
	}
}

func TestLintP2Verbatim(t *testing.T) {
	p2 := "I spent five years at Globex embedded with customer teams."
	text := clean96 + "\n\n" + p2
	if fs := Lint(text, p2); codes(fs)["p2_missing"] {
		t.Fatalf("verbatim p2 flagged: %+v", fs)
	}
	mangled := strings.Replace(text, "five years", "5 years", 1)
	if fs := Lint(mangled, p2); !codes(fs)["p2_missing"] {
		t.Fatalf("mangled p2 not flagged")
	}
}
