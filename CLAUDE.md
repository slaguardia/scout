# scout — Claude instructions

You're working in **scout**, the user's personal **job-fit scorer**. Portfolio
project and a real tool they use — both audiences matter.

## Architecture — read this first

**[`docs/north-star.md`](./docs/north-star.md) is canonical.** The one-line
model: the **brain** owns the knowledge (who the user is, what they want, their
rules); **scout** brings the intelligence (its own LLM + a `playbook.md` for
*how* to judge). Scout reads the user's criteria from the brain (read-only) and
reasons over them; verdicts stay scout-local and are never written back to the
brain. There is **no scout-local "taste"** — `taste.md` is an offline fallback
only; `taste.toml` is a purely mechanical pre-filter.

Then [`docs/`](./docs/) for stage references (pipeline, verdict, enrichment,
data-model, operations, limitations).

## Stack

Go · SQLite (`modernc.org/sqlite`, pure-Go, no CGO) · BurntSushi/toml ·
Anthropic Messages API (direct HTTP, no SDK) · the brain over HTTP/JSON.

## Dev servers

The user's long-running dev servers (Go API on `:8765`, Vite on `:5173`) live in
[`mprocs.yaml`](./mprocs.yaml) and run in a single `mprocs` TUI window. **Those
canonical ports belong to the user — never bind them.** If the app just needs to
be up, ask the user to start `mprocs` or restart a pane.

When you need to *test* against a running server, start your own freely — but
always on a **non-default `--addr` and `--db`** (e.g. `scout serve --addr :8807
--db /tmp/scout-test.db`) so you never collide with the user's mprocs window.
Kill it when you're done; a global `Stop` hook
(`~/.claude/hooks/reap-test-servers.py`) reaps any test server you forget,
sparing anything on the canonical ports or running under `mprocs`. Binding a
canonical port defeats that safety net — don't.

## Posture

- Direct, blunt when useful. No hedging, no pep talks.
- Recommend with the tradeoff, in 2–3 sentences, on exploratory questions.
- Push back if you see something off. Silence is the failure mode.
- Never invent experience or capability for the user.
- Prefer deleting dead content over leaving deprecation notices.

## Current state

- **Built:** the pipeline (ingest → filter → enrich → verdict → triage) and the
  full web control surface — run everything from the browser (CSV upload, live
  progress, run history), plus a brain-isolated playbook editor.
- **Jobs view + the Add dialog:** the UI has a companies | jobs tab; one
  **Add…** dialog covers both — toggle company|job, paste the link (the only
  required field), optionally type what you know, and tick **fill in the
  blanks** to run the agent pass. Ticked → `POST /api/capture`: a posting link
  on a supported ATS (ashby/greenhouse/lever) resolves through the platform's
  public JSON API — exact title, location, department, employment/workplace
  type, published comp range, posted date, full description, **no LLM**
  (`internal/capture/ats.go`); any other link gets the one-shot Haiku pass
  (`internal/capture`). Either way the dialog's kind pin overrides the
  classifier and typed fields win over extraction. Unticked → plain
  writes with no fetch/LLM: `POST /api/companies` (manual add, 409 on dup) or
  `POST /api/postings` (company resolved from the typed name and/or the link's
  host; ATS link naming neither → 400). Postings land in `job_postings`
  (title, location, summary, plus the ATS-resolved details — posted_at,
  employment/workplace type, department, comp_range, description; idempotent
  by URL), unknown companies are created
  via `ingest.EnsureCompany` (source `capture`; ATS/job-board hosts rejected
  as identities), and a captured company page seeds the enrichment row from
  the fetched text. Unfetchable pages report their honest fetch status and
  write nothing.
- **The jobs view is the application tracker** (replaced the user's Notion
  tracker): a lean table — company name + applied date, response
  (screening/interview/offer/rejected), outreach count, last outreach, and
  contacts (free-form emails, rendered as mailto links) — with everything else
  in the slide-in panel, where each posting card has the tracking controls
  (`PUT /api/postings/{id}`). "Hide rejected" is on by default.
