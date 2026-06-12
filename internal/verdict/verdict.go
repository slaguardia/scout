// Package verdict scores enriched survivors with the Anthropic API using the
// current taste block. Results are persisted to verdicts. A scored company is
// sticky: a default run skips any company that already has a verdict (criteria
// or playbook edits do not re-score it). Re-scoring is always explicit — a
// targeted per-company run, or a --force run that re-scores everything.
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
	Force  bool // re-score every eligible company, replacing existing verdicts

	// OnlyBlanks limits the run to companies with no verdict row at all — the
	// "just the new arrivals" pass. This is also what a default (non-force) run
	// now does, since scored companies are sticky; the flag stays for explicit
	// callers and to share the run-dialog knob with enrich. Takes precedence
	// over Force.
	OnlyBlanks bool

	// CompanyIDs limits the run to exactly these companies and always
	// re-scores them — a targeted run is an explicit ask, so up-to-date and
	// even manual verdicts are overwritten. Overrides Force and OnlyBlanks.
	// The explicit ask also bypasses the static taste filter: a company you
	// point at by id is scored even if it wouldn't survive the bulk pre-filter
	// (e.g. an excluded-vertical substring false-positive). Only enrichment
	// eligibility still applies — a company lacking an 'ok' row is reported,
	// not scored, since there's no fetched text to reason over.
	CompanyIDs []string

	// Playbook is the agent's operating manual (how to decide) — distinct from
	// Taste (what the user wants). Empty means fall back to the built-in rubric.
	// It's recorded in Taste.Version (the criteria the verdict was scored under,
	// shown in the trail), but editing it no longer re-scores existing verdicts.
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

	// Header up front so the parallelism is legible: the per-company lines below
	// stream one at a time as each finishes, but the work runs Workers-at-once.
	workers := s.Workers
	if workers > len(cands) {
		workers = len(cands)
	}
	s.emit(fmt.Sprintf("scoring %d companies · %d workers in parallel", len(cands), workers))

	jobs := make(chan store.VerdictCandidate)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i := 0; i < s.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				s.emit(fmt.Sprintf("· %s…", c.Name)) // picked up — shows the in-flight burst
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

// candidates returns the companies to score, each paired with its 'ok'
// enrichment summary. A bulk run scores everything that survives the static
// taste filter; a targeted run scores exactly the requested companies and
// bypasses the filter entirely — an explicit re-score is a deliberate ask, and
// taste.toml is only a cheap bulk pre-filter to save LLM cost, not a veto on a
// company you've pointed at by id. Enrichment eligibility ('ok' row) still
// applies in both cases: with no fetched text there's nothing to reason over.
func (s *Scorer) candidates() ([]store.VerdictCandidate, error) {
	wanted := make(map[string]bool, len(s.CompanyIDs))
	for _, id := range s.CompanyIDs {
		wanted[id] = true
	}

	var ids []string
	var byID map[string]filter.Survivor

	if len(wanted) > 0 {
		// Targeted: load the requested companies straight from the table,
		// skipping the static filter. Say why anything asked for is missing — a
		// silent zero-company run reads as a bug.
		svs, err := s.requestedCompanies(s.CompanyIDs)
		if err != nil {
			return nil, err
		}
		byID = make(map[string]filter.Survivor, len(svs))
		for _, sv := range svs {
			ids = append(ids, sv.ID)
			byID[sv.ID] = sv
		}
		if len(ids) < len(wanted) {
			s.emit(fmt.Sprintf("targeted: %d of %d requested companies exist", len(ids), len(wanted)))
		}
	} else {
		fres, err := s.Filter.Apply(s.DB)
		if err != nil {
			return nil, err
		}
		byID = make(map[string]filter.Survivor, len(fres.Survivors))
		for _, sv := range fres.Survivors {
			ids = append(ids, sv.ID)
			byID[sv.ID] = sv
		}
	}
	if len(ids) == 0 {
		return nil, nil
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
	if len(wanted) > 0 && len(out) < len(ids) {
		s.emit(fmt.Sprintf("targeted: %d of %d requested companies have an ok enrichment row", len(out), len(ids)))
	}
	return out, rows.Err()
}

// requestedCompanies loads the given companies as filter.Survivor projections,
// bypassing the static taste filter — used only by targeted runs, where the
// explicit ask overrides the bulk pre-filter. The SELECT mirrors
// filter.Taste.Apply so the user prompt is built from identical fields. IDs
// with no matching row are simply absent (the caller reports the shortfall).
func (s *Scorer) requestedCompanies(idList []string) ([]filter.Survivor, error) {
	q, args := buildInQuery(`
SELECT id, name, COALESCE(domain,''), COALESCE(location,''), COALESCE(vertical,''),
       COALESCE(headcount, 0), COALESCE(funding_stage,'')
FROM companies WHERE id IN `, idList)
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []filter.Survivor
	for rows.Next() {
		var sv filter.Survivor
		if err := rows.Scan(&sv.ID, &sv.Name, &sv.Domain, &sv.Location, &sv.Vertical, &sv.Headcount, &sv.Stage); err != nil {
			return nil, err
		}
		out = append(out, sv)
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
	// A targeted run always re-scores — the user pointed at this company on
	// purpose, so even a sticky manual verdict is fair game.
	if len(s.CompanyIDs) == 0 && (s.OnlyBlanks || !s.Force) {
		existing, err := s.DB.GetVerdict(c.CompanyID)
		if err != nil {
			return nil, 0, 0, err
		}
		if existing != nil {
			// Any already-scored company is left untouched on a default or
			// blanks-only run. Verdicts don't go stale on a criteria change — they
			// persist until an explicit re-score (--force, or a targeted run). This
			// keeps a brief/playbook edit from silently churning every verdict.
			return nil, 0, 0, nil
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
// playbook is supplied. The shipped default playbook supersedes this.
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
