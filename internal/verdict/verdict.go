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
	"github.com/slaguardia/scout/internal/brainbot"
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
	// Taste (what Alex wants). Empty means fall back to the built-in rubric.
	// The caller is responsible for folding the playbook text into
	// Taste.Version so verdicts re-score when the playbook changes.
	Playbook string

	// EscalateModel: when non-empty, after the first Haiku pass, every row
	// still scored 'maybe' is re-scored with this model (typically Sonnet).
	// Idempotent per (company_id, taste_version, escalated_model).
	EscalateModel string

	// Optional: when set, scoreOne calls search_nodes(query=company.Name)
	// against the brain and appends "What the brain already knows" to the
	// user prompt. Cached per-Run via brainCache; brain errors are logged
	// and ignored so verdict never fails because of a brain miss.
	Brainbot *brainbot.Client

	Workers int

	// Progress, if set, receives one line per scored company (both passes).
	// Called from worker goroutines — must be safe for concurrent use.
	Progress func(string)

	brainMu    sync.Mutex
	brainCache map[string][]brainbot.Node
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

	// Escalation second-pass stats (zero when EscalateModel is unset).
	EscalateConsidered int
	EscalateScored     int
	EscalateSkipped    int
	EscalateFailed     int
	EscalateByVerdict  map[string]int
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
	// Fresh brain-context cache per Run.
	s.brainCache = make(map[string][]brainbot.Node)

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
					fmt.Printf("verdict %d (%s) error: %v\n", c.CompanyID, c.Name, err)
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

	// Second pass: re-score maybes with the escalation model.
	if s.EscalateModel != "" {
		res.EscalateByVerdict = map[string]int{}
		if err := s.runEscalation(ctx, res); err != nil {
			return res, err
		}
	}
	return res, nil
}

// runEscalation finds every 'maybe' verdict at the current taste_version
// that hasn't been escalated to s.EscalateModel and re-scores it. Updates
// res.EscalateXxx counters. Same worker pool model as Run.
func (s *Scorer) runEscalation(ctx context.Context, res *Result) error {
	ids, err := s.DB.MaybesNeedingEscalation(s.Taste.Version, s.EscalateModel)
	if err != nil {
		return err
	}
	res.EscalateConsidered = len(ids)
	if len(ids) == 0 {
		return nil
	}

	// Rebuild the candidate payload for each id from filter survivors +
	// enrichment. We could SELECT directly, but reusing candidates() keeps
	// the data shape identical to the first pass.
	allCands, err := s.candidates()
	if err != nil {
		return err
	}
	byID := make(map[int64]store.VerdictCandidate, len(allCands))
	for _, c := range allCands {
		byID[c.CompanyID] = c
	}

	jobs := make(chan store.VerdictCandidate)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i := 0; i < s.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				v, cacheCreate, cacheRead, err := s.escalateOne(ctx, c)
				mu.Lock()
				res.CacheCreationTokens += cacheCreate
				res.CacheReadTokens += cacheRead
				if err != nil {
					res.EscalateFailed++
					mu.Unlock()
					fmt.Printf("escalate %d (%s) error: %v\n", c.CompanyID, c.Name, err)
					s.emit(fmt.Sprintf("escalate %s — error: %v", c.Name, err))
					continue
				}
				if v == nil {
					res.EscalateSkipped++
					mu.Unlock()
					continue
				}
				res.EscalateScored++
				res.EscalateByVerdict[v.Verdict]++
				mu.Unlock()
				s.emit(fmt.Sprintf("escalated %s → %s", c.Name, v.Verdict))
			}
		}()
	}

	for _, id := range ids {
		c, ok := byID[id]
		if !ok {
			// Survivor set or enrichment changed since the first pass —
			// skip rather than fail. This is rare in practice.
			res.EscalateSkipped++
			continue
		}
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return ctx.Err()
		case jobs <- c:
		}
	}
	close(jobs)
	wg.Wait()
	return nil
}