- **Brain-first, done:** the brain is now a pgvector **document substrate**
  (graphiti is gone) — a librarian whose only consumer call is `GET /recall?q=&k=`,
  returning prose chunks `{heading, text, score, path}` (no polarity/strength
  tags). Scout's **distiller** (`internal/distill`) fans out a few company-fit
  recalls, dedups, then runs a two-step pass — classify each excerpt as COMPANY
  vs ROLE_OR_OTHER (quarantines role/career leak), then synthesize a
  **company-fit brief** (Hard dealbreakers / Strong preferences / Context, in
  prose) from the COMPANY items — on `--distill-model` (default Sonnet; verdict
  scoring stays on Haiku). The verdict engine reasons over that brief. The brief is cached locally in SQLite
  (table `brain_profile_cache`, freshness via `--brain-cache-ttl`, manual
  re-distill from the UI's Criteria panel); `taste.md` is the offline fallback
  when the brain is unreachable and the cache is gone. The consumer surface is
  `recall` + `doc` + `map` (amended 2026-06-04): `GET /doc?id=` fetches whole
  documents verbatim by stable page id, `GET /map` is the discovery surface;
  `/profile` stays owner-only and scout never passes a `scope`. Distillation is
  **companies only** — role/title fit is a separate, later concern. `scout
  distill` prints the chunks + brief for tuning. Verdicts stay scout-local —
  never written to the brain. Default brain URL is `http://127.0.0.1:8100`. See
  `brainbot/plans/scout-migration.md` for the migration spec.
- **Outreach pipeline, built (not yet live):** `docs/outreach-agent.md` is the
  spec. Context **blocks** (P2 paragraph, hook/closer/voice rules, experience
  doc, humanizer prompt) are bound by scout-side **pins** to brain page ids
  (or `file:` paths), fetched whole via `/doc` at sync time, cached versioned
  in SQLite; `P2_LOCKED` is user-declared (`scout outreach set`, declaration =
  approval); locked blocks halt loud on upstream drift, 404s on pinned sources
  go loud. The **engine** (`internal/outreach`, all Sonnet): JD from the
  posting's stored description (capture writes it; survives posting takedown),
  live Go pre-fetch (ATS JSON APIs) as fallback → researcher (hosted
  `web_search`, pause_turn-aware) →
  hook selector (integrity gate) → drafter (P1/P3 only; P2 + sign-off
  assembled in code) → lint → humanizer → lint → honesty checker (one retry).
  `no_honest_hook` = **don't email** (no draft, no fallback template) — a
  success path. Body-scoped deterministic lint. The jobs panel is the review
  queue (draft cards by status, edit/re-lint, mark-sent bumps tracking);
  fire-and-forget with a row badge. CLI: `scout outreach map | pin | set |
  blocks | draft`. Engine wires into serve when `ANTHROPIC_API_KEY` is set.
  Notion guidance pages (refactored 2026-06-06) are not yet ingested into the
  brain, so no blocks are pinned yet — that's the go-live gate.
- **Application answers, built:** `docs/application-answers.md` is the spec; it
  reuses the outreach engine. **Detection** runs at capture time
  (`internal/capture/questions.go`) via per-platform resolvers — Greenhouse
  `?questions=true` (official) and Ashby `applicationForm` over the unofficial
  `non-user-graphql` endpoint (fail-soft to `unsupported` on schema drift),
  plus a Haiku HTML fallback for the server-rendered tail; identity / EEO /
  file / choice fields are filtered out and essays kept, with a load-bearing
  `questions_status` (ok|none|unsupported|unreachable). **Generation** is on a
  button (`Engine.GenerateAnswers`, Sonnet): per question it assembles JD +
  company-fit brief + experience card + voice, drafts once, then routes through
  the same outreach **honesty checker** (a false claim to a recruiter is worse
  than a thin answer); a second honesty fail keeps the answer flagged
  `needs_review` rather than shipping it. One row per question
  (`posting_answers`, M32), independently editable/regenerable via the pursuit
  panel's "Application" section (inline auto-save, per-question Regenerate,
  "Draft answers" / "Re-detect"). Endpoints mirror outreach
  (`GET/POST /api/postings/{id}/answers`, `…/redetect`, `PUT /api/answers/{id}`),
  gated on the `PAST_EXPERIENCE_FULL` block + `ANTHROPIC_API_KEY`. CLI: `scout
  questions detect --posting <id> | --all`. **Scout never submits** — it drafts;
  the user copy-pastes into the ATS.

## What's next

**Outreach go-live:** ingest the Notion guidance pages into the brain (Cold
email, Voice & style, Past Experience), pin the blocks, `scout outreach set`
the P2 paragraph (body only — the sign-off is assembled in code) and the
humanizer prompt, then run the first real draft via `scout outreach draft
--posting <id>`. Pinning `PAST_EXPERIENCE_FULL` in that pass also unblocks
**application-answer generation** (it shares that gate). Also still pending: a
real **Crunchbase CSV run** end-to-end
(verify ingest column aliases against the real header first). The web UI is
the primary interface; the CLI is the secondary automation/debug surface.
`north-star.md` is the canonical architecture.

**Platform migration (FEAT-20260607_155517-3c84), done:** scout's web delivery has been re-homed from `go:embed index.html` to a toolkit-built PWA — the UI is now a Vite + vanilla-TS app in `web/` consuming `@brainbot/web-toolkit`, built to `internal/web/dist/` and still `go:embed`-ed into the one Go binary (US-003). Go `/api/*` + local SQLite unchanged; `GET /api/me` reads the edge identity. The shared Caddy/SSO edge config is authored + verified (US-004) and lives on brainbot branch `feat/scout-edge`; it applies when the stack is deployed (separate ops). See [brainbot/docs/app-platform.md](../brainbot/docs/app-platform.md).
