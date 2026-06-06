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

// bannedPhrases are the hard-no AI-isms from the Voice & style rules that are
// cheap to catch in code (the full voice judgment stays with the humanizer;
// lint is the backstop that runs twice because models reintroduce these).
var bannedPhrases = []string{
	"resonates",
	"resonated",
	"huge fan",
	"passionate about",
	"pick your brain",
	"deeply aligned",
	"thrilled",
	"super excited",
	"hope you're doing well",
	"scaffolding around the model",
	"ai-assisted development",
}

var (
	excitedOpen  = regexp.MustCompile(`(?i)^\s*excited to\b`)
	wordSplitter = regexp.MustCompile(`\S+`)
	wordOnly     = regexp.MustCompile(`^[a-zA-Z']+$`)
	greetingLine = regexp.MustCompile(`(?i)^hi\b.*,$`)
	signNameLine = regexp.MustCompile(`^[A-Za-z][A-Za-z .'-]{0,29}$`)
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

// emailBody strips the assembly framing — the Subject: line, the greeting
// line, and the sign-off — so the rules measure the three paragraphs they
// actually govern. The subject format itself contains an em dash by design
// ("[Name] | Alex intro — [role]") and the 75–125 word target is for the
// body, not the chrome.
func emailBody(text string) string {
	lines := strings.Split(text, "\n")
	trim := func() {
		for len(lines) > 0 && strings.TrimSpace(lines[0]) == "" {
			lines = lines[1:]
		}
	}
	trim()
	if len(lines) > 0 && strings.HasPrefix(lines[0], "Subject:") {
		lines = lines[1:]
		trim()
	}
	if len(lines) > 0 && greetingLine.MatchString(strings.TrimSpace(lines[0])) {
		lines = lines[1:]
	}
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	// Sign-off: a short comma-terminated line ("Thanks,") followed by a bare
	// name line.
	if n := len(lines); n >= 2 {
		last, prev := strings.TrimSpace(lines[n-1]), strings.TrimSpace(lines[n-2])
		if signNameLine.MatchString(last) && strings.HasSuffix(prev, ",") && len(prev) <= 20 {
			lines = lines[:n-2]
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

// Lint checks an assembled email against the deterministic rules from the
// Cold email template + Voice & style pages: no em dashes, no banned phrases,
// 75–125 body words, no doubled words, and — when p2 is non-empty — the
// locked credential paragraph present VERBATIM (catches the humanizer
// mangling it). Rules run against the body (subject/greeting/sign-off
// stripped); the P2 check runs against the full text. Returns findings,
// empty when clean.
func Lint(text, p2 string) []LintFinding {
	var out []LintFinding
	add := func(code, msg string) { out = append(out, LintFinding{Code: code, Message: msg}) }

	body := emailBody(text)
	if strings.Contains(body, "—") {
		add("em_dash", "contains an em dash")
	}
	lower := strings.ToLower(body)
	for _, p := range bannedPhrases {
		if strings.Contains(lower, p) {
			add("banned_phrase", fmt.Sprintf("banned phrase: %q", p))
		}
	}
	if excitedOpen.MatchString(body) {
		add("banned_phrase", `opens with "excited to"`)
	}
	if m := doubledWord(body); m != "" {
		add("doubled_word", fmt.Sprintf("doubled word: %q", m))
	}
	if n := len(wordSplitter.FindAllString(body, -1)); n < 75 || n > 125 {
		add("word_count", fmt.Sprintf("%d body words; want 75-125", n))
	}
	if p2 != "" && !strings.Contains(text, p2) {
		add("p2_missing", "locked credential paragraph is not present verbatim")
	}
	return out
}