// escalateOne re-scores a single candidate with s.EscalateModel and persists
// via UpsertEscalatedVerdict. Returns (nil, ...) if skipped.
func (s *Scorer) escalateOne(ctx context.Context, c store.VerdictCandidate) (*store.Verdict, int, int, error) {
	brainNodes := s.lookupBrain(ctx, c.Name) // re-uses per-Run cache
	system := buildSystemPrompt(s.Playbook, s.Taste.Text)
	user := buildUserPrompt(c, brainNodes)

	callCtx, cancel := context.WithTimeout(ctx, 60*time.Second) // sonnet a bit slower
	defer cancel()

	resp, err := s.Client.Send(callCtx, anthropic.Request{
		Model:     s.EscalateModel,
		System:    system,
		MaxTokens: 256,
		Messages:  []anthropic.Message{{Role: "user", Content: user}},
		Cached:    true, // identical system block across calls
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
		Model:        s.EscalateModel,
	}
	if err := s.DB.UpsertEscalatedVerdict(v, s.EscalateModel); err != nil {
		return nil, resp.Usage.CacheCreationInputTokens, resp.Usage.CacheReadInputTokens, err
	}
	return &v, resp.Usage.CacheCreationInputTokens, resp.Usage.CacheReadInputTokens, nil
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
	ids := make([]int64, 0, len(fres.Survivors))
	byID := make(map[int64]filter.Survivor, len(fres.Survivors))
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
		var id int64
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

func buildInQuery(prefix string, ids []int64) (string, []any) {
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
		if existing != nil && existing.TasteVersion == s.Taste.Version {
			return nil, 0, 0, nil // up to date, skip
		}
	}

	brainNodes := s.lookupBrain(ctx, c.Name)
	system := buildSystemPrompt(s.Playbook, s.Taste.Text)
	user := buildUserPrompt(c, brainNodes)

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
	return &v, resp.Usage.CacheCreationInputTokens, resp.Usage.CacheReadInputTokens, nil
}

// hardContract is the one invariant the parser depends on. It is never
// editable from the playbook — a broken output contract breaks parsing.
const hardContract = `You are Scout's verdict engine. Given a company, decide if it's worth Alex's time to investigate further as a job opportunity. Reply ONLY with valid JSON, no preamble, no markdown fences. The JSON must have exactly two fields:
  {"verdict": "yes"|"maybe"|"no", "reason": "one-line, specific"}`

// builtinRubric is the fallback "how to decide" guidance used only when no
// playbook.md is supplied. The shipped playbook.md supersedes this.
const builtinRubric = `Verdict rubric:
  - "yes":   high-confidence fit. Worth Alex actively investigating.
  - "maybe": adjacent or uncertain. Worth a skim, not a deep dive.
  - "no":    poor fit or hard exclusion.

The reason must be specific — name the vertical, stage, or trait that drove the call. Don't say "matches taste" or "good fit"; say "AI infra for ML teams, Series B" or "crypto wallet (excluded)".`

// buildSystemPrompt assembles three layers: the hard JSON contract (fixed),
// the playbook / how-to-decide (operator-editable, falls back to the builtin
// rubric), then the taste / what-Alex-wants block.
func buildSystemPrompt(playbook, taste string) string {
	var b strings.Builder
	b.WriteString(hardContract)

	b.WriteString("\n\n--- PLAYBOOK (how to decide) ---\n")
	if pb := strings.TrimSpace(playbook); pb != "" {
		b.WriteString(pb)
	} else {
		b.WriteString(builtinRubric)
	}

	b.WriteString("\n\n--- TASTE (what Alex wants) ---\n")
	b.WriteString(strings.TrimSpace(taste))
	return b.String()
}

func buildUserPrompt(c store.VerdictCandidate, brainNodes []brainbot.Node) string {
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
	if len(brainNodes) > 0 {
		b.WriteString("\nWhat the brain already knows about this company:\n")
		for _, n := range brainNodes {
			fmt.Fprintf(&b, "- %s", n.Name)
			if len(n.Labels) > 0 {
				fmt.Fprintf(&b, " (%s)", strings.Join(n.Labels, ", "))
			}
			if n.Summary != "" {
				fmt.Fprintf(&b, ": %s", n.Summary)
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("\nReturn the JSON verdict now.")
	return b.String()
}

// lookupBrain returns cached nodes for the company name. On brain error,
// logs to stderr and returns nil — the verdict still runs without brain
// context. Empty slices are also cached so retries don't re-query.
func (s *Scorer) lookupBrain(ctx context.Context, name string) []brainbot.Node {
	if s.Brainbot == nil || !s.Brainbot.Enabled() {
		return nil
	}
	s.brainMu.Lock()
	if nodes, ok := s.brainCache[name]; ok {
		s.brainMu.Unlock()
		return nodes
	}
	s.brainMu.Unlock()

	lookupCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	nodes, err := s.Brainbot.SearchNodes(lookupCtx, name, 5)
	if err != nil {
		fmt.Fprintf(os.Stderr, "brain lookup for %q failed: %v\n", name, err)
		nodes = nil
	}

	s.brainMu.Lock()
	s.brainCache[name] = nodes
	s.brainMu.Unlock()
	return nodes
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
