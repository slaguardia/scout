// Application-question detection: a posting link → the free-text essay
// questions on its application form. Mirrors ats.go's structure — dispatch on
// the recognized ATS target, resolve through the platform's API, normalize.
//
// Two no-LLM platform resolvers (Greenhouse's official ?questions=true, Ashby's
// unofficial GraphQL applicationForm) cover the bulk; everything else falls to a
// single Haiku pass over the page text, or honestly reports "unsupported".
// Status is always load-bearing — detection never returns silently empty.
package capture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"strings"

	"github.com/slaguardia/scout/internal/anthropic"
	"github.com/slaguardia/scout/internal/enrich"
	"github.com/slaguardia/scout/internal/store"
)

// Detection statuses. ok: questions found. none: a readable form with no essay
// questions. unsupported: a platform we can't read (SPA/off-site) — apply on
// the site. unreachable: the form API/page couldn't be fetched. Never empty.
const (
	QuestionsOK          = "ok"
	QuestionsNone        = "none"
	QuestionsUnsupported = "unsupported"
	QuestionsUnreachable = "unreachable"
)

// questionPageRunes bounds the page text handed to the LLM fallback. Larger
// than the capture extractor's window: application forms list their questions
// further down the page than a posting states its title.
const questionPageRunes = 9000

// AppQuestion is one free-text essay question on an application form.
type AppQuestion struct {
	Prompt    string `json:"prompt"`               // the question text shown to the applicant
	Key       string `json:"key,omitempty"`        // ATS field id/path; "" when unknown
	MaxLength int    `json:"max_length,omitempty"` // declared char limit; 0 = unknown
}

// QuestionScan is the result of detecting a posting's application questions.
// Status is load-bearing for honest UI (see the status consts); Source names
// the resolver that answered ("greenhouse" | "ashby" | "html-llm" | "").
type QuestionScan struct {
	Questions []AppQuestion `json:"questions"`
	Status    string        `json:"status"`
	Source    string        `json:"source"`
}

// DetectQuestions resolves a posting link's essay questions through the
// platform's API — no LLM, no page fetch beyond the API call. Recognized ATS
// hosts (greenhouse, ashby, rippling) resolve; any other link returns "unsupported", so
// the caller can decide whether to try the HTML+LLM fallback. It dispatches on
// the same atsTarget that ats.go's capture resolvers use.
func DetectQuestions(ctx context.Context, httpc *http.Client, rawURL string) QuestionScan {
	t := atsTargetFor(rawURL)
	if t == nil {
		return QuestionScan{Status: QuestionsUnsupported}
	}
	switch t.ats {
	case "greenhouse":
		return detectGreenhouseQuestions(ctx, httpc, t.base, t.org, t.id)
	case "ashby":
		return detectAshbyQuestions(ctx, httpc, t.org, t.id)
	case "rippling":
		return detectRipplingQuestions(ctx, httpc, t.base, t.org, t.id)
	default:
		// Lever surfaces no public application-form API — treat it like any
		// other unread platform; the user applies on the site.
		return QuestionScan{Status: QuestionsUnsupported}
	}
}

// ResolveQuestions is the full detection a Capturer runs: the no-LLM ATS path
// first, then — only for unsupported (non-ATS) hosts, and only when an LLM key
// is configured — the HTML+LLM fallback. The capture flow, the re-detect
// endpoint, and the `scout questions detect` CLI all go through here.
func (c *Capturer) ResolveQuestions(ctx context.Context, rawURL string) QuestionScan {
	httpc := c.HTTP
	if httpc == nil {
		httpc = enrich.NewHTTPClient(0)
	}
	scan := DetectQuestions(ctx, httpc, rawURL)
	if scan.Status != QuestionsUnsupported {
		return scan // an ATS resolver answered (ok/none/unreachable)
	}
	// Non-ATS host. The HTML+LLM fallback needs the model; without a key the
	// honest answer stays "unsupported" (apply on the site).
	if c.Client == nil || !c.Client.HasKey() {
		return scan
	}
	return c.detectQuestionsLLM(ctx, httpc, rawURL)
}

