// Package verdict scores enriched survivors with the Anthropic API using the
// current taste block. Results are persisted to verdicts. Idempotent by
// (company_id, taste_version): if the existing row already matches, the call
// is skipped.
package verdict

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/filter"
	"github.com/slaguardia/scout/internal/store"
	"github.com/slaguardia/scout/internal/taste"
)

// Scorer is the verdict driver.
type Scorer struct {
	DB     *store.DB
	Taste  *taste.Block
	Filter *filter.Taste
	Client *anthropic.Client
	Model  string
	Force  bool // re-score even if taste_version matches

	// Playbook is the agent's operating manual (how to decide) — distinct from
	// Taste (what the user wants). Empty means fall back to the built-in rubric.
	// The caller is responsible for folding the playbook text into
	// Taste.Version so verdicts re-score when the playbook changes.
	Playbook string

	// RunID, when set, tags every decision-trail row with the UI run uuid so a
	// company's timeline can be grouped by run. Empty for CLI runs.
	RunID string

	Workers int

	// Progress, if set, receives one line per scored company (both passes).
	// Called from worker goroutines — must be safe for concurrent use.
	Progress func(string)
}

func (s *Scorer) emit(line string) {
	if s.Progress != nil {
		s.Progress(line)
	}
}

// Result is the run summary.
type Result struct {
	Considered          int
	Scored              int
	Skipped             int
	Failed              int
	ByVerdict           map[string]int
	CacheCreationTokens int // sum of cache_creation_input_tokens across all calls
	CacheReadTokens     int // sum of cache_read_input_tokens (the saving)
}

// Run scores every survivor (per filter rules) that has enrichment and lacks
// an up-to-date verdict.
func (s *Scorer) Run(ctx context.Context) (*Result, error) {
	if s.Workers <= 0 {
		s.Workers = 4
	}
	if s.Model == "" {
		s.Model = anthropic.DefaultModel
	}

	cands, err := s.candidates()
	if err != nil {
		return nil, err
	}

	res := &Result{Considered: len(cands), ByVerdict: map[string]int{}}
	if len(cands) == 0 {
		return res, nil
	}

	jobs := make(chan store.VerdictCandidate)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i := 0; i < s.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				v, cacheCreate, cacheRead, err := s.scoreOne(ctx, c)
				mu.Lock()
				res.CacheCreationTokens += cacheCreate
				res.CacheReadTokens += cacheRead
				if err != nil {
					res.Failed++
					mu.Unlock()
					fmt.Printf("verdict %s (%s) error: %v\n", c.CompanyID, c.Name, err)
					s.emit(fmt.Sprintf("%s — error: %v", c.Name, err))
					continue
				}
				if v == nil {
					res.Skipped++
					mu.Unlock()
					s.emit(fmt.Sprintf("%s — skipped (up to date)", c.Name))
					continue
				}
				res.Scored++
				res.ByVerdict[v.Verdict]++
				mu.Unlock()
				s.emit(fmt.Sprintf("%s → %s — %s", c.Name, v.Verdict, v.Reason))
			}
		}()
	}

	for _, c := range cands {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return res, ctx.Err()
		case jobs <- c:
		}
	}
	close(jobs)
	wg.Wait()
	return res, nil
}

// candidates: companies that survive the static SQL filter AND have an 'ok' enrichment row.
func (s *Scorer) candidates() ([]store.VerdictCandidate, error) {
	fres, err := s.Filter.Apply(s.DB)
	if err != nil {
		return nil, err
	}
	if len(fres.Survivors) == 0 {
		return nil, nil
	}
	ids := make([]string, 0, len(fres.Survivors))
	byID := make(map[string]filter.Survivor, len(fres.Survivors))
	for _, sv := range fres.Survivors {
		ids = append(ids, sv.ID)
		byID[sv.ID] = sv
	}

	// Pull enrichment summaries for those IDs.
	q, args := buildInQuery(`
SELECT company_id, COALESCE(website_summary, '')
FROM enrichment
WHERE fetch_status = 'ok' AND company_id IN `, ids)
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []store.VerdictCandidate
	for rows.Next() {
		var id string
		var summary string
		if err := rows.Scan(&id, &summary); err != nil {
			return nil, err
		}
		sv := byID[id]
		out = append(out, store.VerdictCandidate{
			CompanyID:      id,
			Name:           sv.Name,
			Domain:         sv.Domain,
			Location:       sv.Location,
			Vertical:       sv.Vertical,
			Headcount:      sv.Headcount,
			Stage:          sv.Stage,
			WebsiteSummary: summary,
		})
	}
	return out, rows.Err()
}

