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
	"github.com/slaguardia/scout/internal/brainbot"
	"github.com/slaguardia/scout/internal/store"
)

// Engine runs the outreach draft pipeline for one draft row. It implements
// web.OutreachRunner: Draft fires async (the panel polls the row), Run is the
// synchronous CLI entry point. Every terminal path writes a final status — a
// row must never be left stuck in `researching`.
//
// The pipeline is: research the company (web) → fill the user's email template's
// holes in one LLM call (using the cached brain knowledge bundle) →
// honesty-check the filled holes against the user's experience → humanize →
// review queue. At the start of every run the engine first syncs the knowledge
// bundle from the brain (ensureKnowledge — a cheap change-aware check, no manual
// Refresh button), then reads the local cache (template + outreach_sources) for
// the rest of the run.
type Engine struct {
	DB     *store.DB
	Client *anthropic.Client
	Model  string // research + fill + honesty + judge; empty → anthropic.DefaultModel
	Log    func(string)

	// HTTP is the client for the deterministic JD pre-fetch. Optional; a nil
	// value uses a default with a sane timeout.
	HTTP *http.Client

	// Brainbot keeps the outreach knowledge cache in sync with the brain at the
	// start of every run (change-aware auto-sync — see ensureKnowledge). Optional:
	// nil/disabled means the engine serves whatever knowledge is already cached.
	Brainbot *brainbot.Client
	// DiscoverModel is the cheap model for the knowledge-discovery pass; empty →
	// anthropic.DefaultModel (Haiku).
	DiscoverModel string

	// Brief produces the brain's company-fit brief (the same brief the verdict
	// engine reasons over) for application-answer generation. Optional: nil or an
	// error degrades generation to no company-fit grounding.
	Brief func(context.Context) (string, error)
}

const (
	// draftTimeout bounds one full pipeline run (research + fill + honesty +
	// judge + possible retry). Generous: the hosted web_search researcher can
	// take a few minutes on its own.
	draftTimeout = 12 * time.Minute
	// researcherMaxTokens covers the structured-facts JSON (hooks + the
	// thesis/implication/signals read). Headroom so the final JSON isn't
	// truncated after a multi-search transcript (a truncated object fails to parse).
	researcherMaxTokens = 5000
	// stageMaxTokens covers the smaller per-stage JSON outputs (fill, honesty,
	// judge).
	stageMaxTokens = 2000
	// maxContinuations bounds pause_turn resumes of the hosted web_search
	// server-side loop (per stage call); past it the partial output is used.
	maxContinuations = 4
	// webSearchMaxUses caps the researcher's hosted searches per run. Kept modest:
	// more searches bloat the transcript, slow the run, and crowd out the final
	// JSON (which then fails to parse). A handful is enough for good hooks.
	webSearchMaxUses = 5
)

func (e *Engine) log(format string, args ...any) {
	if e.Log != nil {
		e.Log(fmt.Sprintf(format, args...))
	}
}

// Pipeline stage markers, persisted on the in-flight draft for the panel's
// progress bar. The order here is the order the run advances through them.
const (
	stageResearch = "research"
	stageFill     = "fill"
	stageHumanize = "humanize"
	stageHonesty  = "honesty"
)

// setStage advances the draft's progress marker. Best-effort: a failed write is
// logged but never aborts the run (the marker is cosmetic, the result write is
// what matters).
func (e *Engine) setStage(draftID int64, stage string) {
	if err := e.DB.SetOutreachDraftStage(draftID, stage); err != nil {
		e.log("outreach: draft %d set stage %s: %v", draftID, stage, err)
	}
}

func (e *Engine) model() string {
	if e.Model != "" {
		return e.Model
	}
	return anthropic.DefaultModel
}

// knowledge returns the cached whole-fetched bundle for a need (experience /
// voice), or "" when discovery has resolved no source for it.
func (e *Engine) knowledge(need string) string {
	s, err := e.DB.OutreachKnowledge(need)
	if err != nil {
		e.log("outreach: load %s knowledge: %v", need, err)
		return ""
	}
	return strings.TrimSpace(s)
}

// requireExperience returns the experience bundle, erroring loud when it is
// empty. Experience is the honesty checker's ground truth, so an empty bundle
// must block drafting — never silently draft (or "verify") against nothing.
func (e *Engine) requireExperience() (string, error) {
	if exp := e.knowledge("experience"); exp != "" {
		return exp, nil
	}
	return "", fmt.Errorf("no experience page found in your brain — add one; scout syncs it automatically")
}

