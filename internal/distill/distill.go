// Package distill is scout's intelligence layer in front of the brain.
//
// The brain is a librarian: recall(query) returns the prose most related to a
// question, and with the user's small corpus that retrieval is coarse — it
// returns whole pages, scored almost flat, mixing the relevant with the
// irrelevant. The distiller does the focusing the brain can't yet: it fans out
// a few company-fit questions, dedups what comes back, then runs a TWO-STEP
// pass — (1) classify every preference in the excerpts as COMPANY vs
// ROLE_OR_OTHER (with a verbatim quote + polarity), (2) synthesize a company-fit
// BRIEF from the COMPANY items only. The classify step physically removes the
// salient role/career material before the persuasive synthesis runs, which is
// what reliably keeps it out of the brief (a single pass leaks it back in, even
// on a stronger model — structure fixes this, not model size).
//
// The brief is scout-local: it is a re-derived view of brain knowledge, never
// written back, and never a verdict. It replaces the old tagged-facts criteria
// block — instead of polarity/strength tags handed over by the brain, the
// distiller writes the structure itself (dealbreakers / preferences / context),
// in prose, which is what an LLM actually reasons over well.
//
// Scope: COMPANIES ONLY. Role/title fit is a separate, later concern and is
// deliberately not distilled here (see companyQuestions + the classify step).
package distill

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/brainbot"
)

// companyQuestions are the recalls scout fans out to gather the user's
// company-fit criteria. They are intentionally company-shaped — what kind of
// company, what to avoid, stage/size, verticals.
//
// Roles, titles, and seniority are OUT OF SCOPE: that is a future role
// distiller's job. Do NOT add a role/title question here — it would pull
// unrelated material into the company brief.
var companyQuestions = []string{
	"what kind of company does the user want to work at",
	"what does the user avoid in a company; hard dealbreakers and exclusions",
	"what stage, size, or funding maturity of company does the user prefer",
	"what industries, domains, or verticals does the user want to work in or avoid",
}

// defaultK is a generous per-question recall depth: with coarse retrieval we'd
// rather over-fetch and let the synthesis step discard than miss a criterion.
const defaultK = 16

// Token budgets: the classify step enumerates every preference (can be long);
// the brief is a focused summary.
const (
	classifyMaxTokens = 2000
	synthMaxTokens    = 1500
)

// Distiller turns brain recall into a company-fit brief.
type Distiller struct {
	Brain  *brainbot.Client
	Client *anthropic.Client
	// Model is used for BOTH the classify and synthesize calls. Empty →
	// anthropic.DefaultModel. The distiller runs once per scoring run, so a
	// stronger model here is cheap; the caller defaults it to Sonnet because
	// fidelity (keeping every sub-exclusion) matters more than the per-call cost.
	Model string
	K     int // per-question recall depth; <= 0 → defaultK

	// Log, if set, receives one human-readable line per recall plus the
	// classify/synthesize steps — the tuning instrument for inspecting the
	// recall → classify → brief chain.
	Log func(string)
}

func (d *Distiller) log(format string, args ...any) {
	if d.Log != nil {
		d.Log(fmt.Sprintf(format, args...))
	}
}

// Result is a full distillation: the synthesized brief, the deduped chunks it
// was built from, the intermediate classified Items (so the CLI debug path can
// show the whole chain), and a stable Basis.
//
// Basis is the version key: it is the distiller's prompts + the recalled
// chunks' content, NOT the brief prose. The brief drifts cosmetically across
// runs even at temperature 0 (reworded bullets); keying the criteria version
// off Basis means a re-distill only re-scores companies when the underlying
// notes (or the prompts) actually change — not when the wording wobbles.
type Result struct {
	Brief  string
	Chunks []brainbot.Chunk
	Items  string
	Basis  string
}

// Distill returns the brief plus its stable Basis — it satisfies the criteria
// resolver's brief source. An error (unreachable brain, empty corpus, LLM
// failure) lets the resolver fall back to a stale cache or taste.md.
func (d *Distiller) Distill(ctx context.Context) (brief, basis string, err error) {
	res, err := d.Run(ctx)
	if err != nil {
		return "", "", err
	}
	return res.Brief, res.Basis, nil
}

// Run does the whole distillation: gather → classify → synthesize.
func (d *Distiller) Run(ctx context.Context) (*Result, error) {
	chunks, err := d.gather(ctx)
	if err != nil {
		return nil, err
	}
	if len(chunks) == 0 {
		// A reachable-but-empty brain: no company-fit material to distill. The
		// resolver treats an error here as "fall back to local criteria".
		return nil, fmt.Errorf("brain returned no chunks for company-fit recalls")
	}
	items, err := d.classify(ctx, chunks)
	if err != nil {
		return nil, err
	}
	d.log("distill: classified %d chunks → %d chars of tagged items", len(chunks), len(items))
	brief, err := d.synthesize(ctx, items)
	if err != nil {
		return nil, err
	}
	d.log("distill: brief synthesized (%d chars)", len(brief))
	return &Result{Brief: brief, Chunks: chunks, Items: items, Basis: basisOf(chunks)}, nil
}