func buildInQuery(prefix string, ids []string) (string, []any) {
	if len(ids) == 0 {
		return prefix + "()", nil
	}
	ph := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		ph[i] = "?"
		args[i] = id
	}
	return prefix + "(" + strings.Join(ph, ",") + ")", args
}

// scoreOne returns the upserted verdict (nil if skipped), plus the
// cache_creation and cache_read input-token counts from the response so
// Run() can aggregate them.
func (s *Scorer) scoreOne(ctx context.Context, c store.VerdictCandidate) (*store.Verdict, int, int, error) {
	if !s.Force {
		existing, err := s.DB.GetVerdict(c.CompanyID)
		if err != nil {
			return nil, 0, 0, err
		}
		// A hand-set verdict is sticky: leave it untouched unless --force. A manual
		// correction that auto-reverts on the next run would be pointless.
		if existing != nil && existing.Model == store.ManualModel {
			return nil, 0, 0, nil // manual override, skip
		}
		if existing != nil && existing.TasteVersion == s.Taste.Version {
			return nil, 0, 0, nil // up to date, skip
		}
	}

	system := buildSystemPrompt(s.Playbook, s.Taste.Text)
	user := buildUserPrompt(c)

	// Bound per-call latency separately from the global ctx.
	callCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	resp, err := s.Client.Send(callCtx, anthropic.Request{
		Model:     s.Model,
		System:    system,
		MaxTokens: 256,
		Messages:  []anthropic.Message{{Role: "user", Content: user}},
		Cached:    true, // taste + rubric are identical across all calls in a run
	})
	if err != nil {
		return nil, 0, 0, err
	}

	verdict, reason, err := parseVerdict(resp.Text())
	if err != nil {
		return nil, resp.Usage.CacheCreationInputTokens, resp.Usage.CacheReadInputTokens,
			fmt.Errorf("parse: %w (raw=%q)", err, truncate(resp.Text(), 200))
	}

	v := store.Verdict{
		CompanyID:    c.CompanyID,
		Verdict:      verdict,
		Reason:       reason,
		TasteVersion: s.Taste.Version,
		Model:        s.Model,
	}
	if err := s.DB.UpsertVerdict(v); err != nil {
		return nil, resp.Usage.CacheCreationInputTokens, resp.Usage.CacheReadInputTokens, err
	}
	s.writeTrace(c, s.Model, verdict, reason)
	return &v, resp.Usage.CacheCreationInputTokens, resp.Usage.CacheReadInputTokens, nil
}

// hardContract is the one invariant the parser depends on. It is never
// editable from the playbook — a broken output contract breaks parsing.
const hardContract = `You are Scout's verdict engine. Given a company, decide if it's worth the user's time to investigate further as a job opportunity. Reply ONLY with valid JSON, no preamble, no markdown fences. The JSON must have exactly two fields:
  {"verdict": "yes"|"maybe"|"no", "reason": "one-line, specific"}`

// builtinRubric is the fallback "how to decide" guidance used only when no
// playbook.md is supplied. The shipped playbook.md supersedes this.
const builtinRubric = `Verdict rubric:
  - "yes":   high-confidence fit. Worth the user actively investigating.
  - "maybe": adjacent or uncertain. Worth a skim, not a deep dive.
  - "no":    poor fit or hard exclusion.

The reason must be specific — name the vertical, stage, or trait that drove the call. Don't say "matches taste" or "good fit"; say "AI infra for ML teams, Series B" or "crypto wallet (excluded)".`

