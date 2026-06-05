package outreach

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

// Engine runs the outreach draft pipeline for one draft row. It implements
// web.OutreachRunner: Draft fires async (the panel polls the row), Run is the
// synchronous CLI entry point. Every terminal path writes a final status — a
// row must never be left stuck in `researching`.
//
// The engine reads ONLY the local block cache (GetOutreachBlock); it never
// touches the brain at draft time (all brain access happens at sync time, by
// design — see docs/outreach-agent.md). The five LLM stages all run on Model.
type Engine struct {
	DB     *store.DB
	Client *anthropic.Client
	Model  string // all five agents; empty → anthropic.DefaultModel
	Log    func(string)

	// HTTP is the client for the deterministic JD pre-fetch. Optional; a nil
	// value uses a default with a sane timeout.
	HTTP *http.Client
}

const (
	// draftTimeout bounds one full pipeline run (5 LLM calls + web search +
	// possible drafter retry). Generous: web_search adds latency.
	draftTimeout = 8 * time.Minute
	// researcherMaxTokens covers the structured-facts JSON (hooks + quotes).
	researcherMaxTokens = 4000
	// stageMaxTokens covers the smaller per-stage JSON outputs and the email.
	stageMaxTokens = 2000
	// cardMaxTokens covers the ~150-word experience card.
	cardMaxTokens = 600
	// maxContinuations bounds pause_turn resumes of the hosted web_search
	// server-side loop (per stage call); past it the partial output is used.
	maxContinuations = 4
	// webSearchMaxUses caps the researcher's hosted searches per run.
	webSearchMaxUses = 6
)

func (e *Engine) log(format string, args ...any) {
	if e.Log != nil {
		e.Log(fmt.Sprintf(format, args...))
	}
}

func (e *Engine) model() string {
	if e.Model != "" {
		return e.Model
	}
	return anthropic.DefaultModel
}

// Draft satisfies web.OutreachRunner: it runs the pipeline in a goroutine with
// its own background context + timeout, and returns immediately. The panel sees
// progress by polling the draft row.
func (e *Engine) Draft(draftID int64) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), draftTimeout)
		defer cancel()
		if err := e.Run(ctx, draftID); err != nil {
			e.log("outreach: draft %d failed: %v", draftID, err)
		}
	}()
}

// Run executes the whole pipeline synchronously. It always leaves the draft in
// a terminal-or-review status: a deferred catch-all flips a still-`researching`
// row to `failed` on any early return or panic, so a crash never strands a row.
func (e *Engine) Run(ctx context.Context, draftID int64) (err error) {
	// Catch-all: if anything below returns early or panics while the row is
	// still researching, record the failure. Reads the row fresh so a stage
	// that already wrote a terminal status is not clobbered.
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic: %v", r)
		}
		if err == nil {
			return
		}
		if d, gErr := e.DB.GetOutreachDraft(draftID); gErr == nil && d != nil && d.Status == store.DraftResearching {
			reason := err.Error()
			_ = e.DB.SetOutreachDraftResult(draftID, store.DraftFailed,
				d.Research, d.Hook, d.Draft, d.Lint, d.Violations, reason)
		}
	}()

	d, err := e.DB.GetOutreachDraft(draftID)
	if err != nil {
		return fmt.Errorf("load draft: %w", err)
	}
	if d == nil {
		return fmt.Errorf("draft %d not found", draftID)
	}

	posting, err := e.DB.GetPosting(d.PostingID)
	if err != nil {
		return fmt.Errorf("load posting: %w", err)
	}
	if posting == nil {
		return fmt.Errorf("posting %s not found", d.PostingID)
	}
	company, _, err := e.DB.CompanyNameByID(posting.CompanyID)
	if err != nil {
		return fmt.Errorf("load company name: %w", err)
	}
	role := strings.TrimSpace(posting.Title)
	e.log("outreach: draft %d — %s / %q", draftID, company, role)

	// 2. JD pre-fetch (no model).
	jd := FetchJD(ctx, e.HTTP, posting.URL)
	e.log("outreach: draft %d JD fetch: %s (%d chars)", draftID, jd.Status, len(jd.Text))

	// 3. Researcher (Sonnet + hosted web_search).
	research, err := e.research(ctx, company, posting.URL, jd)
	if err != nil {
		return fmt.Errorf("researcher: %w", err)
	}
	if err := e.DB.SetOutreachDraftResult(draftID, store.DraftResearching,
		research, "", "", "", "", ""); err != nil {
		return fmt.Errorf("save research: %w", err)
	}

	// 4. Ensure the EXPERIENCE_CARD derived block is fresh.
	if err := e.ensureExperienceCard(ctx); err != nil {
		return fmt.Errorf("experience card: %w", err)
	}

	// 5. Hook selector.
	hookJSON, hook, err := e.selectHook(ctx, research)
	if err != nil {
		return fmt.Errorf("hook selector: %w", err)
	}
	if err := e.DB.SetOutreachDraftResult(draftID, store.DraftResearching,
		research, hookJSON, "", "", "", ""); err != nil {
		return fmt.Errorf("save hook: %w", err)
	}

	// 6. No-honest-hook route: fill the mass-send template in code. Success.
	if hook.Decision == "no_honest_hook" {
		return e.massSendRoute(draftID, research, hookJSON, company, role)
	}

	// 7-10. Hook route: drafter → assemble → lint → humanize → honesty (with
	// one drafter retry on an honesty fail).
	return e.hookRoute(ctx, draftID, research, hookJSON, hook, company, role)
}

