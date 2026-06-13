package outreach

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/store"
)

// Application-answer generation reuses the outreach Engine wholesale — the
// Anthropic client, the cached context blocks, and (critically) the honesty
// checker. These answers are claims made straight to a recruiter, so the
// "never invent experience" rule matters even more than in cold email: every
// answer is routed through the same honesty gate the email drafter uses.
// See docs/pipeline.md (`scout questions`).

const (
	// answersTimeout bounds one posting's whole question fan-out.
	answersTimeout = 8 * time.Minute
	// answerMaxTokens covers one essay answer (a few hundred words).
	answerMaxTokens = 1200
	// answerConcurrency bounds the per-posting fan-out; each question is an
	// independent Sonnet call + honesty check.
	answerConcurrency = 3
)

// Generate satisfies web.AnswersRunner: it drafts answers for all of a
// posting's pending questions in a goroutine and returns immediately (the panel
// polls each row). Fire-and-forget, exactly like outreach Draft.
func (e *Engine) Generate(postingID string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), answersTimeout)
		defer cancel()
		if err := e.GenerateAnswers(ctx, postingID); err != nil {
			e.log("answers: posting %s: %v", postingID, err)
		}
	}()
}

// GenerateAnswers drafts every pending (status `generating`) answer for a
// posting, synchronously — the CLI entry point. It loads the shared context
// once (JD, company-fit brief, experience card, voice), then fans out one
// Sonnet call + honesty check per question with bounded concurrency. Each
// answer is independent: one failure never blocks the rest, and every row ends
// in a terminal status (ready / needs_review / failed), never stuck generating.
func (e *Engine) GenerateAnswers(ctx context.Context, postingID string) error {
	pending, err := e.DB.MarkAnswersGenerating(postingID)
	if err != nil {
		return fmt.Errorf("mark generating: %w", err)
	}
	if len(pending) == 0 {
		return nil // nothing unanswered
	}
	e.log("answers: posting %s — %d question(s) to draft", postingID, len(pending))

	posting, err := e.DB.GetPosting(postingID)
	if err != nil {
		return e.failAnswers(pending, fmt.Errorf("load posting: %w", err))
	}
	if posting == nil {
		return e.failAnswers(pending, fmt.Errorf("posting %s not found", postingID))
	}

	// The experience bundle is required — it is the honesty ground truth and the
	// only facts an answer may claim. Empty fails every answer loud, not silent.
	exp, err := e.requireExperience()
	if err != nil {
		return e.failAnswers(pending, err)
	}

	ac := e.answerContext(ctx, posting, exp)

	sem := make(chan struct{}, answerConcurrency)
	var wg sync.WaitGroup
	for _, a := range pending {
		a := a
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			answer, status, reason := e.draftAnswer(ctx, ac, a)
			if err := e.DB.UpdateAnswer(a.ID, answer, status, reason); err != nil {
				e.log("answers: save %d: %v", a.ID, err)
				// Never strand the row in `generating` — best-effort flip to
				// failed so it reaches a terminal status now (ReapStuckAnswers is
				// only the restart-time backstop, and a stuck row would otherwise
				// be re-drafted on every later Generate).
				if status != store.AnswerFailed {
					_ = e.DB.UpdateAnswer(a.ID, "", store.AnswerFailed, "save failed: "+err.Error())
				}
			}
		}()
	}
	wg.Wait()
	return nil
}

// answerContext is the shared per-posting grounding, gathered once.
type answerContext struct {
	role       string
	jd         string
	brief      string
	experience string
	voice      string
}

// answerContext assembles the JD (stored description, or a live fetch like the
// drafter), the brain company-fit brief (optional — degrades to none), the
// experience bundle (the honesty ground truth), and the voice bundle.
func (e *Engine) answerContext(ctx context.Context, posting *store.Posting, exp string) answerContext {
	jd := trunc(posting.Description, jdMaxChars)
	if strings.TrimSpace(jd) == "" {
		jd = FetchJD(ctx, e.HTTP, posting.URL).Text
	}
	brief := ""
	if e.Brief != nil {
		if b, err := e.Brief(ctx); err != nil {
			e.log("answers: company-fit brief unavailable, drafting without it: %v", err)
		} else {
			brief = strings.TrimSpace(b)
		}
	}
	return answerContext{
		role:       strings.TrimSpace(posting.Title),
		jd:         jd,
		brief:      brief,
		experience: exp,
		voice:      e.knowledge("voice"),
	}
}