// hardGateRubric tells the LLM how to read the criteria brief. The brief is a
// distilled, prose company-fit summary (from the distiller, or taste.md
// offline) — there are no [requires]/[excludes] tags to key on; the stance is
// in the words. The brief states acceptable alternatives explicitly ("any one
// of: X, Y, Z"), so the OR-set logic lives in the brief's prose, and this rubric
// only has to say how to weigh dealbreakers vs preferences vs context.
const hardGateRubric = `The criteria below are a distilled company-fit brief in the user's own terms. Read it and apply it like this:
• Anything stated as a hard dealbreaker or exclusion is a gate: if the company hits it, the verdict is "no" (red). Name the dealbreaker in the reason.
• Anything stated as a hard requirement is a gate that must hold on its own. Where the brief lists acceptable alternatives ("any one of: X, Y, Z"), matching ONE satisfies it — not matching the others is expected and is NOT a strike.
• Strong preferences are weights, not gates: a miss leans "maybe" (yellow), never an automatic "no".
• Context is background for judgment, not a rule to gate on.

`

// buildSystemPrompt assembles three layers: the hard JSON contract (fixed),
// the playbook / how-to-decide (operator-editable, falls back to the builtin
// rubric), then the criteria / what-the-user-wants block.
func buildSystemPrompt(playbook, criteria string) string {
	var b strings.Builder
	b.WriteString(hardContract)

	b.WriteString("\n\n--- PLAYBOOK (how to decide) ---\n")
	if pb := strings.TrimSpace(playbook); pb != "" {
		b.WriteString(pb)
	} else {
		b.WriteString(builtinRubric)
	}

	b.WriteString("\n\n--- CRITERIA (what the user wants) ---\n")
	b.WriteString(hardGateRubric)
	b.WriteString(strings.TrimSpace(criteria))
	return b.String()
}

func buildUserPrompt(c store.VerdictCandidate) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Company: %s\n", c.Name)
	if c.Domain != "" {
		fmt.Fprintf(&b, "Domain: %s\n", c.Domain)
	}
	if c.Vertical != "" {
		fmt.Fprintf(&b, "Vertical: %s\n", c.Vertical)
	}
	if c.Location != "" {
		fmt.Fprintf(&b, "Location: %s\n", c.Location)
	}
	if c.Headcount > 0 {
		fmt.Fprintf(&b, "Headcount: %d\n", c.Headcount)
	}
	if c.Stage != "" {
		fmt.Fprintf(&b, "Funding stage: %s\n", c.Stage)
	}
	if c.WebsiteSummary != "" {
		fmt.Fprintf(&b, "\nWebsite text (truncated):\n%s\n", c.WebsiteSummary)
	}
	b.WriteString("\nReturn the JSON verdict now.")
	return b.String()
}

// writeTrace appends one decision-trail row for a completed scoring pass: which
// criteria/version/model drove this verdict. Best-effort — a failure is logged
// but never fails the verdict (the trail is a debugging aid, not the result).
func (s *Scorer) writeTrace(c store.VerdictCandidate, model, verdict, reason string) {
	t := store.VerdictTrace{
		CompanyID:      c.CompanyID,
		RunID:          s.RunID,
		Model:          model,
		TasteVersion:   s.Taste.Version,
		CriteriaSource: s.Taste.Source,
		Verdict:        verdict,
		Reason:         reason,
	}
	if err := s.DB.InsertVerdictTrace(t); err != nil {
		fmt.Fprintf(os.Stderr, "verdict trace %s (%s): %v\n", c.CompanyID, c.Name, err)
	}
}

// Verdict parsing: tolerant of surrounding noise, fenced code blocks, etc.

var reJSON = regexp.MustCompile(`(?s)\{[^{}]*\}`)

func parseVerdict(s string) (verdict, reason string, err error) {
	s = strings.TrimSpace(s)
	candidates := []string{s}
	if m := reJSON.FindString(s); m != "" {
		candidates = append([]string{m}, candidates...)
	}
	for _, c := range candidates {
		var v struct {
			Verdict string `json:"verdict"`
			Reason  string `json:"reason"`
		}
		if err := json.Unmarshal([]byte(c), &v); err == nil {
			vv := strings.ToLower(strings.TrimSpace(v.Verdict))
			switch vv {
			case "yes", "maybe", "no":
				return vv, strings.TrimSpace(v.Reason), nil
			}
		}
	}
	return "", "", fmt.Errorf("no valid verdict JSON")
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
