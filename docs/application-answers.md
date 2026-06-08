# Application Answers — system design (for Scout)

Status: **built** (2026-06-08). Reuses the outreach engine wholesale
(`internal/outreach`) — see [`outreach-agent.md`](./outreach-agent.md). Code:
detection in `internal/capture/questions.go`, generation in
`internal/outreach/answers.go`, storage in `internal/store/posting_answers.go`
(migration M32), HTTP in `internal/web/answers.go`, the pursuit panel's
"Application" section, and CLI `scout questions detect`.

## Goal

Many application forms ask free-text essay questions ("Why are you interested in
this role?", "What draws you to <company>?", "Describe a relevant project").
Scout already holds the JD, the brain's company-fit brief, and the user's
experience blocks — everything needed to draft grounded answers.

- **Detect** the essay questions on a posting's application form.
- **Generate** a draft answer per question, grounded and honesty-checked.
- **Store + edit** answers per-question on the posting, in the pursuit panel.

**Scout never auto-submits.** It detects and drafts; the user copy-pastes into
the ATS. No form auth, no captcha solving, no headless submission. This is a
~2-minutes-per-application drafting aid, not an auto-applier.

## Trigger split

Detection is cheap (a JSON call, or one Haiku pass); generation is the expensive
LLM work. So they fire on different events:

- **Detection runs at capture time** — when a posting is captured/re-captured,
  scout resolves its application questions and stores them with a status.
- **Generation runs on a button** — "Draft answers" in the pursuit panel. The
  user controls when LLM spend happens, exactly like outreach drafts.
- **Generation detects-if-missing** — if a posting has no questions row yet (e.g.
  it predates this feature, or was a manual add), the button runs detection
  first, then generates. This is the re-run path (see "Re-running on existing
  jobs").

## Detection — per-platform resolvers

Mirrors `internal/capture/ats.go`'s structure: a dispatch on host →
platform-specific resolver → normalized result. New file
`internal/capture/questions.go`.

```go
type AppQuestion struct {
    Prompt    string // the question text shown to the applicant
    Key       string // ATS field id/path when available (for stable dedupe)
    MaxLength int    // char limit when the ATS declares one; 0 = unknown
}

type QuestionScan struct {
    Questions []AppQuestion
    Status    string // "ok" | "none" | "unsupported" | fetch-status string
    Source    string // "greenhouse" | "ashby" | "html-llm" | ...
}

func DetectQuestions(ctx, httpc, rawURL) QuestionScan
```

`Status` is load-bearing for honest UI: `ok` (N found), `none` (form has no
essay questions), `unsupported` (platform we can't read — LinkedIn/SPAs),
or a fetch-error status (page unreachable). Never silently empty.

### What counts as an essay question

Keep only **free-text, content-bearing** fields. Drop everything else:

- Drop identity: first/last name, email, phone, resume/CV, cover-letter *file*.
- Drop EEO / demographic / compliance / location-consent blocks.
- Keep long free-text: `textarea`, and `input_text` whose prompt is a real
  question (heuristic: ends in `?`, or matches why/describe/tell-us/what/how).
- A standalone "Cover Letter" textarea counts as a question (prompt =
  "Cover letter").

### Resolvers, prioritized by the user's actual data

Distribution in the live DB (2026-06-08, 25 postings): Ashby 40%, Greenhouse
16%, then a long tail of careers-page/Recruitee, workatastartup, Rippling,
LinkedIn, gem, kula, dover.

| Platform | Share | Source | Reliability |
|---|---|---|---|
| **Greenhouse** | 16% | `GET …/v1/boards/{org}/jobs/{id}?questions=true` → `questions[]` (filter free-text) | Solid, official. Verified returns full form incl. `textarea` fields. |
| **Ashby** | 40% | `applicationForm` via `jobs.ashbyhq.com/api/non-user-graphql` (op `ApiJobPosting`) | **Fragile** — unofficial endpoint, introspection disabled, schema reverse-engineered from the live apply page. Ashby is a SPA so HTML scraping yields nothing; this endpoint is the only path. Carries 40% of coverage; isolate it and fail soft. |
| Server-rendered tail (Recruitee/careers-page, workatastartup, gem, kula) | ~24% | Fetch page → one Haiku extraction pass → `AppQuestion[]` | Best-effort. Reuses the capture LLM path. |
| Rippling, Dover | ~12% | SPAs; need per-platform JSON. Return `unsupported` until one matters. | Deferred. |
| LinkedIn | 8% | Applications live off-site / hostile to scraping. Return `unsupported`. | Honest no-op. |

The Greenhouse and Ashby org/id parsing already exists in `atsTargetFor`
(`ats.go:74`) — reuse it; `DetectQuestions` dispatches on the same target.

### Greenhouse detail (verified)

`?questions=true` returns a `questions[]` where each entry has `label`,
`required`, and `fields[]` with `type` (`input_text`, `textarea`, `input_file`,
…). Filter to `textarea` + question-like `input_text`, drop the standard
identity/EEO labels. `MaxLength` is not exposed by Greenhouse → 0.

### Ashby detail (to reverse-engineer at build time)

The form is reachable at the GraphQL endpoint behind `applicationForm` on
`JobPostingDetails`. Exact sub-schema must be captured from browser devtools on a
real Ashby apply page (introspection is disabled). **Pin the query string as a
constant with a comment dating the capture**, and wrap parsing so a schema change
degrades to `Status: "unsupported"` rather than crashing capture. This is the one
piece carrying a maintenance risk; treat its breakage as expected, not
exceptional.

### HTML+LLM fallback

For server-rendered tail platforms with no JSON API: fetch the page (reuse the
capture HTTP client + fetch-status handling from `capture.go`), pass the visible
text to a single Haiku call returning `{questions: [{prompt, max_length}]}`. Same
honesty as capture: typed/structured wins, LLM is best-effort, fetch failures
report honestly and store nothing.

## Generation — reuse the outreach engine

New file `internal/outreach/answers.go`; a method on the existing `Engine` so it
shares the Anthropic client, blocks, and honesty checker.

Per question, one Sonnet call assembling the same context the drafter uses:

- **JD** — `posting.Description` (stored at capture); live `FetchJD` fallback
  when empty, identical to outreach (`engine.go`).
- **Company fit** — the brain company-fit brief from the distiller
  (`internal/distill`), same brief the verdict engine reasons over.
- **Experience** — the `EXPERIENCE_CARD` block (`internal/outreach` blocks).
- **Voice** — `VOICE_RULES` block, so answers sound like the user.
- **Constraint** — respect `AppQuestion.MaxLength` when set; otherwise target a
  tight 120–180 words.

Then **route every answer through the existing honesty checker** (the stage that
sees `PAST_EXPERIENCE_FULL`). These answers are claims made directly to a
recruiter — the "never invent experience or capability" rule (CLAUDE.md posture)
matters more here than in cold email. An answer that fails honesty is regenerated
once, then stored with a `needs_review` flag rather than silently shipped.

Generation is per-posting fan-out over its questions (bounded concurrency), each
answer independent so one failure doesn't block the rest. Status transitions
mirror outreach: `generating → ready` (or `needs_review` / `failed`).

## Storage

New table, one row per question (independently editable/regenerable), modeled on
`outreach_drafts`. Migration `internal/store/migrations/0032_posting_answers.sql`:

```sql
CREATE TABLE IF NOT EXISTS posting_answers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    posting_id  TEXT NOT NULL REFERENCES job_postings(id),
    q_key       TEXT,                       -- ATS field id/path; "" when unknown
    prompt      TEXT NOT NULL,              -- the question text
    max_length  INTEGER DEFAULT 0,
    answer      TEXT DEFAULT '',            -- generated answer
    edited      TEXT DEFAULT '',            -- user edit; wins when non-empty
    status      TEXT DEFAULT 'detected',    -- detected|generating|ready|needs_review|failed
    fail_reason TEXT DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(posting_id, q_key, prompt)       -- idempotent re-detection
);
```

Also add to `job_postings` a detection summary so the table/panel can show state
without joining: migration adds `questions_status TEXT` and `questions_at
DATETIME` (mirrors the `fetch_status`/`captured_at` pattern from
`0022_posting_capture.sql`).

Store methods in `internal/store/posting_answers.go`:

- `UpsertDetectedQuestions(postingID, []AppQuestion, status)` — idempotent on
  `UNIQUE(posting_id, q_key, prompt)`; inserts new questions, leaves existing
  answers/edits untouched, sets `questions_status`/`questions_at` on the posting.
- `ListAnswers(postingID) []PostingAnswer`
- `UpdateAnswer(id, answer, status, failReason)` — generation writes results.
- `EditAnswer(id, edited)` — inline UI save.
- `RegenerateAnswer(id)` — clears for a single-question re-run.

The `UNIQUE` + "leave existing untouched" upsert is what makes re-detection safe:
re-running on a posting adds newly-found questions and never clobbers answers the
user already edited.

## Web / API

Mirror the outreach endpoints (`internal/web/outreach.go`), async via a runner
interface like `OutreachRunner`:

- `GET  /api/postings/{id}/answers` → `{answers: [...], questions_status}`.
- `POST /api/postings/{id}/answers` → detect-if-missing, then start generation
  for all unanswered questions; `202` + rows. Fire-and-forget via an
  `AnswersRunner.Generate(postingID)` (wired only when `ANTHROPIC_API_KEY` set,
  same gate as outreach).
- `POST /api/postings/{id}/answers/redetect` → force re-detection (re-runs the
  resolver, upserts). The manual re-run hook for existing jobs.
- `PUT  /api/answers/{id}` → `{edited}` inline save; `{regenerate:true}` to
  re-run one question.

Detection-at-capture: call `DetectQuestions` inside the capture flow
(`capture.go` `Run`/`runATS`, after `UpsertCapturedPosting`) and
`UpsertDetectedQuestions`. Failures here are non-fatal — capture still succeeds;
`questions_status` records why.

## UI — pursuit panel

New "Application" section in `renderPursuit()` (`web/src/app.ts`), below outreach:

- **Header** reflects `questions_status`: "3 questions found", "No essay
  questions", "Couldn't read this form (apply on site)", or "Not detected yet".
- **Per question**: the prompt, an inline auto-save answer `textarea` (reuse
  `wireInlineField()` — Linear-style, save on blur/Enter, revert on Esc), a char
  count vs `max_length`, status pill, and a per-question **Regenerate** button.
  Edited text wins and shows an "edited" marker (mirrors outreach `edited`).
- **Footer button**: "Draft answers" (generate all) / "Re-detect questions".
  Gated/spinnered like the outreach draft button while `generating`.

## Re-running on existing jobs

Three independent ways a posting (re)acquires questions — none requires a
backfill migration:

1. **At next capture** — re-capturing any posting refreshes its questions
   (idempotent upsert).
2. **On generate** — the "Draft answers" button detects-if-missing first, so the
   17 existing description-less rows get questions on first use.
3. **Explicit re-detect** — `POST …/answers/redetect` (UI: "Re-detect
   questions") forces a fresh resolver run, e.g. after the Ashby query string is
   updated post-schema-drift.

Optional CLI for bulk backfill / debugging, matching the `scout outreach`
surface: `scout questions detect --posting <id>` and `scout questions detect
--all` (iterate postings, run `DetectQuestions`, upsert; print a per-host summary
so coverage gaps are visible, not silent).

## Delegation & parallelization

This feature is built by an agent that should **delegate to subagents where it
pays off** — fan out independent work, keep cross-cutting decisions on the main
thread.

- **Serial / same-file:** the Greenhouse and Ashby resolvers both live in
  `internal/capture/questions.go` — implement them in sequence, never in parallel
  (concurrent subagents would clobber the file). The capture wiring and the
  honesty-checker integration are cross-cutting — keep them on the main thread.
- **Parallel fan-out (worktree-isolated):** the storage layer and the *research*
  for the Ashby endpoint can start together. Once the API surface lands, the
  pursuit-panel UI (`web/src/app.ts`) and the CLI (`cmd/scout/main.go`) touch
  disjoint files — run them as two concurrent subagents, isolated with worktrees
  since both build the binary/bundle.
- **Research subagents (return findings, not file dumps):** capture the exact
  Ashby `applicationForm` GraphQL query + a sample response shape from a live
  apply page; grab a real Greenhouse `?questions=true` JSON fixture for the
  detection test.
- **Review subagents (adversarial):** after generation lands, probe the honesty
  gate with prompts engineered to make the model invent experience — confirm
  they're caught. After detection, confirm identity/EEO/file fields are reliably
  excluded.
- **Don't over-delegate:** the migration + store methods are one tight unit — do
  them directly rather than farming out. Delegation has overhead; spend it where
  the parallelism or the independent context is real.

## Build order

1. `posting_answers` table + `questions_status` columns + store methods (M32).
2. `DetectQuestions` with the Greenhouse resolver (verified, official) + HTML/LLM
   fallback. Ship + smoke on real Greenhouse rows.
3. Ashby resolver — reverse-engineer the `applicationForm` query, isolate, fail
   soft. Covers the 40%.
4. Wire detection into capture; add the `GET/POST/redetect` endpoints + runner.
5. Generation (`Engine` method) reusing JD + brief + blocks + honesty checker.
6. Pursuit-panel "Application" section with inline-save answers.
7. `scout questions detect` CLI + `--all` backfill.

## Open risks

- **Ashby endpoint fragility** (40% of coverage on an unofficial API). Mitigated
  by fail-soft parsing + the re-detect path; accept periodic query-string
  maintenance.
- **Cover-letter vs essay ambiguity** — a long "Cover letter" field is treated as
  one essay question; fine, but don't also separately draft a full cover letter.
- **Honesty under pressure** — generation must refuse to invent. Reuse, don't
  reimplement, the outreach honesty checker.