// ensureKnowledge auto-syncs the outreach knowledge cache from the brain before
// a run reads it (see EnsureKnowledge). Best-effort: a sync failure is logged
// and the run proceeds against the last-good cache, with the hard-experience
// gate (requireExperience) still enforcing an empty bundle.
func (e *Engine) ensureKnowledge(ctx context.Context) {
	if err := EnsureKnowledge(ctx, e.Brainbot, e.Client, e.DB, e.DiscoverModel, func(s string) { e.log("%s", s) }); err != nil {
		e.log("outreach: ensure knowledge: %v", err)
	}
}

// Draft satisfies web.OutreachRunner: it runs the pipeline in a goroutine with
// its own background context + timeout, and returns immediately. The panel sees
// progress by polling the draft row. skipResearch skips the web-research stage
// for this one draft (the writer works from the role + experience alone).
func (e *Engine) Draft(draftID int64, skipResearch bool) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), draftTimeout)
		defer cancel()
		if err := e.Run(ctx, draftID, skipResearch); err != nil {
			e.log("outreach: draft %d failed: %v", draftID, err)
		}
	}()
}

// Run executes the whole pipeline synchronously. It always leaves the draft in
// a terminal-or-review status: a deferred catch-all flips a still-`researching`
// row to `failed` on any early return or panic, so a crash never strands a row.
func (e *Engine) Run(ctx context.Context, draftID int64, skipResearch bool) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic: %v", r)
		}
		if err == nil {
			return
		}
		if d, gErr := e.DB.GetOutreachDraft(draftID); gErr == nil && d != nil && d.Status == store.DraftResearching {
			_ = e.DB.SetOutreachDraftResult(draftID, store.DraftFailed,
				d.Research, d.Hook, d.Draft, d.Lint, d.Violations, d.Critique, err.Error())
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

	// Sync the knowledge bundle from the brain (change-aware, cheap when nothing
	// moved), then load the template (DB, or compiled-in default) + the bundle up
	// front so a malformed template fails before spending the research call.
	e.ensureKnowledge(ctx)
	tmpl, err := ParseTemplate(TemplateOrDefault(e.DB))
	if err != nil {
		return err // already a clear "template: ..." message
	}
	exp, err := e.requireExperience()
	if err != nil {
		return err
	}
	voice := e.knowledge("voice") // soft

	// 1. Research. A regenerate carries the prior draft's research forward (copied
	// at create time), so we re-draft against the same web data instead of paying
	// for another search — the point of a regen is usually to re-run the writing.
	research := strings.TrimSpace(d.Research)
	if research != "" {
		e.log("outreach: draft %d — reusing carried-over research (%d chars), skipping web search", draftID, len(research))
	} else {
		// The job description (no model). The capture pass stores the full
		// description for ATS-resolved postings — using it keeps drafts working
		// after the posting is taken down and skips a network round-trip.
		jd := JDResult{Text: trunc(posting.Description, jdMaxChars), Status: "stored at capture"}
		if strings.TrimSpace(posting.Description) == "" {
			jd = FetchJD(ctx, e.HTTP, posting.URL)
		}
		e.log("outreach: draft %d JD: %s (%d chars)", draftID, jd.Status, len(jd.Text))

		// web_search. Skippable — globally (the stage toggle) or per-draft
		// (skipResearch, the panel's "skip research" box): the writer then works
		// from the JD + experience alone (weaker hooks, but no crash).
		e.setStage(draftID, stageResearch)
		research = `{"note":"researcher skipped — no web research"}`
		if e.stageEnabled("researcher") && !skipResearch {
			r, rErr := e.research(ctx, company, posting.URL, jd)
			if rErr != nil {
				return fmt.Errorf("researcher: %w", rErr)
			}
			research = r
		}
		if err := e.DB.SetOutreachDraftResult(draftID, store.DraftResearching,
			research, "", "", "", "", "", ""); err != nil {
			return fmt.Errorf("save research: %w", err)
		}
	}

	// 2-5. Fill the template's holes → honesty-check the filled spans → judge
	// against the depth bar → queue. Each stage reads its (editable) system
	// prompt from e.stagePrompt at call time.
	return e.fillRoute(ctx, draftID, research, tmpl, company, role, exp, voice)
}