// hookRoute drives the drafter/assemble/lint/humanize/honesty path, retrying
// the drafter once when the honesty checker flags a violation.
func (e *Engine) hookRoute(ctx context.Context, draftID int64, research, hookJSON string, hook hookOutput, company, role string) error {
	p2 := e.blockContent("P2_LOCKED")

	var violationNote string
	for attempt := 0; attempt < 2; attempt++ {
		// Drafter (P1 + P3 only).
		drafted, err := e.draft(ctx, hookJSON, role, hook, violationNote)
		if err != nil {
			return fmt.Errorf("drafter: %w", err)
		}

		// Assemble in code, then lint, then humanize, then re-lint.
		email := assembleEmail(drafted.P1, p2, drafted.P3, role)
		email = e.humanize(ctx, email, p2)
		lintJSON := lintJSON(email, p2)

		// Honesty check.
		verdict, violations, err := e.honestyCheck(ctx, email)
		if err != nil {
			return fmt.Errorf("honesty checker: %w", err)
		}
		if verdict == "pass" {
			e.log("outreach: draft %d honesty pass on attempt %d", draftID, attempt+1)
			return e.DB.SetOutreachDraftResult(draftID, store.DraftAwaitingReview,
				research, hookJSON, email, lintJSON, "", "")
		}

		// Fail: on the first attempt, feed the violations back to the drafter
		// and retry. On the second, give up.
		violJSON, _ := json.Marshal(violations)
		e.log("outreach: draft %d honesty fail on attempt %d: %s", draftID, attempt+1, string(violJSON))
		if attempt == 0 {
			violationNote = formatViolations(violations)
			continue
		}
		return e.DB.SetOutreachDraftResult(draftID, store.DraftFailed,
			research, hookJSON, email, lintJSON, string(violJSON), "honesty check failed twice")
	}
	return nil
}

