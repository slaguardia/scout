package outreach

import (
	"fmt"
	"strings"
)

// LintFinding is one deterministic voice violation in model-written text. It is
// a non-blocking flag surfaced in the review panel — the honesty checker is the
// only gate; voice nits are the user's call to fix on review.
type LintFinding struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// bannedPhrases are AI-isms scout flags in model-written spans. The humanizer
// pass is meant to remove them, but LLM cleanup reintroduces patterns, so this
// deterministic backstop catches what slips through.
var bannedPhrases = []string{
	"excited to", "passionate about", "thrilled", "super excited",
	"pick your brain", "huge fan", "resonate", "deeply aligned",
	"hope you're doing well",
}

// VoiceFindings flags deterministic voice violations (em dashes, banned phrases)
// in text. Run it on the MODEL-WRITTEN spans (the filled holes) or an edited
// body — never on the subject line, whose em dash is intentional by design.
func VoiceFindings(text string) []LintFinding {
	var out []LintFinding
	if strings.Contains(text, "—") {
		out = append(out, LintFinding{Code: "em_dash", Message: "contains an em dash"})
	}
	lower := strings.ToLower(text)
	for _, p := range bannedPhrases {
		if strings.Contains(lower, p) {
			out = append(out, LintFinding{Code: "banned_phrase", Message: fmt.Sprintf("banned phrase: %q", p)})
		}
	}
	return out
}