// fillRoute fills the template's holes in one call, honesty-checks the filled
// spans against the experience bundle, judges the assembled email against the
// doctrine's depth bar, and retries the fill once with the combined feedback
// fed back. A no-send signal from the fill (no honest hook) is the refusal
// success path: no draft. A fully-static template (no holes) skips the
// fill+honesty+judge (its prose is the user's own, true by construction).
//
// Final dispositions: honest + deep → awaiting_review; honest + medium →
// needs_work (reviewable, flagged); honest + shallow → failed (below the depth
// bar); dishonest twice → failed (honesty check failed twice).
func (e *Engine) fillRoute(ctx context.Context, draftID int64, research string, tmpl *Template, company, role, exp, voice string) error {
	vars := map[string]string{"role": role, "company": company}
	holes := tmpl.Holes(vars)
	if len(holes) == 0 {
		email := tmpl.Render(vars, nil)
		return e.DB.SetOutreachDraftResult(draftID, store.DraftAwaitingReview, research, "", email, combinedLintJSON("", email), "", "", "")
	}

	var feedback string
	for attempt := 0; attempt < 2; attempt++ {
		e.setStage(draftID, stageFill)
		filled, noSend, err := e.fill(ctx, holes, research, exp, voice, feedback)
		if err != nil {
			return fmt.Errorf("fill: %w", err)
		}
		if noSend {
			// "If you can't write even one true sentence for a company, don't
			// email them." No draft, no fallback — a success path.
			e.log("outreach: draft %d no_send — nothing honest to say, recommend not emailing", draftID)
			return e.DB.SetOutreachDraftResult(draftID, store.DraftNoHook, research, "", "", "", "", "", "")
		}

		// De-AI cleanup over the model-written holes (verbatim prose untouched),
		// then the deterministic flags: voice on whatever the humanizer leaves
		// behind (LLM cleanup reintroduces patterns — the flag is the backstop),
		// word count on the rendered email.
		if e.stageEnabled("humanizer") {
			e.setStage(draftID, stageHumanize)
			filled = e.humanize(ctx, holes, filled, voice)
		}
		email := tmpl.Render(vars, filled)
		holesText := concatFilled(holes, filled)
		lint := combinedLintJSON(holesText, email)

		// Honesty check the FILLED HOLES (the LLM-authored spans — the verbatim
		// template prose is the user's own words, true by construction), then
		// judge the whole email against the depth bar. Integrity and quality are
		// separate verdicts; both feed the one retry. Either may be skipped: a
		// disabled honesty check passes by default, a disabled judge ships as
		// "deep" — the user opted out of that gate.
		verdict, honest := "pass", true
		var violations []honestyViolation
		if e.stageEnabled("honesty") {
			e.setStage(draftID, stageHonesty)
			var herr error
			verdict, violations, herr = e.honestyCheckText(ctx, exp, "", holesText)
			if herr != nil {
				return fmt.Errorf("honesty checker: %w", herr)
			}
			honest = verdict == "pass"
		}

		e.log("outreach: draft %d attempt %d — honesty %s", draftID, attempt+1, verdict)

		// The only gate is honesty: an honest draft ships to the review queue.
		// A dishonest draft gets the one shared retry; still dishonest → failed
		// so a false claim never reaches a recruiter.
		if honest {
			return e.DB.SetOutreachDraftResult(draftID, store.DraftAwaitingReview, research, "", email, lint, "", "", "")
		}
		if attempt == 0 {
			feedback = retryFeedback(violations)
			continue
		}
		violJSON, _ := json.Marshal(violations)
		return e.DB.SetOutreachDraftResult(draftID, store.DraftFailed,
			research, "", email, lint, string(violJSON), "", "honesty check failed twice")
	}
	return nil
}

// retryFeedback labels the honesty violations for the one retry fill.
func retryFeedback(violations []honestyViolation) string {
	if len(violations) == 0 {
		return ""
	}
	return "A reviewer flagged these claims in your last fill — fix them without inventing anything:\n" + formatViolations(violations)
}

// --- research ------------------------------------------------------------

// research runs the Researcher with the hosted web_search server tool and parses
// its structured-facts JSON. It gathers true, specific company facts — no sender
// identity framing (the fill step does the relevance threading).
func (e *Engine) research(ctx context.Context, company, jobURL string, jd JDResult) (string, error) {
	jdSection := jd.Text
	if jdSection == "" {
		jdSection = "JD fetch failed: " + jd.Status
	} else {
		jdSection = fmt.Sprintf("Pre-fetched job description (%s):\n%s", jd.Status, jd.Text)
	}
	user := fmt.Sprintf("Company: %s\nJob URL: %s\n\n%s", company, jobURL, jdSection)

	raw, err := e.callJSON(ctx, e.stagePrompt("researcher"), user, researcherMaxTokens, []any{anthropic.NewWebSearchTool(webSearchMaxUses)})
	if err != nil {
		return "", err
	}
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		return "", fmt.Errorf("parse research JSON: %w (raw=%q)", perr, trunc(raw, 200))
	}
	return cleaned, nil
}

