package outreach

import "strings"

// The outreach pipeline is five LLM stages, each driven by a system prompt. Each
// stage's prompt is fully editable from the dashboard (stored per-stage in the
// `prompt_overrides` table); an empty/absent override falls back to the
// compiled-in default below. A bad edit is recoverable with reset-to-default —
// the JSON output contract lives inside each default prompt, so an edit that
// breaks it only fails that stage's drafts until reset, never the whole binary.

// Stage describes one editable pipeline stage for the dashboard.
type Stage struct {
	Key     string `json:"stage"`
	Title   string `json:"title"`
	Desc    string `json:"description"`
	Default string `json:"-"` // compiled-in default prompt (not listed; fetched per-stage)
}

// Stages returns the pipeline in execution order. Title/Desc drive the dashboard
// "Pipeline" view; Default is the compiled-in prompt each stage uses until the
// user saves an override.
func Stages() []Stage {
	return []Stage{
		{"researcher", "Researcher", "Searches the web for true company facts and the best referenceable hooks to open with.", researcherSystem},
		{"fill", "Writer", "Writes the email's blanks from the research, your experience, and your voice.", fillSystemDefault},
		{"humanizer", "Humanizer", "Strips AI tells and matches your voice — never changes a fact.", humanizeSystem},
		{"honesty", "Honesty check", "Vetoes any claim about you beyond your documented experience.", honestyCheckerSystem},
		{"judge", "Judge", "Grades depth and proof, and gates whether a draft is good enough to ship.", judgeSystem},
	}
}

// StageByKey looks up a stage by its key.
func StageByKey(key string) (Stage, bool) {
	for _, s := range Stages() {
		if s.Key == key {
			return s, true
		}
	}
	return Stage{}, false
}

// stagePrompt resolves a stage's system prompt: the user's saved override if
// present, else the compiled-in default. Never blocks a draft on a read error.
func (e *Engine) stagePrompt(key string) string {
	if e.DB != nil {
		if c, _, err := e.DB.GetStage(key); err == nil && strings.TrimSpace(c) != "" {
			return strings.TrimSpace(c)
		}
	}
	if s, ok := StageByKey(key); ok {
		return s.Default
	}
	return ""
}

// stageEnabled reports whether a stage should run. The Writer (fill) is never
// skippable; every other stage is on unless the user toggled it off. A read
// error defaults to on (never silently skip work).
func (e *Engine) stageEnabled(key string) bool {
	if key == "fill" {
		return true
	}
	if e.DB != nil {
		if _, enabled, err := e.DB.GetStage(key); err == nil {
			return enabled
		}
	}
	return true
}