// massSendRoute fills the MASS_SEND_TEMPLATE block in pure code (no model),
// lints it, and lands the draft in no_hook — a SUCCESS path. A missing/broken
// template block still lands no_hook (with an empty draft + fail_reason note).
func (e *Engine) massSendRoute(draftID int64, research, hookJSON, company, role string) error {
	tmpl := e.blockContent("MASS_SEND_TEMPLATE")
	if tmpl == "" {
		e.log("outreach: draft %d no_hook — mass-send template not pinned", draftID)
		return e.DB.SetOutreachDraftResult(draftID, store.DraftNoHook,
			research, hookJSON, "", "", "", "mass-send template block not pinned")
	}
	filled := fillTemplate(tmpl, company, role)
	// P2 may or may not appear in the mass template; only assert it when present.
	p2 := e.blockContent("P2_LOCKED")
	p2Check := ""
	if p2 != "" && strings.Contains(filled, p2) {
		p2Check = p2
	}
	e.log("outreach: draft %d no_hook — mass-send template filled", draftID)
	return e.DB.SetOutreachDraftResult(draftID, store.DraftNoHook,
		research, hookJSON, filled, lintJSON(filled, p2Check), "", "")
}

// blockContent returns a cached block's content, or "" when missing/broken.
func (e *Engine) blockContent(name string) string {
	b, err := e.DB.GetOutreachBlock(name)
	if err != nil || b == nil || b.Broken != "" {
		return ""
	}
	return b.Content
}

// --- stage 3: researcher -------------------------------------------------

// research runs the Researcher with the hosted web_search server tool and
// parses its structured-facts JSON. The system prompt is verbatim from the doc;
// the user message carries the company, URL, and the pre-fetched JD (or its
// failure note).
func (e *Engine) research(ctx context.Context, company, jobURL string, jd JDResult) (string, error) {
	jdSection := jd.Text
	if jdSection == "" {
		jdSection = "JD fetch failed: " + jd.Status
	} else {
		jdSection = fmt.Sprintf("Pre-fetched job description (%s):\n%s", jd.Status, jd.Text)
	}
	user := fmt.Sprintf("Company: %s\nJob URL: %s\n\n%s", company, jobURL, jdSection)

	raw, err := e.callJSON(ctx, researcherSystem, user, researcherMaxTokens, []any{anthropic.NewWebSearchTool(webSearchMaxUses)})
	if err != nil {
		return "", err
	}
	// Validate it is an object; store the cleaned JSON.
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		return "", fmt.Errorf("parse research JSON: %w (raw=%q)", perr, trunc(raw, 200))
	}
	return cleaned, nil
}

// --- stage 4: experience card (derived) ----------------------------------

// ensureExperienceCard distills EXPERIENCE_CARD from PAST_EXPERIENCE_FULL when
// it is missing/broken or stale (its version != "derived:"+<source version>).
// Mirrors the tier rules in docs/outreach-agent.md.
func (e *Engine) ensureExperienceCard(ctx context.Context) error {
	src, err := e.DB.GetOutreachBlock("PAST_EXPERIENCE_FULL")
	if err != nil {
		return err
	}
	if src == nil || src.Broken != "" || src.Content == "" {
		return fmt.Errorf("PAST_EXPERIENCE_FULL block is missing or broken")
	}
	want := "derived:" + src.Version

	card, err := e.DB.GetOutreachBlock("EXPERIENCE_CARD")
	if err != nil {
		return err
	}
	if card != nil && card.Broken == "" && card.Content != "" && card.Version == want {
		return nil // fresh
	}

	e.log("outreach: re-deriving EXPERIENCE_CARD from PAST_EXPERIENCE_FULL@%s", src.Version)
	resp, err := e.Client.Send(ctx, anthropic.Request{
		Model:     e.model(),
		System:    experienceCardSystem,
		MaxTokens: cardMaxTokens,
		Messages:  []anthropic.Message{{Role: "user", Content: src.Content}},
	})
	if err != nil {
		return fmt.Errorf("derive card: %w", err)
	}
	text := strings.TrimSpace(resp.Text())
	if text == "" {
		return fmt.Errorf("derive card: empty output")
	}
	return e.DB.PutOutreachBlock("EXPERIENCE_CARD", text, want)
}

// --- stage 5: hook selector ----------------------------------------------

type hookOutput struct {
	Decision string `json:"decision"`
	Hook     struct {
		Quote     string `json:"quote"`
		SourceURL string `json:"source_url"`
		Thread    string `json:"thread"`
	} `json:"hook"`
	CloserMode string `json:"closer_mode"`
	Reasoning  string `json:"reasoning"`
}

