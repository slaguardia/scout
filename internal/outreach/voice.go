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
	"excited to", "excited about", "passionate about", "thrilled", "super excited",
	"pick your brain", "huge fan", "resonate", "deeply aligned",
	"hope you're doing well",
	// stating your own interest/preference — the email already is the interest signal
	"caught my attention", "drew my attention", "want to be doing",
	"interested in joining", "enjoy most", "what i love", "love doing",
	// the doctrine's kill list — openings and frames that mark a template email
	"hope this email finds you well", "finds you well",
	"my name is", "i'm writing to", "i am writing to", "i just applied",
	"a leader in", "leader in the",
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

// lengthFlagAt is the word count above which the rendered email body is flagged
// — a little headroom over the doctrine's ~120-word target so a few words never
// nag.
const lengthFlagAt = 130

// LengthFindings flags an over-long email BODY: everything after the first line
// starting with "Subject:" (the subject line itself is not counted; an email
// with no subject line is counted whole). Like VoiceFindings it is a
// non-blocking flag, run on the RENDERED email — verbatim prose included, since
// the reader scrolls the whole thing.
func LengthFindings(email string) []LintFinding {
	lines := strings.Split(email, "\n")
	body := lines
	for i, l := range lines {
		if strings.HasPrefix(l, "Subject:") {
			body = lines[i+1:]
			break
		}
	}
	n := len(strings.Fields(strings.Join(body, "\n")))
	if n <= lengthFlagAt {
		return nil
	}
	return []LintFinding{{Code: "too_long", Message: fmt.Sprintf("email body is %d words (doctrine target ≤120)", n)}}
}