// DetectAndStoreQuestions resolves a posting's application questions and records
// them — the idempotent upsert (insert new, leave existing answers untouched)
// plus the posting's questions_status. It returns the scan so callers can report
// the outcome. The re-detect endpoint and the `scout questions detect` CLI use
// it; a sql.ErrNoRows error means the posting id is unknown.
func (c *Capturer) DetectAndStoreQuestions(ctx context.Context, postingID, rawURL string) (QuestionScan, error) {
	scan := c.ResolveQuestions(ctx, rawURL)
	dqs := make([]store.DetectedQuestion, 0, len(scan.Questions))
	for _, q := range scan.Questions {
		dqs = append(dqs, store.DetectedQuestion{Key: q.Key, Prompt: q.Prompt, MaxLength: q.MaxLength})
	}
	if err := c.DB.UpsertDetectedQuestions(postingID, dqs, scan.Status); err != nil {
		return scan, err
	}
	return scan, nil
}

// detectAndStore is the capture-flow wrapper: capture has already succeeded, so
// a detection failure is swallowed (the stored questions_status carries the
// outcome) and must never surface as a capture error.
func (c *Capturer) detectAndStore(ctx context.Context, postingID, rawURL string) {
	_, _ = c.DetectAndStoreQuestions(ctx, postingID, rawURL)
}

// --- Greenhouse (official) ---------------------------------------------------

// detectGreenhouseQuestions reads the board's ?questions=true form. The endpoint
// returns the whole application form — identity, EEO (in separate top-level
// keys), and essay questions — so the work is filtering to the content-bearing
// free-text fields. Verified shape (2026-06-08): each questions[] entry has a
// label, required flag, and fields[] of {name, type}; essays are `textarea`.
func detectGreenhouseQuestions(ctx context.Context, httpc *http.Client, apiBase, org, jobID string) QuestionScan {
	var payload struct {
		Questions []struct {
			Label  string `json:"label"`
			Fields []struct {
				Name string `json:"name"`
				Type string `json:"type"`
			} `json:"fields"`
		} `json:"questions"`
	}
	url := apiBase + "/v1/boards/" + neturl.PathEscape(org) + "/jobs/" + neturl.PathEscape(jobID) + "?questions=true"
	if err := fetchATSJSON(ctx, httpc, url, &payload); err != nil {
		return QuestionScan{Status: QuestionsUnreachable, Source: "greenhouse"}
	}

	var qs []AppQuestion
	for _, q := range payload.Questions {
		types := make([]string, len(q.Fields))
		for i, f := range q.Fields {
			types[i] = f.Type
		}
		if !greenhouseIsEssay(q.Label, types) {
			continue
		}
		// Key off the textarea field's stable name (e.g. question_4722758008,
		// cover_letter_text) so re-detection dedupes even if the label is edited.
		key := ""
		for _, f := range q.Fields {
			if f.Type == "textarea" && f.Name != "" {
				key = f.Name
				break
			}
		}
		if p := cleanPrompt(q.Label); p != "" {
			qs = append(qs, AppQuestion{Prompt: p, Key: key}) // Greenhouse exposes no length cap
		}
	}
	return scanFrom(qs, "greenhouse")
}

// greenhouseIsEssay keeps only content-bearing free-text fields: a textarea
// (essays and the standalone Cover Letter), or a question-like input_text. The
// identity/URL labels (name/email/phone/resume/linkedin/website) are dropped
// even when they carry a textarea (Resume/CV pastes into one).
func greenhouseIsEssay(label string, fieldTypes []string) bool {
	if isIdentityLabel(label) {
		return false
	}
	hasTextarea, hasInputText := false, false
	for _, t := range fieldTypes {
		switch t {
		case "textarea":
			hasTextarea = true
		case "input_text":
			hasInputText = true
		}
	}
	if hasTextarea {
		return true
	}
	return hasInputText && looksLikeQuestion(label)
}

// --- Ashby (unofficial GraphQL) ----------------------------------------------

// ashbyGraphQLBase is the apply-page GraphQL host (NOT the posting-api host in
// ats.go). A test seam.
var ashbyGraphQLBase = "https://jobs.ashbyhq.com"