// basisOf builds the stable version key: BOTH distiller prompts plus each
// chunk's path/heading/text, ordered by (path, heading). It deliberately
// excludes the hybrid-search score (which jitters run-to-run) and the brief
// prose (which drifts). Folding the prompts in means editing either prompt
// re-scores — exactly what we want when tuning the distiller.
func basisOf(chunks []brainbot.Chunk) string {
	sorted := append([]brainbot.Chunk(nil), chunks...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Path != sorted[j].Path {
			return sorted[i].Path < sorted[j].Path
		}
		return sorted[i].Heading < sorted[j].Heading
	})
	var b strings.Builder
	b.WriteString(classifySystemPrompt)
	b.WriteString("\x00")
	b.WriteString(synthSystemPrompt)
	for _, c := range sorted {
		b.WriteString("\x00")
		b.WriteString(c.Path)
		b.WriteString("\x00")
		b.WriteString(c.Heading)
		b.WriteString("\x00")
		b.WriteString(strings.TrimSpace(c.Text))
	}
	return b.String()
}

// gather fans out the company-fit recalls and dedups the union of chunks by
// (path, heading), keeping the highest score. Dedup matters: coarse retrieval
// returns the same whole pages for several questions, and we must not stuff the
// same page into the prompt repeatedly. The result is sorted deterministically
// (score desc, then path, then heading) so the classify input is stable.
func (d *Distiller) gather(ctx context.Context) ([]brainbot.Chunk, error) {
	k := d.K
	if k <= 0 {
		k = defaultK
	}
	best := make(map[string]brainbot.Chunk)
	for _, q := range companyQuestions {
		rr, err := d.Brain.Recall(ctx, q, k)
		if err != nil {
			return nil, fmt.Errorf("recall %q: %w", q, err)
		}
		d.log("distill: recall %q → %d chunks", q, len(rr.Chunks))
		for _, c := range rr.Chunks {
			key := c.Path + "\x00" + c.Heading
			if prev, ok := best[key]; !ok || c.Score > prev.Score {
				best[key] = c
			}
		}
	}

	out := make([]brainbot.Chunk, 0, len(best))
	for _, c := range best {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		if out[i].Path != out[j].Path {
			return out[i].Path < out[j].Path
		}
		return out[i].Heading < out[j].Heading
	})
	for _, c := range out {
		d.log("distill:   chunk %s (score %.4f, %d chars)", chunkLabel(c), c.Score, len(c.Text))
	}
	return out, nil
}

// classify is step 1: tag every preference in the excerpts as COMPANY vs
// ROLE_OR_OTHER, with a verbatim quote and polarity, so the next step can drop
// the role/career material before it ever reaches the brief.
func (d *Distiller) classify(ctx context.Context, chunks []brainbot.Chunk) (string, error) {
	zero := 0.0
	resp, err := d.Client.Send(ctx, anthropic.Request{
		Model:       d.Model,
		System:      classifySystemPrompt,
		MaxTokens:   classifyMaxTokens,
		Messages:    []anthropic.Message{{Role: "user", Content: formatChunks(chunks)}},
		Cached:      true,
		Temperature: &zero,
	})
	if err != nil {
		return "", fmt.Errorf("distill classify: %w", err)
	}
	items := strings.TrimSpace(resp.Text())
	if items == "" {
		return "", fmt.Errorf("distill classify returned nothing")
	}
	return items, nil
}

// synthesize is step 2: write the brief from the COMPANY-tagged items only.
// Temperature 0; the role/career items were already removed upstream, so there
// is nothing salient left to leak.
func (d *Distiller) synthesize(ctx context.Context, items string) (string, error) {
	zero := 0.0
	resp, err := d.Client.Send(ctx, anthropic.Request{
		Model:       d.Model,
		System:      synthSystemPrompt,
		MaxTokens:   synthMaxTokens,
		Messages:    []anthropic.Message{{Role: "user", Content: items}},
		Cached:      true,
		Temperature: &zero,
	})
	if err != nil {
		return "", fmt.Errorf("distill synthesis: %w", err)
	}
	brief := strings.TrimSpace(resp.Text())
	if brief == "" {
		return "", fmt.Errorf("distill synthesis returned empty brief")
	}
	return brief, nil
}

