package outreach

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/slaguardia/scout/internal/store"
)

// The email template is the email's format: fixed prose (sent verbatim) plus two
// kinds of token:
//
//	{{var}}              — a simple substitution resolved in code from the posting
//	                       (e.g. {{role}}, {{company}}). The LLM never sees these.
//	{{name: instructions}} — a HOLE the fill LLM writes, guided by instructions.
//	                       Instructions may themselves contain {{var}} references,
//	                       which are resolved before the LLM sees them.
//
// It lives in the DB (a singleton row) so a dashboard save can't clobber it and
// git never touches it. Parsing fails loud on a malformed template rather than
// silently mis-filling an email.

// DefaultTemplate is the compiled-in starting template, used until the user
// saves their own. The doctrine structure: a hook that opens with a human
// factual lead-in then names where the work gets hard, a proof hole that answers
// that exact difficulty in plain concrete words at the strongest honest tier,
// and a direct, specific ask that positions the sender as the candidate for the
// role. "Your Name" stays a placeholder the user localizes. (The subject line's
// em dash is intentional — see voice.go's note about never linting the subject.)
const DefaultTemplate = `Subject: [Recipient] | Your Name — intro re {{role}}

Hi [Recipient],

{{hook: Two or three plain sentences. Ground the opening in a specific, real, recent thing about {{company}} from the research — an article, a post, a launch, a founder quote — so it doesn't drop from nowhere (reference the actual thing; don't fall back to a generic "you raised money", and don't name the publication or narrate your research). Then your read of where their bet makes the WORK hard to execute — the operational problem this role exists to close, not an industry-level consequence — hedged as your own read, a consequence not a reaction. Optionally one short present-tense sentence on the kind of work you like, only if it isn't filler. No claims about your background here (that's the proof). Vary the opening; never "seems to be betting" every time. If there's no Deep observation to make, don't send.}}

{{proof: One or two plain sentences on the SHAPE of my relevant experience — the kind of work and the kind of constraint I've handled (e.g. "deploying software into locked-down, regulated environments and making those rollouts repeatable"), at the strongest HONEST tier and framed openly as adjacent when it is ("not X, but Y" — never disguise the distance). Stay at altitude: convey the shape, NOT a specific-project case study (no "I led the integration of <vendor>, designed the pipeline, ran the reviews…" — that reads weird in a cold intro), and no insider jargon a stranger can't decode. Pick the shape so the relevance to {{company}}'s problem is self-evident; don't bolt on a forced "this maps directly to you" sentence. One thread, not a résumé.}}

{{closer: One or two sentences, a specific and direct ask: that you want to talk about how you could help solve the exact problem the hook named, positioning yourself as their next {{role}}, folded into a request for their time ("I'd like to talk about how I could help <that problem> as your next {{role}} — any chance you'd have 15 minutes?"). Name the specific problem; ask for THEIR time. NEVER make it a curious call about their business ("I'd love to hear how you're approaching X"), and NEVER appraise whether the company or role is "worth a conversation". No specific capability claim here (that's the proof's job). Vary the ask.}}

Thanks,
Your Name`

// TemplateOrDefault returns the user's saved template, or the compiled-in default
// when none is saved (or on a read error — a draft never blocks on this).
func TemplateOrDefault(db *store.DB) string {
	if db != nil {
		if c, err := db.GetOutreachTemplate(); err == nil && strings.TrimSpace(c) != "" {
			return c
		}
	}
	return DefaultTemplate
}

type segKind int

const (
	segLiteral segKind = iota // verbatim prose
	segVar                    // {{name}} — substituted from vars
	segHole                   // {{name: instructions}} — filled by the LLM
)

type segment struct {
	kind  segKind
	text  string // literal text (segLiteral)
	name  string // var/hole name
	instr string // hole instructions, with nested {{var}} still unresolved
}