// ashbyApplicationFormQuery is the application-form query, captured from a live
// Ashby apply page on 2026-06-08 (introspection is disabled; this is
// reverse-engineered and unofficial — treat its breakage as expected, not
// exceptional). `field` is a JSON! scalar, so it carries no sub-selection and
// is decoded as raw JSON. EEO/demographic fields live under a separate
// surveyForms node, deliberately not queried here.
const ashbyApplicationFormQuery = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id
    title
    applicationForm {
      fieldEntries {
        field
        isRequired
      }
    }
  }
}`

// detectAshbyQuestions resolves the application form through Ashby's
// non-user-graphql endpoint. Ashby is a SPA, so HTML scraping yields nothing
// and this endpoint is the only path — it carries ~40% of coverage, so any
// schema drift (null jobPosting/applicationForm, GraphQL errors, an
// unrecognized shape) degrades to "unsupported" rather than crashing capture.
func detectAshbyQuestions(ctx context.Context, httpc *http.Client, org, jobID string) QuestionScan {
	reqBody, _ := json.Marshal(map[string]any{
		"operationName": "ApiJobPosting",
		"variables": map[string]string{
			"organizationHostedJobsPageName": org,
			"jobPostingId":                   jobID,
		},
		"query": ashbyApplicationFormQuery,
	})

	var resp struct {
		Data struct {
			JobPosting *struct {
				ApplicationForm *struct {
					FieldEntries []struct {
						Field      json.RawMessage `json:"field"`
						IsRequired bool            `json:"isRequired"`
					} `json:"fieldEntries"`
				} `json:"applicationForm"`
			} `json:"jobPosting"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := postATSGraphQL(ctx, httpc, ashbyGraphQLBase+"/api/non-user-graphql", reqBody, &resp); err != nil {
		return QuestionScan{Status: QuestionsUnreachable, Source: "ashby"}
	}
	if len(resp.Errors) > 0 || resp.Data.JobPosting == nil || resp.Data.JobPosting.ApplicationForm == nil {
		return QuestionScan{Status: QuestionsUnsupported, Source: "ashby"}
	}

	var qs []AppQuestion
	for _, e := range resp.Data.JobPosting.ApplicationForm.FieldEntries {
		var f struct {
			Path  string `json:"path"`
			Title string `json:"title"`
			Type  string `json:"type"`
		}
		if json.Unmarshal(e.Field, &f) != nil {
			continue
		}
		// LongText is Ashby's only multi-line free-text type (identity is
		// String/Email/File, choices are *Select); _systemfield_ paths are
		// name/email/resume — belt-and-suspenders since they're never LongText.
		if f.Type != "LongText" || strings.HasPrefix(f.Path, "_systemfield_") {
			continue
		}
		if p := cleanPrompt(f.Title); p != "" {
			qs = append(qs, AppQuestion{Prompt: p, Key: f.Path}) // Ashby exposes no length cap
		}
	}
	return scanFrom(qs, "ashby")
}

// --- Rippling (public board API) ---------------------------------------------

// detectRipplingQuestions reads the application form off the same per-posting
// board endpoint ats.go's resolver uses — activeJobApplication.customQuestions
// carries the form fields. Rippling has no dedicated long-answer field type:
// everything is SHORT_ANSWER (identity AND custom questions alike), with
// PHONE_NUMBER / FILE / PRONOUN for the structured fields. So an essay question
// is a SHORT_ANSWER whose title reads like a real question and isn't identity —
// the same shape as Greenhouse's input_text branch. (A future long-form type is
// admitted up front, in case Rippling adds one.) A null activeJobApplication or
// empty form degrades to none/unsupported, never a crash.
func detectRipplingQuestions(ctx context.Context, httpc *http.Client, apiBase, org, jobID string) QuestionScan {
	var payload struct {
		ActiveJobApplication *struct {
			CustomQuestions *struct {
				Fields []struct {
					Title     string `json:"title"`
					FieldType string `json:"fieldType"`
					OID       string `json:"oid"`
				} `json:"fields"`
			} `json:"customQuestions"`
		} `json:"activeJobApplication"`
	}
	url := apiBase + "/platform/api/ats/v1/board/" + neturl.PathEscape(org) + "/jobs/" + neturl.PathEscape(jobID)
	if err := fetchATSJSON(ctx, httpc, url, &payload); err != nil {
		return QuestionScan{Status: QuestionsUnreachable, Source: "rippling"}
	}
	if payload.ActiveJobApplication == nil || payload.ActiveJobApplication.CustomQuestions == nil {
		// No application form attached — apply on the site.
		return QuestionScan{Status: QuestionsUnsupported, Source: "rippling"}
	}

	var qs []AppQuestion
	for _, f := range payload.ActiveJobApplication.CustomQuestions.Fields {
		if !ripplingIsEssay(f.FieldType, f.Title) {
			continue
		}
		if p := cleanPrompt(f.Title); p != "" {
			qs = append(qs, AppQuestion{Prompt: p, Key: f.OID}) // Rippling exposes no length cap
		}
	}
	return scanFrom(qs, "rippling")
}