// formatChunks renders the deduped chunks as the classify step's user message:
// each labeled with its source path/heading so the model can attribute and
// triage them.
func formatChunks(chunks []brainbot.Chunk) string {
	var b strings.Builder
	b.WriteString("Excerpts retrieved from the user's own notes:\n\n")
	for _, c := range chunks {
		fmt.Fprintf(&b, "[Source: %s]\n%s\n\n", chunkLabel(c), strings.TrimSpace(c.Text))
	}
	b.WriteString("Classify every preference in these excerpts now.")
	return b.String()
}

// chunkLabel is the human-readable "path — heading" label for a chunk, used in
// both the prompt and the tuning log.
func chunkLabel(c brainbot.Chunk) string {
	switch {
	case c.Path != "" && c.Heading != "" && c.Path != c.Heading:
		return c.Path + " — " + c.Heading
	case c.Path != "":
		return c.Path
	case c.Heading != "":
		return c.Heading
	default:
		return "(untitled)"
	}
}

// classifySystemPrompt is step 1: extract + scope-classify every preference.
// Quarantining ROLE_OR_OTHER content here (rather than instructing the synth
// step to "ignore role stuff") is what actually stops the leak — the salient
// material is named and set aside before the brief is written.
const classifySystemPrompt = `You are triaging excerpts from a user's personal job-search notes. Do NOT write a brief. Output a structured list only.

For EVERY distinct preference or rule in the excerpts, emit one item in EXACTLY this format:

<item scope="COMPANY|ROLE_OR_OTHER" polarity="INCLUDE|EXCLUDE|NEUTRAL" strength="HARD|SOFT|NEUTRAL">
quote: "<verbatim text copied exactly from the excerpt>"
claim: <one neutral sentence restating the preference>
</item>

Classification rules:
- scope="COMPANY" ONLY if the preference is about the COMPANY ITSELF: industry / vertical, what the product does, the industry it changes, mission, business model, funding stage, size / headcount, the company's location, ownership / independence.
- scope="ROLE_OR_OTHER" for ANYTHING about the user's job, day-to-day work, title, seniority, skills, the team/role culture they want, learning, or personal / career goals — EVEN IF it sounds company-flavored. These are all ROLE_OR_OTHER: "engineers do architecture not just coding", "being customer-facing matters", "mix of problems: software architecture, team dynamics", "building toward starting your own company", "maximize learning velocity", "proximity to people who have built and scaled".
- polarity is read from the QUOTE's literal wording, never inferred. A list of things to skip/avoid is EXCLUDE. A "hard rule" / "no X" / "skip" is EXCLUDE (and strength=HARD if stated as a hard rule). "Ideal / want / drawn to" is INCLUDE.
- strength=HARD only when the note says so ("hard rule", "always", "regardless", "automatic"). Otherwise SOFT. NEUTRAL for background facts.
- Cover EVERYTHING; do not judge importance — a later step filters and writes the brief.
- Copy quotes verbatim. Do not paraphrase or fix wording.`

// synthSystemPrompt is step 2: write the company-fit brief from the COMPANY
// items only. Because direction was decided (per-item polarity) upstream, this
// step renders rather than re-derives it — which is what keeps skip-lists from
// inverting.
const synthSystemPrompt = `Below are pre-classified preference items extracted from a user's notes, each tagged with scope, polarity, and strength and carrying a verbatim quote.

Write a concise COMPANY-FIT BRIEF using ONLY items with scope="COMPANY". Silently ignore every scope="ROLE_OR_OTHER" item — never rephrase, summarize, or smuggle it in, not even into Context.

Render exactly these three sections, "- " bullets only (no numbered lists, no sub-headers), one criterion per bullet:

## Hard dealbreakers
polarity=EXCLUDE items, and strength=HARD INCLUDE requirements. A company that violates one is an automatic "no".

## Strong preferences
SOFT INCLUDE / EXCLUDE items — strong signals, not absolute.

## Context
NEUTRAL, company-level background only (e.g. how to weigh domain proximity). No role, career, or personal content.

Faithfulness:
- Preserve each item's polarity DIRECTION exactly as its quote states it. A skip-list stays a skip-list; never invert it or infer the allowed complement.
- When the notes list acceptable alternatives (e.g. several okay verticals), state them as alternatives: "any one of: X, Y, Z qualifies."
- Be specific and compact; name verticals, stages, traits. For hard location / stage gates, mirror the note's own wording.
- Before finishing, verify: (a) no bullet describes the user's role, work, or personal goals; (b) every include / exclude bullet's direction matches its source. Drop any bullet that fails.

An optional one-line title above the sections is fine. Output only the brief.`
