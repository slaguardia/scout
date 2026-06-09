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

// lint is a test shim onto the production Lint using the default config (75–125
// word window). p2 is the single locked block to verify verbatim ("" → none).
func lint(text, p2 string) []LintFinding {
	var locked []string
	if p2 != "" {
		locked = []string{p2}
	}
	return Lint(text, locked, DefaultConfig())
}

// clean96 is a 96-word, rule-clean body used as the baseline.
var clean96 = strings.TrimSpace(strings.Repeat("plain honest words about deployment work and customer teams in the field every day. ", 6) + "Open to a quick call in the next week or two about the platform role?")

func TestLintClean(t *testing.T) {
	if fs := lint(clean96, ""); len(fs) != 0 {
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
		{"doubled word", strings.Replace(clean96, "plain honest", "plain plain", 1), "doubled_word", ""},
		{"too short", "five words is too short", "word_count", ""},
		{"p2 missing", clean96, "p2_missing", "the frozen paragraph"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := codes(lint(c.text, c.p2))
			if !got[c.want] {
				t.Fatalf("want %s in %v", c.want, got)
			}
		})
	}
}

func TestLintP2Verbatim(t *testing.T) {
	p2 := "I spent five years at Globex embedded with customer teams."
	text := clean96 + "\n\n" + p2
	if fs := lint(text, p2); codes(fs)["p2_missing"] {
		t.Fatalf("verbatim p2 flagged: %+v", fs)
	}
	mangled := strings.Replace(text, "five years", "5 years", 1)
	if fs := lint(mangled, p2); !codes(fs)["p2_missing"] {
		t.Fatalf("mangled p2 not flagged")
	}
}

func TestLintBodyScoping(t *testing.T) {
	// The assembled email's chrome — subject (em dash by design), greeting,
	// sign-off — is excluded from the body rules.
	email := "Subject: [Name] | Alex intro — Backend Engineer\n\nHi [Name],\n\n" + clean96 + "\n\nThanks,\nAlex"
	got := codes(lint(email, ""))
	if got["em_dash"] {
		t.Error("subject em dash flagged")
	}
	if got["word_count"] {
		t.Errorf("chrome counted toward body words: %v", got)
	}
	// An em dash IN the body still flags.
	withDash := "Subject: a — b\n\nHi [Name],\n\n" + clean96 + " thing — other\n\nThanks,\nAlex"
	if !codes(lint(withDash, ""))["em_dash"] {
		t.Error("body em dash not flagged")
	}
}

func TestLintNewBannedPhrases(t *testing.T) {
	text := strings.Replace(clean96, "plain honest words", "hope you're doing well and", 1)
	if !codes(lint(text, ""))["banned_phrase"] {
		t.Error("'hope you're doing well' not flagged")
	}
}
