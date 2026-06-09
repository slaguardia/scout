package outreach

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

// The email template is a scout-local file: fixed prose (sent verbatim) plus two
// kinds of token:
//
//	{{var}}              — a simple substitution resolved in code from the posting
//	                       (e.g. {{role}}, {{company}}). The LLM never sees these.
//	{{name: instructions}} — a HOLE the fill LLM writes, guided by instructions.
//	                       Instructions may themselves contain {{var}} references,
//	                       which are resolved before the LLM sees them.
//
// Parsing is the one genuinely-new piece of logic in the redesign, so it fails
// loud on a malformed template (unterminated or non-identifier token) rather
// than silently mis-filling an email.

// LoadTemplate reads the scout-local email template. A missing file returns ""
// (the draft gate reports the absence); other errors propagate.
func LoadTemplate(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(b), nil
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
	return strings.TrimSpace(b.String())
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