// selectHook runs the Hook selector over the researcher JSON + HOOK_RULES +
// EXPERIENCE_CARD. It returns the cleaned JSON (for the row) and the parsed
// decision (to branch on).
func (e *Engine) selectHook(ctx context.Context, research string) (string, hookOutput, error) {
	user := fmt.Sprintf(`Researched hook candidates (JSON):
%s

HOOK_RULES:
%s

EXPERIENCE_CARD:
%s`, research, e.blockContent("HOOK_RULES"), e.blockContent("EXPERIENCE_CARD"))

	raw, err := e.callJSON(ctx, hookSelectorSystem, user, stageMaxTokens, nil)
	if err != nil {
		return "", hookOutput{}, err
	}
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		return "", hookOutput{}, fmt.Errorf("parse hook JSON: %w (raw=%q)", perr, trunc(raw, 200))
	}
	var out hookOutput
	if err := json.Unmarshal([]byte(cleaned), &out); err != nil {
		return "", hookOutput{}, fmt.Errorf("decode hook JSON: %w", err)
	}
	if out.Decision != "hook" && out.Decision != "no_honest_hook" {
		return "", hookOutput{}, fmt.Errorf("hook selector returned unknown decision %q", out.Decision)
	}
	return cleaned, out, nil
}

// --- stage 7: drafter ----------------------------------------------------

type draftOutput struct {
	P1 string `json:"p1"`
	P3 string `json:"p3"`
}

// draft runs the Drafter over the hook-selector output + role + CLOSER_RULES +
// VOICE_RULES + (optional) BANK_ROWS. violationNote, when non-empty, is the
// honesty-retry feedback appended to the input.
func (e *Engine) draft(ctx context.Context, hookJSON, role string, hook hookOutput, violationNote string) (draftOutput, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "Hook selector output (JSON):\n%s\n\n", hookJSON)
	fmt.Fprintf(&b, "Role title: %s\n\n", role)
	fmt.Fprintf(&b, "CLOSER_RULES:\n%s\n\n", e.blockContent("CLOSER_RULES"))
	fmt.Fprintf(&b, "VOICE_RULES:\n%s\n", e.blockContent("VOICE_RULES"))
	if bank := e.blockContent("BANK_ROWS"); bank != "" {
		fmt.Fprintf(&b, "\nWriting-bank exemplars (match their voice):\n%s\n", bank)
	}
	if violationNote != "" {
		fmt.Fprintf(&b, "\nA reviewer flagged these claims — fix them without inventing anything:\n%s\n", violationNote)
	}

	raw, err := e.callJSON(ctx, drafterSystem, b.String(), stageMaxTokens, nil)
	if err != nil {
		return draftOutput{}, err
	}
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		return draftOutput{}, fmt.Errorf("parse drafter JSON: %w (raw=%q)", perr, trunc(raw, 200))
	}
	var out draftOutput
	if err := json.Unmarshal([]byte(cleaned), &out); err != nil {
		return draftOutput{}, fmt.Errorf("decode drafter JSON: %w", err)
	}
	if strings.TrimSpace(out.P1) == "" || strings.TrimSpace(out.P3) == "" {
		return draftOutput{}, fmt.Errorf("drafter returned an empty paragraph")
	}
	return out, nil
}

// --- stage 9: humanizer --------------------------------------------------

