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

{{hook: Open warm and human, in the sender's voice. If the research surfaced a real, specific thing {{company}} or its founders said or did (an essay, a podcast take, a launch, a clear bet), react to it genuinely in a plain sentence — no stock reaction phrase ("stuck with me", "resonated", "caught my eye"). CRITICAL — do NOT claim the sender has experienced, watched, or lived the company's problem unless the experience docs SPECIFICALLY show that exact thing; by default they have NOT, so react as a genuinely interested outsider and let the background paragraph stand on its own (inventing "I've seen a version of that from the other side" is a fabrication — worse than saying nothing). When you draw out what their bet means for the work, address THEM directly — "your {{role}} has to…", "you'll need…" — not an impersonal "someone has to…", and connect the observation to its implication directly: cut flat connective/meta sentences ("that framing makes the role make sense") AND conditional-hedge bridges ("if that bet is right", "if that's right") — just state what it means. If there's nothing real and specific to grab, a simple honest intro: "I saw you're hiring a {{role}} and wanted to introduce myself." No claims about the sender's background beyond what the docs support.}}

{{proof: One or two plain sentences on the SHAPE of my relevant experience — the kind of work and the kind of constraint I've handled (e.g. "deploying software into locked-down, regulated environments and making those rollouts repeatable"), stated confidently as the relevant thing. Honesty means not CLAIMING experience the docs don't show; it does NOT mean announcing what I haven't done — never volunteer a gap ("I haven't worked in X") or disclaim the fit. Stay at altitude: the shape of the work, NOT a specific-project case study (no "I led the integration of <vendor>, designed the pipeline, ran the reviews…"), and no insider jargon a stranger can't decode. Pick the shape so the relevance to {{company}}'s problem is self-evident; don't bolt on a forced "this maps directly to you" sentence. One thread, not a résumé.}}

{{closer: One or two tight sentences, then a simple low-friction ask ("Open to a quick call about the {{role}} role?"). Lead with the relevant real experience confidently and let it stand as the connection — do NOT volunteer what you haven't done ("I haven't worked in X, but…"): that's self-incriminating, and honesty only requires not CLAIMING experience you lack, not announcing it. A brief "I want to be part of it" is fine, but no gush, and don't list the company's challenges back at them. NEVER claim you've watched, seen, or lived the company's problem ("a problem I've watched up close for years") unless the docs specifically show it. Don't overclaim you've done their exact work; don't posture as "your next {{role}}".}}

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
