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
only; the **pre-filter** is a purely mechanical gate (location, headcount,
vertical, stage) that runs before the LLM verdict on a bulk run. Its rules live
in the DB as a singleton (`taste_filter`, with a master on/off switch), edited
from the dashboard (Criteria → "pre-filter"), with a compiled-in default in
`internal/filter/taste_default.toml` — there is no longer a `taste.toml` file.
It gates only which companies a **bulk** verdict run scores; it never deletes
data, hides rows, or gates ingest/enrich. Disable it (or run a targeted
per-company re-score, which bypasses it) to score everything.

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
- **Outreach pipeline — editable stage prompts + a mostly-fixed template (2026-06-13):**
  [`docs/pipeline.md`](./docs/pipeline.md) (`scout outreach`) is the reference.
  The pipeline is **four editable LLM stages — researcher · writer (fill) ·
  humanizer · honesty — each a system prompt fully editable from the dashboard**
  (Settings → *Outreach pipeline*). Each has a compiled default in
  `internal/outreach` (registry: `stages.go`); an override lives in the
  `prompt_overrides` table (`GET /api/outreach-prompts`, `GET/PUT
  /api/outreach-prompts/{stage}`), resolved at draft time by `Engine.stagePrompt`
  (Reset-to-default reverts). The JSON contract lives inside each default prompt,
  so a bad edit only fails that stage's drafts, never the binary. Every stage
  except the Writer can be toggled off/skipped (`Engine.stageEnabled`). **There
  is no judge and no "doctrine"** — both removed: the judge's depth-gating
  produced robotic, clever-sounding drafts (and dumped a critique report-card on
  the user), and the doctrine doc was superseded. The writing register is now
  **plain, warm, and specific** — cold-email replies are driven by
  specificity/relevance + brevity, not cleverness (evidence: the
  `cold-outreach-research` skill). The **email template** (DB singleton, localized
  per user) is **mostly the user's fixed prose** — verbatim background + closer —
  with the only generated holes a leashed **opener** (reference one real specific
  thing + a genuine reaction, else a plain intro) and a short **closer**
  (motivation + the ask); `{{role}}`/`{{company}}` substitute in. **Brain
  knowledge** (experience + voice + logistics) is *discovered* not pinned (`discover.go`:
  Haiku over `/map`, fetched via `/doc`, cached in `outreach_sources` (M35);
  fail-loud `ErrNoExperience`) and is the honesty checker's ground truth — a thin
  experience doc makes the writer confabulate, so the real lever is good source
  pages. The **engine** (Sonnet): JD pre-fetch → researcher (`web_search`, ranked
  *referenceable* hooks — never funding/taglines; a regenerate reuses the prior
  draft's research instead of re-searching) → fill (writes the holes; never
  invent / never manufacture a connection — honesty-checked) → humanize (cut
  generic/hollow + AI tells, keep genuine *specific* warmth) → **honesty check —
  the only gate** (vetoes any sender claim beyond the docs; honest → review
  queue, dishonest twice → failed). Verbatim template prose is true by
  construction. The jobs panel is the review queue (edit, mark-sent bumps
  tracking); fire-and-forget. CLI: `scout outreach sources [--refresh] | draft`.
  Spec'd but not built: a `draft-shorten` "too long → tighten" control
  (`plans/draft-shorten.md`).
- **Application answers, built:** [`docs/pipeline.md`](./docs/pipeline.md)
  (`scout questions`) is the reference; it reuses the outreach engine.
  **Detection** runs at capture time
  (`internal/capture/questions.go`) via per-platform resolvers — Greenhouse
  `?questions=true` (official) and Ashby `applicationForm` over the unofficial
  `non-user-graphql` endpoint (fail-soft to `unsupported` on schema drift),
  plus a Haiku HTML fallback for the server-rendered tail; identity / EEO /
  file / choice fields are filtered out and essays kept, with a load-bearing
  `questions_status` (ok|none|unsupported|unreachable). **Generation** is on a
  button (`Engine.GenerateAnswers`, Sonnet): per question it assembles JD +
  company-fit brief + the **experience bundle** + voice + a **logistics/profile
  bundle** (the same discovered `outreach_sources` the email pipeline uses — no
  more `PAST_EXPERIENCE_FULL` block), drafts once, then routes through the same
  outreach **honesty checker** (a false claim to a recruiter is worse than a thin
  answer); a second honesty fail keeps the answer flagged `needs_review` rather
  than shipping it. **Biographical/logistics facts** (current location, work
  authorization, comp, availability, relocation) come ONLY from the **logistics**
  knowledge need — a soft, brain-discovered bundle that is both a grounded card
  for the drafter and extra honesty ground truth; with no logistics page the
  drafter writes a `[fill-in]` placeholder instead of confabulating (e.g. it used
  to invent a US state), and the honesty checker now vetoes any biographical claim
  absent from the cards. One row
  per question (`posting_answers`, M32), independently editable/regenerable via
  the pursuit panel's "Application" section (inline auto-save). **Generation is
  per-question** — each card has a Generate (undrafted) / Regenerate (drafted)
  button as the primary path, with a secondary "Draft all blank" for bulk; both
  go through the single-row regenerate, honesty-gated identically. **Unwanted
  questions are removable** (× → `DELETE /api/answers/{id}` → a `dismissed`
  soft-delete that survives re-detection, since the idempotent upsert leaves it
  untouched). Endpoints mirror outreach (`GET/POST /api/postings/{id}/answers`,
  `…/redetect`, `PUT`/`DELETE /api/answers/{id}`), gated on a non-empty
  experience bundle + `ANTHROPIC_API_KEY`. CLI: `scout questions detect --posting
  <id> | --all`. **Scout never submits** — it drafts; the user copy-pastes into
  the ATS.

## What's next

**Outreach go-live:** ingest the experience + voice pages into the brain, then
**Refresh sources** (Criteria → outreach knowledge; or `scout outreach sources
--refresh`) so discovery caches the experience bundle, and **localize the
template** (Criteria → email template editor — your real name, sign-off, and
any verbatim prose you want in every email; it's a DB row, never committed).
Then run the first real draft via `scout outreach draft
--posting <id>`. The same experience bundle also unblocks
**application-answer generation** (shared gate). Also still pending: a
real **Crunchbase CSV run** end-to-end
(verify ingest column aliases against the real header first). The web UI is
the primary interface; the CLI is the secondary automation/debug surface.
`north-star.md` is the canonical architecture.

**Platform migration (FEAT-20260607_155517-3c84), done:** scout's web delivery has been re-homed from `go:embed index.html` to a toolkit-built PWA — the UI is now a Vite + vanilla-TS app in `web/` consuming `@brainbot/web-toolkit`, built to `internal/web/dist/` and still `go:embed`-ed into the one Go binary (US-003). Go `/api/*` + local SQLite unchanged; `GET /api/me` reads the edge identity. The shared Caddy/SSO edge config is authored + verified (US-004) and lives on brainbot branch `feat/scout-edge`; it applies when the stack is deployed (separate ops). See [brainbot/docs/app-platform.md](../brainbot/docs/app-platform.md).
