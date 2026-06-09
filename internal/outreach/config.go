package outreach

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/slaguardia/scout/internal/store"
)

// Config is the outreach pipeline's runtime knobs — everything that used to be
// a hardcoded constant in lint.go / engine.go and is now data:
//
//   - the lint word window (WordMin..WordMax, inclusive),
//   - the subject-line format template (SubjectFormat),
//   - the email structure (Structure) — the ordered slots the assembler renders.
//
// The real values live in the local DB (set from the UI); the repo ships only
// DefaultConfig, whose values reproduce the pre-config behavior exactly.
type Config struct {
	WordMin       int             `json:"word_min"`
	WordMax       int             `json:"word_max"`
	SubjectFormat string          `json:"subject_format"`
	Structure     []StructureSlot `json:"structure"`
}

// SlotKind is how a structure slot's content is sourced.
type SlotKind string

const (
	// SlotModel is an agent-authored paragraph (the Drafter writes it). Source
	// names which paragraph: "P1" or "P3".
	SlotModel SlotKind = "model"
	// SlotLocked is verbatim block content (the credential paragraph and the
	// like). Block names the cached block; its content is inserted byte-for-byte
	// and the lint asserts it survives verbatim — the integrity guarantee.
	SlotLocked SlotKind = "locked"
)

// StructureSlot is one slot in the assembled email body, between the greeting
// and the sign-off. Exactly one of Source/Block is meaningful per Kind.
type StructureSlot struct {
	Kind   SlotKind `json:"kind"`
	Source string   `json:"source,omitempty"` // model: "P1" | "P3"
	Block  string   `json:"block,omitempty"`  // locked: a cached block name
}

// DefaultSubjectFormat is the pre-config subject template. {sender} expands to
// the sender's subject name and {role} to the role title; when the role is
// empty the {role} token and its preceding separator drop, collapsing to
// "[Name] | <sender> intro" — exactly what the old hardcoded builder produced.
const DefaultSubjectFormat = "[Name] | {sender} intro — {role}"

// modelSources are the paragraphs the Drafter actually writes; a model slot may
// only reference one of these (the drafter returns {p1, p3}). Adding a new
// model paragraph would require a drafter change, so the set is closed here.
var modelSources = map[string]bool{"P1": true, "P3": true}

// DefaultStructure is the pre-config email body: greeting, P1, the locked
// credential paragraph, P3, sign-off. Returned as a fresh slice so callers can
// mutate without touching the package default.
func DefaultStructure() []StructureSlot {
	return []StructureSlot{
		{Kind: SlotModel, Source: "P1"},
		{Kind: SlotLocked, Block: "P2_LOCKED"},
		{Kind: SlotModel, Source: "P3"},
	}
}

// DefaultConfig is the compiled-in fallback — the values that were hardcoded
// before the config table existed.
func DefaultConfig() Config {
	return Config{
		WordMin:       75,
		WordMax:       125,
		SubjectFormat: DefaultSubjectFormat,
		Structure:     DefaultStructure(),
	}
}

// Validate checks a config is renderable. Word window sane; subject format
// non-empty; structure non-empty; every model slot references a real drafter
// paragraph; every locked slot references a known, non-derived block that is
// NOT the full experience doc (PAST_EXPERIENCE_FULL is honesty-checker-only and
// must never be placed in the email body). Returns the first problem found.
func (c Config) Validate() error {
	if c.WordMin < 1 || c.WordMax < c.WordMin {
		return fmt.Errorf("word window invalid: min=%d max=%d (want 1 <= min <= max)", c.WordMin, c.WordMax)
	}
	if strings.TrimSpace(c.SubjectFormat) == "" {
		return fmt.Errorf("subject format is empty")
	}
	if len(c.Structure) == 0 {
		return fmt.Errorf("structure has no slots")
	}
	for i, s := range c.Structure {
		switch s.Kind {
		case SlotModel:
			if !modelSources[s.Source] {
				return fmt.Errorf("slot %d: model source %q is not a drafter paragraph (want P1 or P3)", i, s.Source)
			}
		case SlotLocked:
			slot := SlotByName(s.Block)
			if slot == nil {
				return fmt.Errorf("slot %d: locked block %q is not a known block", i, s.Block)
			}
			if slot.Tier == TierDerived {
				return fmt.Errorf("slot %d: %q is derived — it cannot be a verbatim locked slot", i, s.Block)
			}
			if s.Block == "PAST_EXPERIENCE_FULL" {
				return fmt.Errorf("slot %d: PAST_EXPERIENCE_FULL is honesty-checker-only and must never appear in the email body", i)
			}
		default:
			return fmt.Errorf("slot %d: unknown kind %q (want model or locked)", i, s.Kind)
		}
	}
	return nil
}

