package outreach

import (
	"fmt"
	"regexp"
	"strings"
)

// LintFinding is one deterministic style violation in an outreach email.
type LintFinding struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// bannedPhrases are the hard-no AI-isms from VOICE_RULES that are cheap to
// catch in code (the full voice judgment stays with the humanizer; lint is the
// backstop that runs twice because models reintroduce these).
var bannedPhrases = []string{
	"resonates",
	"resonated",
	"huge fan",
	"passionate about",
	"pick your brain",
	"deeply aligned",
	"thrilled",
	"super excited",
}

var (
	appliedRe    = regexp.MustCompile(`(?i)\bI('ve| have)? (applied|submitted my application)\b|\bmy application\b`)
	excitedOpen  = regexp.MustCompile(`(?i)^\s*excited to\b`)
	wordSplitter = regexp.MustCompile(`\S+`)
	wordOnly     = regexp.MustCompile(`^[a-zA-Z']+$`)
)

// doubledWord finds an immediately repeated word ("has has"); RE2 has no
// backreferences, so compare consecutive tokens.
func doubledWord(text string) string {
	words := wordSplitter.FindAllString(text, -1)
	for i := 1; i < len(words); i++ {
		if wordOnly.MatchString(words[i]) && strings.EqualFold(words[i-1], words[i]) {
			return words[i-1] + " " + words[i]
		}
	}
	return ""
}

// Lint checks an assembled email against the deterministic rules from
// docs/outreach-agent.md: no em dashes, no banned phrases, 75–125 words, no
// applied-mentions, no doubled words, and — when p2 is non-empty — the locked
// credential paragraph present VERBATIM (catches the humanizer mangling it).
// It returns findings, empty when clean.
func Lint(text, p2 string) []LintFinding {
	var out []LintFinding
	add := func(code, msg string) { out = append(out, LintFinding{Code: code, Message: msg}) }

	if strings.Contains(text, "—") {
		add("em_dash", "contains an em dash")
	}
	lower := strings.ToLower(text)
	for _, p := range bannedPhrases {
		if strings.Contains(lower, p) {
			add("banned_phrase", fmt.Sprintf("banned phrase: %q", p))
		}
	}
	if excitedOpen.MatchString(text) {
		add("banned_phrase", `opens with "excited to"`)
	}
	if appliedRe.MatchString(text) {
		add("applied_mention", "mentions having applied; drop it")
	}
	if m := doubledWord(text); m != "" {
		add("doubled_word", fmt.Sprintf("doubled word: %q", m))
	}
	if n := len(wordSplitter.FindAllString(text, -1)); n < 75 || n > 125 {
		add("word_count", fmt.Sprintf("%d words; want 75-125", n))
	}
	if p2 != "" && !strings.Contains(text, p2) {
		add("p2_missing", "locked credential paragraph is not present verbatim")
	}
	return out
}
