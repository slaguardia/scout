// Package distill is scout's intelligence layer in front of the brain.
//
// The brain is a librarian: recall(query) returns the prose most related to a
// question, and with the user's small corpus that retrieval is coarse — it
// returns whole pages, scored almost flat, mixing the relevant with the
// irrelevant. The distiller does the focusing the brain can't yet: it fans out
// a few company-fit questions, dedups what comes back, and makes ONE grounded
// LLM call to synthesize a concise company-fit BRIEF — the criteria another
// agent (the verdict engine) judges each company against.
//
// The brief is scout-local: it is a re-derived view of brain knowledge, never
// written back, and never a verdict. It replaces the old tagged-facts criteria
// block — instead of polarity/strength tags handed over by the brain, the
// distiller writes the structure itself (dealbreakers / preferences / context),
// in prose, which is what an LLM actually reasons over well.
//
// Scope: COMPANIES ONLY. Role/title fit is a separate, later concern and is
// deliberately not distilled here (see companyQuestions).
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

// synthesisMaxTokens bounds the brief. It's a focused summary, not an essay.
const synthesisMaxTokens = 1500

// Distiller turns brain recall into a company-fit brief.
type Distiller struct {
	Brain  *brainbot.Client
	Client *anthropic.Client
	Model  string // empty → anthropic.DefaultModel
	K      int    // per-question recall depth; <= 0 → defaultK

	// Log, if set, receives one human-readable line per recall and for the
	// synthesized brief — the tuning instrument for inspecting recall → brief.
	Log func(string)
}

func (d *Distiller) log(format string, args ...any) {
	if d.Log != nil {
		d.Log(fmt.Sprintf(format, args...))
	}
}

// Result is a full distillation: the synthesized brief, the deduped chunks it
// was built from (so the CLI debug path can show both), and a stable Basis.
//
// Basis is the version key: it is the synthesis prompt + the recalled chunks'
// content, NOT the brief prose. The brief drifts cosmetically across runs even
// at temperature 0 (bullets vs numbers, reworded prose); keying the criteria
// version off Basis instead means a re-distill only re-scores companies when the
// underlying notes (or the prompt) actually change — not when the wording wobbles.
type Result struct {
	Brief  string
	Chunks []brainbot.Chunk
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

// Run does the whole distillation and returns the brief, the chunks behind it,
// and the stable Basis.
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
	brief, err := d.synthesize(ctx, chunks)
	if err != nil {
		return nil, err
	}
	d.log("distill: brief synthesized (%d chars) from %d chunks", len(brief), len(chunks))
	return &Result{Brief: brief, Chunks: chunks, Basis: basisOf(chunks)}, nil
}

// basisOf builds the stable version key from the chunks: the synthesis prompt
// plus each chunk's path/heading/text, ordered by (path, heading). It
// deliberately excludes the hybrid-search score (which jitters run-to-run) and
// the brief prose (which drifts). Folding the prompt in means a prompt edit
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
	b.WriteString(synthesisSystemPrompt)
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
// (score desc, then path, then heading) so the synthesis input — and therefore
// the brief — is stable across runs.
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

// synthesize makes the single grounded LLM call that turns the chunks into the
// brief. Temperature is pinned to 0 and the system prompt is cached so a re-run
// over identical chunks yields a stable brief (no spurious re-scores).
func (d *Distiller) synthesize(ctx context.Context, chunks []brainbot.Chunk) (string, error) {
	zero := 0.0
	resp, err := d.Client.Send(ctx, anthropic.Request{
		Model:       d.Model,
		System:      synthesisSystemPrompt,
		MaxTokens:   synthesisMaxTokens,
		Messages:    []anthropic.Message{{Role: "user", Content: formatChunks(chunks)}},
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

// formatChunks renders the deduped chunks as the user message: each labeled with
// its source path/heading so the model can cite provenance and discard the
// off-topic ones.
func formatChunks(chunks []brainbot.Chunk) string {
	var b strings.Builder
	b.WriteString("Excerpts retrieved from the user's own notes:\n\n")
	for _, c := range chunks {
		fmt.Fprintf(&b, "[Source: %s]\n%s\n\n", chunkLabel(c), strings.TrimSpace(c.Text))
	}
	b.WriteString("Write the company-fit brief now.")
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

// synthesisSystemPrompt instructs the model to focus and ground. It writes the
// dealbreaker/preference/context structure itself, in prose — there are no tags
// from the brain to gate on. It is COMPANY-fit only.
const synthesisSystemPrompt = `You are Scout's criteria distiller. The user is evaluating COMPANIES as potential job opportunities. Below are excerpts retrieved from the user's own notes about what they want. Synthesize them into a concise company-fit brief that another agent will use to decide whether a given company is worth the user's time.

Rules:
- Ground EVERY statement in the provided excerpts, in the user's own words where you can. Invent nothing — if the notes don't say it, leave it out.
- Preserve each rule's DIRECTION exactly. When the notes mark something as a skip / avoid / exclude / "no", it stays on the exclude side — never flip it to allowed, and never infer the allowed set by taking the complement of a skip-list (or vice-versa). A list of examples after "everything else … is a skip" is a list of things to SKIP, not to allow. For hard gates (location, stage, funding), mirror the note's own wording — quote it rather than paraphrase, since paraphrase is where inversions creep in.
- COMPANIES ONLY, in every section including Context. KEEP only attributes of the company itself: domain/vertical, what the product does, the industry it changes, mission, business model, funding stage, size/headcount. DROP anything about the job: titles, seniority, and the day-to-day shape of the work (coding vs. architecture vs. integration vs. customer-facing). Do NOT re-admit a role preference by rephrasing it as a company trait — e.g. "a company where engineers do architecture/integration, not just coding" is still a role preference; drop it. Roles are judged elsewhere.
- The retrieval is broad and returns unrelated material — discard excerpts that aren't about what kind of company the user wants.
- When the user lists acceptable alternatives (e.g. several okay verticals), state them explicitly as alternatives: "any one of: X, Y, Z qualifies."
- Be specific and compact. Name the verticals, stages, traits — don't generalize them away.
- Format: under each section use "- " bullets only — no numbered lists, no extra sub-headers, one criterion per bullet. Emit only the three section headers below (an optional one-line title above them is fine).

Output these sections in this order (omit a section only if the notes genuinely say nothing for it):

## Hard dealbreakers
Things that make a company an automatic "no".

## Strong preferences
What the user is drawn to or leans away from — strong signals, but not absolute.

## Context
Background that colors judgment but isn't itself a rule.`