// ripplingIsEssay keeps only content-bearing free-text questions. Structured
// types (FILE, PRONOUN, PHONE_NUMBER) and identity labels are never essays; a
// SHORT_ANSWER counts only when its title actually reads like a question (so
// "First name" / "Current company" / "Location (city only)" drop while "Why do
// you want to join?" stays). A long-form type, should one appear, is admitted
// on type alone (still minus identity).
func ripplingIsEssay(fieldType, title string) bool {
	if isIdentityLabel(title) {
		return false
	}
	ft := strings.ToUpper(fieldType)
	switch ft {
	case "FILE", "PRONOUN", "PHONE_NUMBER":
		return false
	}
	if strings.Contains(ft, "PARAGRAPH") || strings.Contains(ft, "LONG") ||
		strings.Contains(ft, "ESSAY") || strings.Contains(ft, "MULTILINE") {
		return true
	}
	if ft == "SHORT_ANSWER" {
		return looksLikeQuestion(title)
	}
	return false
}

// --- HTML + LLM fallback -----------------------------------------------------

// detectQuestionsLLM fetches the page and runs one Haiku pass to pull essay
// questions out of server-rendered application forms (careers pages, Recruitee,
// workatastartup, …). Same honesty as capture: a fetch failure reports its
// status and stores nothing; the model is best-effort and never invents.
func (c *Capturer) detectQuestionsLLM(ctx context.Context, httpc *http.Client, rawURL string) QuestionScan {
	text, _, status := enrich.FetchPage(ctx, httpc, rawURL, questionPageRunes)
	if status != "ok" && status != "low_content" {
		return QuestionScan{Status: status, Source: "html-llm"}
	}
	model := c.Model
	if model == "" {
		model = anthropic.DefaultModel
	}
	callCtx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	resp, err := c.Client.Send(callCtx, anthropic.Request{
		Model:     model,
		System:    questionsContract,
		MaxTokens: llmMaxTokens,
		Messages:  []anthropic.Message{{Role: "user", Content: "Application page text (truncated):\n" + text + "\n\nReturn the JSON now."}},
	})
	if err != nil {
		return QuestionScan{Status: QuestionsUnreachable, Source: "html-llm"}
	}
	qs, ok := parseQuestionsJSON(resp.Text())
	if !ok {
		// The model returned nothing parseable — honest "unsupported", not a
		// fabricated empty "none".
		return QuestionScan{Status: QuestionsUnsupported, Source: "html-llm"}
	}
	return scanFrom(qs, "html-llm")
}

// questionsContract is the LLM fallback's system prompt — the JSON contract plus
// the include/exclude rules. Fixed in code, like the capture extractor's.
const questionsContract = `You are Scout's application-form question detector. You are given the visible text of a job application page. Extract ONLY the free-text essay / short-answer questions the applicant must write prose answers to.

INCLUDE: open-ended written questions ("Why do you want to work here?", "Describe a project you're proud of", "What interests you about this role?"), and a standalone "Cover letter" free-text field (use the prompt "Cover letter").
EXCLUDE: name, email, phone, address; links (LinkedIn / website / GitHub / portfolio); resume / CV upload; yes/no and multiple-choice / dropdown questions; work-authorization and visa-sponsorship questions; and ALL demographic / EEO / diversity / gender / race / veteran / disability questions.

Reply ONLY with valid JSON, no preamble, no markdown fences, exactly:
{"questions": [{"prompt": "<the exact question text>", "max_length": <integer character limit the page states, else 0>}]}

If the page shows no essay questions, or is not an application form, return {"questions": []}. Never invent a question that is not on the page.`