// --- fill ----------------------------------------------------------------

// fill writes every template hole in one call, using the research + experience +
// voice, with the writing doctrine spliced into its system prompt. It returns
// the per-hole text, or noSend=true when a hole's instructions say to refuse
// and there is no honest basis. feedback, when set, is the pre-labeled retry
// feedback (honesty violations and/or the judge's rewrite instructions).
func (e *Engine) fill(ctx context.Context, holes []Hole, research, exp, voice, feedback string) (map[string]string, bool, error) {
	var b strings.Builder
	b.WriteString("HOLES to fill (name: instructions):\n")
	for _, h := range holes {
		fmt.Fprintf(&b, "- %s: %s\n", h.Name, h.Instr)
	}
	fmt.Fprintf(&b, "\nCOMPANY RESEARCH (JSON, true facts about the company plus the researcher's read):\n%s\n", research)
	fmt.Fprintf(&b, "\nMY EXPERIENCE (the ONLY facts you may claim about me):\n%s\n", exp)
	if voice != "" {
		fmt.Fprintf(&b, "\nMY VOICE (write the holes like this):\n%s\n", voice)
	}
	if feedback != "" {
		fmt.Fprintf(&b, "\nFEEDBACK on your last fill — address every point without inventing anything:\n%s\n", feedback)
	}

	raw, err := e.callJSON(ctx, e.stagePrompt("fill"), b.String(), stageMaxTokens, nil)
	if err != nil {
		return nil, false, err
	}
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		return nil, false, fmt.Errorf("parse fill JSON: %w (raw=%q)", perr, trunc(raw, 200))
	}
	var out struct {
		Fills  map[string]string `json:"fills"`
		NoSend bool              `json:"no_send"`
		Reason string            `json:"reason"`
	}
	if err := json.Unmarshal([]byte(cleaned), &out); err != nil {
		return nil, false, fmt.Errorf("decode fill JSON: %w", err)
	}
	if out.NoSend {
		e.log("outreach: fill declined: %s", out.Reason)
		return nil, true, nil
	}
	for _, h := range holes {
		if strings.TrimSpace(out.Fills[h.Name]) == "" {
			return nil, false, fmt.Errorf("fill left hole %q empty (and did not signal no_send)", h.Name)
		}
	}
	return out.Fills, false, nil
}

// concatFilled joins the filled holes in order — the text the honesty checker
// verifies (the LLM-authored spans only).
func concatFilled(holes []Hole, filled map[string]string) string {
	var b strings.Builder
	for _, h := range holes {
		if t := strings.TrimSpace(filled[h.Name]); t != "" {
			b.WriteString(t)
			b.WriteString("\n\n")
		}
	}
	return strings.TrimSpace(b.String())
}

// humanize runs the de-AI cleanup over the model-written holes, matching the
// user's voice and removing AI tells, WITHOUT touching the verbatim template
// prose (it only ever sees the holes). The model is stubborn about em dashes, so
// it runs the deterministic flag after each pass and retries ONCE with the exact
// leftovers fed back. Best-effort throughout: any error keeps the current text,
// so a flaky cleanup pass never loses the draft. The honesty checker runs after
// it, catching any fact drift.
func (e *Engine) humanize(ctx context.Context, holes []Hole, filled map[string]string, voice string) map[string]string {
	cur := filled
	var feedback string
	for attempt := 0; attempt < 2; attempt++ {
		next := e.humanizeOnce(ctx, holes, cur, voice, feedback)
		cur = next
		bad := VoiceFindings(concatFilled(holes, cur))
		if len(bad) == 0 {
			return cur
		}
		msgs := make([]string, len(bad))
		for i, f := range bad {
			msgs[i] = f.Message
		}
		feedback = "Your last pass still left: " + strings.Join(msgs, "; ") +
			". Fix each by REWRITING the sentence (especially: replace every em dash, do not just move it)."
		e.log("outreach: humanizer left voice issues, retrying: %s", strings.Join(msgs, "; "))
	}
	return cur // still flagged after the retry — the deterministic flag surfaces it
}