var identRE = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*$`)
var bareVarRE = regexp.MustCompile(`\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}`)

// Hole is one fillable slot surfaced to the engine: its name and the
// instructions (with {{var}} references already resolved against the posting).
type Hole struct {
	Name  string `json:"name"`
	Instr string `json:"instr"`
}

// Template is a parsed email template ready to render.
type Template struct {
	segs []segment
}

// ParseTemplate tokenizes the template into literal/var/hole segments, scanning
// {{...}} with nesting so a hole's instructions may contain {{var}}. Returns an
// error on an unterminated or non-identifier token.
func ParseTemplate(tmpl string) (*Template, error) {
	var segs []segment
	var lit strings.Builder
	flush := func() {
		if lit.Len() > 0 {
			segs = append(segs, segment{kind: segLiteral, text: lit.String()})
			lit.Reset()
		}
	}
	for i := 0; i < len(tmpl); {
		if i+1 < len(tmpl) && tmpl[i] == '{' && tmpl[i+1] == '{' {
			// Find the matching }} accounting for nested {{ }}.
			depth, j := 1, i+2
			for j+1 < len(tmpl) {
				if tmpl[j] == '{' && tmpl[j+1] == '{' {
					depth++
					j += 2
				} else if tmpl[j] == '}' && tmpl[j+1] == '}' {
					depth--
					if depth == 0 {
						break
					}
					j += 2
				} else {
					j++
				}
			}
			if depth != 0 {
				return nil, fmt.Errorf("template: unterminated {{ near offset %d", i)
			}
			inner := tmpl[i+2 : j]
			flush()
			name, instr, isHole := strings.Cut(inner, ":")
			name = strings.TrimSpace(name)
			if !identRE.MatchString(name) {
				return nil, fmt.Errorf("template: malformed token {{%s}} — %q is not an identifier", inner, name)
			}
			if isHole {
				segs = append(segs, segment{kind: segHole, name: name, instr: strings.TrimSpace(instr)})
			} else {
				segs = append(segs, segment{kind: segVar, name: name})
			}
			i = j + 2
			continue
		}
		lit.WriteByte(tmpl[i])
		i++
	}
	flush()
	return &Template{segs: segs}, nil
}

// Holes returns the fillable slots in order, with {{var}} references in each
// instruction resolved against vars. Duplicate hole names are de-duplicated
// (first instruction wins) — the fill LLM is asked for each name once.
func (t *Template) Holes(vars map[string]string) []Hole {
	var out []Hole
	seen := map[string]bool{}
	for _, s := range t.segs {
		if s.kind == segHole && !seen[s.name] {
			seen[s.name] = true
			out = append(out, Hole{Name: s.name, Instr: substVars(s.instr, vars)})
		}
	}
	return out
}

// Render assembles the final email: literal prose verbatim, vars substituted,
// holes replaced by their filled text. An unresolved var or unfilled hole is
// left as its literal token so the gap is visible, never silently blank.
func (t *Template) Render(vars, filled map[string]string) string {
	var b strings.Builder
	for _, s := range t.segs {
		switch s.kind {
		case segLiteral:
			b.WriteString(s.text)
		case segVar:
			if v, ok := vars[s.name]; ok {
				b.WriteString(v)
			} else {
				b.WriteString("{{" + s.name + "}}")
			}
		case segHole:
			if v, ok := filled[s.name]; ok {
				b.WriteString(v)
			} else {
				b.WriteString("{{" + s.name + "}}")
			}
		}
	}
	return dewrap(strings.TrimSpace(b.String()))
}

// dewrapJoinMin is the line length at/above which a mid-paragraph newline is
// treated as an accidental soft-wrap and collapsed to a space. Wrapped prose
// fills lines to ~60-80 chars; short structural lines (a greeting, a "Thanks,"
// sign-off, a name) fall well under this and keep their break.
const dewrapJoinMin = 45

// dewrap un-hard-wraps prose: it joins a line into the next with a single space
// when the line is long enough to look soft-wrapped, while preserving blank-line
// paragraph breaks and short intentional lines (the signature, a greeting). The
// verbatim template prose is sent exactly as the user typed it word-for-word —
// this only fixes the line *layout* so a paragraph the user happened to paste
// hard-wrapped renders as one flowing paragraph in the email.
func dewrap(s string) string {
	lines := strings.Split(s, "\n")
	var b strings.Builder
	for i, line := range lines {
		b.WriteString(line)
		if i == len(lines)-1 {
			break
		}
		next := lines[i+1]
		// A blank line on either side is a paragraph break — never collapse it.
		if strings.TrimSpace(line) == "" || strings.TrimSpace(next) == "" {
			b.WriteString("\n")
			continue
		}
		if len(strings.TrimRight(line, " \t")) >= dewrapJoinMin {
			b.WriteString(" ")
		} else {
			b.WriteString("\n")
		}
	}
	return b.String()
}

// substVars replaces {{var}} tokens in s from vars; unknown vars are left as-is.
func substVars(s string, vars map[string]string) string {
	return bareVarRE.ReplaceAllStringFunc(s, func(m string) string {
		name := bareVarRE.FindStringSubmatch(m)[1]
		if v, ok := vars[name]; ok {
			return v
		}
		return m
	})
}