// humanize runs the optional HUMANIZER cleanup pass. It is skipped when the
// block is absent. If the revision drops P2_LOCKED verbatim (the humanizer
// mangled the locked paragraph), the pre-humanizer text is kept.
func (e *Engine) humanize(ctx context.Context, email, p2 string) string {
	prompt := e.blockContent("HUMANIZER")
	if prompt == "" {
		return email
	}
	var b strings.Builder
	b.WriteString("Email to clean up:\n")
	b.WriteString(email)
	if findings := Lint(email, p2); len(findings) > 0 {
		b.WriteString("\n\nLint flagged these — fix them:\n")
		for _, f := range findings {
			fmt.Fprintf(&b, "- %s\n", f.Message)
		}
	}
	if bank := e.blockContent("BANK_ROWS"); bank != "" {
		b.WriteString("\nVoice sample (match this voice):\n")
		b.WriteString(trunc(bank, 2000))
	}
	b.WriteString("\n\nReturn the full revised email text only.")

	resp, err := e.Client.Send(ctx, anthropic.Request{
		Model:     e.model(),
		System:    prompt,
		MaxTokens: stageMaxTokens,
		Messages:  []anthropic.Message{{Role: "user", Content: b.String()}},
	})
	if err != nil {
		e.log("outreach: humanizer call failed, keeping pre-humanizer text: %v", err)
		return email
	}
	revised := strings.TrimSpace(resp.Text())
	if revised == "" {
		return email
	}
	// If the humanizer dropped the locked paragraph, discard its output.
	if p2 != "" && !strings.Contains(revised, p2) {
		e.log("outreach: humanizer mangled P2_LOCKED — discarding its revision")
		return email
	}
	return revised
}

// --- stage 10: honesty checker -------------------------------------------

type honestyViolation struct {
	Claim string `json:"claim"`
	Why   string `json:"why"`
}

// honestyCheck runs the Honesty checker over PAST_EXPERIENCE_FULL + the final
// email. It is isolated — it sees only the experience doc and the email, never
// the intended hook.
func (e *Engine) honestyCheck(ctx context.Context, email string) (string, []honestyViolation, error) {
	user := fmt.Sprintf(`Experience document:
%s

Email to verify:
%s`, e.blockContent("PAST_EXPERIENCE_FULL"), email)

	raw, err := e.callJSON(ctx, honestyCheckerSystem, user, stageMaxTokens, nil)
	if err != nil {
		return "", nil, err
	}
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		return "", nil, fmt.Errorf("parse honesty JSON: %w (raw=%q)", perr, trunc(raw, 200))
	}
	var out struct {
		Verdict    string             `json:"verdict"`
		Violations []honestyViolation `json:"violations"`
	}
	if err := json.Unmarshal([]byte(cleaned), &out); err != nil {
		return "", nil, fmt.Errorf("decode honesty JSON: %w", err)
	}
	if out.Verdict != "pass" && out.Verdict != "fail" {
		return "", nil, fmt.Errorf("honesty checker returned unknown verdict %q", out.Verdict)
	}
	return out.Verdict, out.Violations, nil
}

// --- shared LLM call with one JSON retry ---------------------------------

// callJSON sends a request and returns the text output, retrying once with a
// "Return ONLY the JSON object." nudge when the first output has no JSON object.
// tools is passed through (the researcher uses web_search; the rest pass nil).
func (e *Engine) callJSON(ctx context.Context, system, user string, maxTokens int, tools []any) (string, error) {
	send := func(msgs []anthropic.Message) (string, error) {
		// The hosted web_search server tool runs a server-side loop; at its
		// iteration cap the API returns stop_reason "pause_turn" mid-turn.
		// Resume by replaying the assistant content verbatim and re-sending —
		// no extra user message — accumulating text until the turn completes.
		var text strings.Builder
		for cont := 0; ; cont++ {
			resp, err := e.Client.Send(ctx, anthropic.Request{
				Model:     e.model(),
				System:    system,
				MaxTokens: maxTokens,
				Messages:  msgs,
				Cached:    true,
				Tools:     tools,
			})
			if err != nil {
				return "", err
			}
			text.WriteString(resp.Text())
			if resp.StopReason != "pause_turn" {
				return text.String(), nil
			}
			if cont >= maxContinuations {
				e.log("outreach: server tool loop still paused after %d continuations, using partial output", cont)
				return text.String(), nil
			}
			e.log("outreach: server tool loop paused, continuing (%d)", cont+1)
			msgs = append(msgs, anthropic.Message{Role: "assistant", Content: resp.RawContent()})
		}
	}

	msgs := []anthropic.Message{{Role: "user", Content: user}}
	raw, err := send(msgs)
	if err != nil {
		return "", err
	}
	if _, perr := extractJSONObject(raw); perr == nil {
		return raw, nil
	}
	// Retry once: append the bad answer + a strict instruction.
	e.log("outreach: stage output had no JSON object, retrying once")
	msgs = append(msgs,
		anthropic.Message{Role: "assistant", Content: raw},
		anthropic.Message{Role: "user", Content: "Return ONLY the JSON object, no prose, no markdown fences."},
	)
	raw, err = send(msgs)
	if err != nil {
		return "", err
	}
	if _, perr := extractJSONObject(raw); perr != nil {
		return "", fmt.Errorf("no JSON object after retry: %w", perr)
	}
	return raw, nil
}