// humanizeOnce is a single cleanup pass. feedback, when set, names the exact
// leftovers from the prior pass. Returns the current text unchanged on any error.
func (e *Engine) humanizeOnce(ctx context.Context, holes []Hole, filled map[string]string, voice, feedback string) map[string]string {
	in := map[string]string{}
	for _, h := range holes {
		in[h.Name] = filled[h.Name]
	}
	inJSON, _ := json.Marshal(in)
	var b strings.Builder
	fmt.Fprintf(&b, "Paragraphs to clean (JSON):\n%s\n", inJSON)
	if voice != "" {
		fmt.Fprintf(&b, "\nVOICE rules:\n%s\n", voice)
	}
	if feedback != "" {
		fmt.Fprintf(&b, "\n%s\n", feedback)
	}
	raw, err := e.callJSON(ctx, e.stagePrompt("humanizer"), b.String(), stageMaxTokens, nil)
	if err != nil {
		e.log("outreach: humanizer failed, keeping current text: %v", err)
		return filled
	}
	cleaned, perr := extractJSONObject(raw)
	if perr != nil {
		e.log("outreach: humanizer output unparseable, keeping current text")
		return filled
	}
	var out map[string]string
	if err := json.Unmarshal([]byte(cleaned), &out); err != nil {
		return filled
	}
	result := map[string]string{}
	for _, h := range holes {
		if t := strings.TrimSpace(out[h.Name]); t != "" {
			result[h.Name] = t
		} else {
			result[h.Name] = filled[h.Name] // humanizer dropped it — keep current
		}
	}
	return result
}

// combinedLintJSON runs the deterministic flags — voice over the model-written
// holes text, word count over the rendered email — and returns the combined
// findings as a JSON array (never null, so the panel renders [] cleanly).
func combinedLintJSON(holesText, email string) string {
	f := VoiceFindings(holesText)
	f = append(f, LengthFindings(email)...)
	if f == nil {
		f = []LintFinding{}
	}
	b, _ := json.Marshal(f)
	return string(b)
}

// --- honesty -------------------------------------------------------------

type honestyViolation struct {
	Claim string `json:"claim"`
	Why   string `json:"why"`
}

// honestyCheckText verifies that `text` makes no claim beyond the documented
// ground truth: the experience bundle plus, when present, the logistics/profile
// bundle (biographical facts the answer path is allowed to state). It is
// isolated — it sees only those documents and the text, never the intended hook.
// Shared by the email fill path (logistics empty) and answer generation.
func (e *Engine) honestyCheckText(ctx context.Context, experience, logistics, text string) (string, []honestyViolation, error) {
	doc := experience
	if strings.TrimSpace(logistics) != "" {
		doc += "\n\n--- Applicant profile (biographical & logistics facts) ---\n" + logistics
	}
	user := fmt.Sprintf("Experience document:\n%s\n\nText to verify:\n%s", doc, text)
	raw, err := e.callJSON(ctx, e.stagePrompt("honesty"), user, stageMaxTokens, nil)
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

// formatViolations renders honesty violations as the retry feedback.
func formatViolations(vs []honestyViolation) string {
	var b strings.Builder
	for _, v := range vs {
		fmt.Fprintf(&b, "- %s (%s)\n", v.Claim, v.Why)
	}
	return strings.TrimSpace(b.String())
}

// --- shared LLM call with one JSON retry ---------------------------------

// callJSON sends a request and returns the text output, retrying once with a
// "Return ONLY the JSON object." nudge when the first output has no JSON object.
// tools is passed through (the researcher uses web_search; the rest pass nil).
func (e *Engine) callJSON(ctx context.Context, system, user string, maxTokens int, tools []any) (string, error) {
	send := func(msgs []anthropic.Message) (string, error) {
		// The hosted web_search server tool runs a server-side loop; at its
		// iteration cap the API returns stop_reason "pause_turn" mid-turn. Resume
		// by replaying the assistant content verbatim and re-sending.
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

// reJSONObject matches the outermost {...} — the stages return flat objects, so
// the first-to-last brace is the object (tolerant of fences and surrounding
// prose, like the capture/verdict parsers).
var reJSONObject = regexp.MustCompile(`(?s)\{.*\}`)

// extractJSONObject returns the JSON object embedded in s (after stripping
// fences/prose) when it parses, else an error.
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