// LockedBlocks returns the distinct block names the structure renders verbatim,
// in first-seen order. These are hard-required for a draft (a missing locked
// block is a broken email) and each must appear verbatim in the lint.
func (c Config) LockedBlocks() []string {
	var out []string
	seen := map[string]bool{}
	for _, s := range c.Structure {
		if s.Kind == SlotLocked && s.Block != "" && !seen[s.Block] {
			seen[s.Block] = true
			out = append(out, s.Block)
		}
	}
	return out
}

// LoadConfig reads the stored outreach config, filling any unset field from
// DefaultConfig and validating the result. A missing row, a load error, a blank
// or unparseable or invalid stored structure all degrade to the default — a
// draft must never run on a config that can't render. It returns the DB error
// (if any) alongside a usable Config so the caller can log without blocking.
func LoadConfig(db *store.DB) (Config, error) {
	cfg := DefaultConfig()
	if db == nil {
		return cfg, nil
	}
	row, err := db.GetOutreachConfig()
	if err != nil {
		return cfg, err
	}
	if row == nil {
		return cfg, nil
	}
	if row.WordMin > 0 {
		cfg.WordMin = row.WordMin
	}
	if row.WordMax > 0 {
		cfg.WordMax = row.WordMax
	}
	// A hand-corrupted window (max < min) falls back to the default window.
	if cfg.WordMax < cfg.WordMin {
		cfg.WordMin, cfg.WordMax = DefaultConfig().WordMin, DefaultConfig().WordMax
	}
	if strings.TrimSpace(row.SubjectFormat) != "" {
		cfg.SubjectFormat = row.SubjectFormat
	}
	if s := strings.TrimSpace(row.Structure); s != "" {
		var slots []StructureSlot
		if jErr := json.Unmarshal([]byte(s), &slots); jErr == nil && len(slots) > 0 {
			cand := cfg
			cand.Structure = slots
			if cand.Validate() == nil {
				cfg.Structure = slots
			}
		}
	}
	return cfg, err
}

// SaveConfig validates and persists the outreach config. The structure is
// stored as JSON; the rest as columns. An invalid config is rejected — the UI
// surfaces the error rather than persisting something a draft can't render.
func SaveConfig(db *store.DB, cfg Config) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	raw, err := json.Marshal(cfg.Structure)
	if err != nil {
		return err
	}
	return db.PutOutreachConfig(store.OutreachConfig{
		WordMin:       cfg.WordMin,
		WordMax:       cfg.WordMax,
		SubjectFormat: cfg.SubjectFormat,
		Structure:     string(raw),
	})
}

// renderSubject expands the subject-format template. {sender} → the sender's
// subject name; {role} → the role title. When the role is empty, the {role}
// token and the separator run immediately preceding it are dropped, so
// "[Name] | {sender} intro — {role}" collapses to "[Name] | <sender> intro".
func renderSubject(format, sender, role string) string {
	s := strings.ReplaceAll(format, "{sender}", sender)
	if role = strings.TrimSpace(role); role != "" {
		return strings.ReplaceAll(s, "{role}", role)
	}
	// Role empty: drop every {role} token together with the separator run that
	// precedes it, so neither a literal token nor a dangling " — " survives even
	// in a degenerate template with multiple tokens.
	for {
		i := strings.Index(s, "{role}")
		if i < 0 {
			return s
		}
		// Walk back over the separator (any run of non-alphanumeric characters)
		// sitting between the previous word and the {role} token.
		j := i
		for j > 0 {
			r, size := utf8.DecodeLastRuneInString(s[:j])
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				break
			}
			j -= size
		}
		s = s[:j] + s[i+len("{role}"):]
	}
}