// --- assembly + parsing helpers ------------------------------------------

// assembleEmail builds the final email in code: subject line, greeting, P1,
// P2_LOCKED, P3. The recipient name stays a placeholder (contact-finding is the
// user's job). The subject is the first "Subject: ..." line, then a blank line,
// then the body — stored as one draft text field.
func assembleEmail(p1, p2, p3, role string) string {
	subject := "Subject: [Name] | Alex intro"
	if r := strings.TrimSpace(role); r != "" {
		subject += " — " + r
	}
	parts := []string{"Hi [Name],", strings.TrimSpace(p1)}
	if strings.TrimSpace(p2) != "" {
		parts = append(parts, strings.TrimSpace(p2))
	}
	parts = append(parts, strings.TrimSpace(p3))
	body := strings.Join(parts, "\n\n")
	return subject + "\n\n" + body
}

// placeholderTokens are the company/role placeholders the mass-send template may
// use; replaced in code so the no-hook route needs no model.
var (
	reCompanyToken = regexp.MustCompile(`(?i)\[company\]|\{\{\s*company\s*\}\}|\{company\}`)
	reRoleToken    = regexp.MustCompile(`(?i)\[role\]|\{\{\s*role\s*\}\}|\{role\}`)
)

// fillTemplate substitutes the company (and role, when present) placeholders.
func fillTemplate(tmpl, company, role string) string {
	out := reCompanyToken.ReplaceAllString(tmpl, company)
	if strings.TrimSpace(role) != "" {
		out = reRoleToken.ReplaceAllString(out, role)
	}
	return out
}

// lintJSON lints text against p2 and returns the findings as a JSON array
// (always an array, never null, so the panel renders [] cleanly).
func lintJSON(text, p2 string) string {
	findings := Lint(text, p2)
	if findings == nil {
		findings = []LintFinding{}
	}
	b, _ := json.Marshal(findings)
	return string(b)
}

// formatViolations renders honesty violations as the drafter-retry feedback.
func formatViolations(vs []honestyViolation) string {
	var b strings.Builder
	for _, v := range vs {
		fmt.Fprintf(&b, "- %s (%s)\n", v.Claim, v.Why)
	}
	return strings.TrimSpace(b.String())
}

// reJSONObject matches the outermost {...} — the stages return flat objects, so
// the first-to-last brace is the object (tolerant of fences and surrounding
// prose, like the capture/verdict parsers).
var reJSONObject = regexp.MustCompile(`(?s)\{.*\}`)

// extractJSONObject returns the JSON object embedded in s (after stripping
// fences/prose) when it parses, else an error. Used both to clean stage outputs
// and as the "is this valid JSON yet?" gate in callJSON.
func extractJSONObject(s string) (string, error) {
	s = strings.TrimSpace(s)
	candidates := []string{}
	if m := reJSONObject.FindString(s); m != "" {
		candidates = append(candidates, m)
	}
	candidates = append(candidates, s)
	for _, cand := range candidates {
		var probe any
		if err := json.Unmarshal([]byte(cand), &probe); err == nil {
			if _, isObj := probe.(map[string]any); isObj {
				return cand, nil
			}
		}
	}
	return "", fmt.Errorf("no JSON object found")
}