// parseQuestionsJSON pulls the {questions:[...]} object out of the model's text
// (tolerant of fences/prose, like parseExtraction) and normalizes each entry.
// ok is false only when no JSON object is present at all — an empty list is a
// valid "none" answer, distinct from an unparseable reply.
func parseQuestionsJSON(s string) (qs []AppQuestion, ok bool) {
	s = strings.TrimSpace(s)
	candidates := []string{s}
	if m := reJSONBlock.FindString(s); m != "" {
		candidates = append([]string{m}, candidates...)
	}
	for _, cand := range candidates {
		var out struct {
			Questions []struct {
				Prompt    string `json:"prompt"`
				MaxLength int    `json:"max_length"`
			} `json:"questions"`
		}
		if json.Unmarshal([]byte(cand), &out) != nil {
			continue
		}
		res := make([]AppQuestion, 0, len(out.Questions))
		for _, q := range out.Questions {
			if p := cleanPrompt(q.Prompt); p != "" {
				ml := q.MaxLength
				if ml < 0 {
					ml = 0
				}
				res = append(res, AppQuestion{Prompt: p, MaxLength: ml})
			}
		}
		return res, true
	}
	return nil, false
}

// --- shared helpers ----------------------------------------------------------

// scanFrom wraps a resolved question list with the right status: ok when any
// were found, none when the form was readable but carried no essays.
func scanFrom(qs []AppQuestion, source string) QuestionScan {
	status := QuestionsOK
	if len(qs) == 0 {
		status = QuestionsNone
	}
	return QuestionScan{Questions: qs, Status: status, Source: source}
}

// postATSGraphQL POSTs a GraphQL body and decodes the JSON reply — the Ashby
// counterpart of fetchATSJSON. Only Content-Type is required for a 200.
func postATSGraphQL(ctx context.Context, httpc *http.Client, url string, body []byte, v any) error {
	ctx, cancel := context.WithTimeout(ctx, atsCallTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("http %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, atsMaxBody)).Decode(v)
}

// cleanPrompt normalizes a question label: non-breaking spaces and whitespace
// runs collapse to single spaces (Ashby titles carry stray U+00A0), trimmed.
func cleanPrompt(s string) string {
	s = strings.ReplaceAll(s, " ", " ")
	return strings.Join(strings.Fields(s), " ")
}

// isIdentityLabel reports whether a form label is a standard identity / contact
// / link field to drop, never an essay question. Cover Letter is deliberately
// NOT here — a standalone cover-letter textarea counts as one essay question.
func isIdentityLabel(label string) bool {
	l := strings.ToLower(strings.TrimSpace(label))
	switch l {
	case "first name", "last name", "full name", "name", "preferred name",
		"email", "email address", "phone", "phone number", "mobile",
		"location", "current location", "city", "pronouns", "gender", "race",
		"ethnicity", "veteran status", "disability status":
		return true
	}
	// Substring matches catch the common variants (Resume/CV, LinkedIn Profile,
	// Personal Website, GitHub URL, Portfolio link, Curriculum Vitae).
	for _, s := range []string{"resume", "linkedin", "github", "website", "portfolio", "curriculum vitae"} {
		if strings.Contains(l, s) {
			return true
		}
	}
	// "cv" only as a standalone token, so "CV", "CV File", and "Resume / CV"
	// drop while a word that merely contains those letters does not.
	for _, w := range strings.Fields(l) {
		if w == "cv" {
			return true
		}
	}
	return false
}

// looksLikeQuestion reports whether an input_text label reads like a real
// open-ended question (so a short-answer text field still counts as an essay).
func looksLikeQuestion(label string) bool {
	l := strings.ToLower(strings.TrimSpace(label))
	if strings.HasSuffix(l, "?") {
		return true
	}
	for _, kw := range []string{"why ", "describe", "tell us", "tell me", "what ", "how ", "share ", "explain", "would you", "your experience", "in your own words"} {
		if strings.Contains(l, kw) {
			return true
		}
	}
	return false
}