// draftAnswer drafts one answer and routes it through the honesty checker,
// retrying once with the violations fed back. A second honesty failure keeps
// the answer but flags it needs_review rather than shipping a possibly-inflated
// claim silently. A draft or checker error fails the row.
func (e *Engine) draftAnswer(ctx context.Context, ac answerContext, a store.PostingAnswer) (answer, status, reason string) {
	var violationNote string
	for attempt := 0; attempt < 2; attempt++ {
		text, err := e.answerCall(ctx, ac, a, violationNote)
		if err != nil {
			return "", store.AnswerFailed, "draft: " + err.Error()
		}
		verdict, violations, err := e.honestyCheckText(ctx, ac.experience, text)
		if err != nil {
			return "", store.AnswerFailed, "honesty check: " + err.Error()
		}
		if verdict == "pass" {
			return text, store.AnswerReady, ""
		}
		if attempt == 0 {
			violationNote = formatViolations(violations)
			continue
		}
		vj, _ := json.Marshal(violations)
		return text, store.AnswerNeedsReview, "honesty check flagged claims: " + string(vj)
	}
	return "", store.AnswerFailed, "unreachable"
}

// answerCall is the single prose Sonnet call for one question. Output is plain
// text (not JSON), so it sends directly rather than through callJSON.
func (e *Engine) answerCall(ctx context.Context, ac answerContext, a store.PostingAnswer, violationNote string) (string, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "Application question:\n%s\n\n", a.Prompt)
	if ac.role != "" {
		fmt.Fprintf(&b, "Role: %s\n\n", ac.role)
	}
	if ac.jd != "" {
		fmt.Fprintf(&b, "Job description:\n%s\n\n", trunc(ac.jd, jdMaxChars))
	}
	if ac.brief != "" {
		fmt.Fprintf(&b, "Company-fit brief (the applicant's own values — use ONLY to make \"why this company\" specific and true, never to invent fit):\n%s\n\n", ac.brief)
	}
	fmt.Fprintf(&b, "Applicant experience (the ONLY facts you may claim):\n%s\n\n", ac.experience)
	if ac.voice != "" {
		fmt.Fprintf(&b, "Voice rules (write like this):\n%s\n\n", ac.voice)
	}
	b.WriteString(answerLengthGuide(a.MaxLength))
	if violationNote != "" {
		fmt.Fprintf(&b, "\n\nA reviewer flagged these claims in your last draft — fix them without inventing anything:\n%s", violationNote)
	}

	resp, err := e.Client.Send(ctx, anthropic.Request{
		Model:     e.model(),
		System:    answerSystem,
		MaxTokens: answerMaxTokens,
		Messages:  []anthropic.Message{{Role: "user", Content: b.String()}},
	})
	if err != nil {
		return "", err
	}
	text := strings.TrimSpace(resp.Text())
	if text == "" {
		return "", fmt.Errorf("empty answer")
	}
	return text, nil
}

// failAnswers marks every pending row failed with the shared reason — used when
// a precondition (missing block, missing posting) dooms the whole batch.
func (e *Engine) failAnswers(pending []store.PostingAnswer, err error) error {
	for _, a := range pending {
		_ = e.DB.UpdateAnswer(a.ID, "", store.AnswerFailed, err.Error())
	}
	return err
}

// answerLengthGuide honors a declared char limit, else targets a tight length.
func answerLengthGuide(maxLen int) string {
	if maxLen > 0 {
		return fmt.Sprintf("Length: keep the answer under %d characters.", maxLen)
	}
	return "Length: a tight 120-180 words."
}

// answerSystem is the application-answer drafter's system prompt. It leans on
// the honesty rule harder than the email drafter: an answer is a direct claim
// to a recruiter, so a thinner true answer beats an impressive invented one.
const answerSystem = `You write one applicant's answer to a single job-application essay question, in the applicant's own voice. The applicant is applying for this role; you are filling in their application.

Ground every factual claim in the provided experience card — roles, skills, scope, durations, domains. NEVER invent or inflate experience the card does not support: an honesty reviewer will reject anything beyond it, and a false claim to a recruiter is worse than a thinner answer. The company-fit brief is the applicant's OWN values — use it only to make "why this company" specific and true, never to claim a fit you cannot back up.

Answer the question directly and specifically. Plain spoken English, concrete over abstract. No flattery, no filler, no "I am passionate about", no "I am excited to", no superlative you cannot earn with a specific fact. Do not restate the question. Write ONLY the answer text — no preamble, no salutation, no sign-off.`
