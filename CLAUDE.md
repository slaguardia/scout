# scout — Claude instructions

You're working in **scout**, the user's personal **job-fit scorer**. Portfolio
project and a real tool they use — both audiences matter.

## Architecture — read this first

**[`docs/north-star.md`](./docs/north-star.md) is canonical.** The one-line
model: **scout owns a local knowledge store** — four prose docs typed in the
dashboard (Settings → Knowledge): company-fit **criteria**, **experience**,
**voice**, **logistics** — and the **brain** is an *optional* source of record
that fills it (read-only; verdicts stay scout-local and are never written back
to the brain). **Scout** brings the intelligence (its own LLM + a `playbook.md`
for *how* to judge). Per doc, a typed doc wins over whatever the brain synced —
a typed criteria doc is used outright and the brain's distilled brief only when
it is blank — and scoring, outreach drafting and application answers all run
with **no brain at all** once the docs are typed (no "standalone mode" switch).
There is no file fallback: nothing on file anywhere fails loudly
(`criteria.ErrNoCriteria`, `outreach.ErrNoExperience`), never silently.
Separately, the **pre-filter** is a purely mechanical gate (location, headcount,
vertical, stage) that runs before the LLM verdict on a bulk run. Its rules live
in the DB as a singleton (`taste_filter`, with a master on/off switch), edited
from the dashboard (Settings → Job hunting → "pre-filter"), with a compiled-in
default in `scout/filter/taste_default.toml` — there is no longer a `taste.toml`
file.
It gates only which companies a **bulk** verdict run scores; it never deletes
data, hides rows, or gates ingest/enrich. Disable it (or run a targeted
per-company re-score, which bypasses it) to score everything.

Then [`docs/`](./docs/) for stage references (pipeline, verdict, enrichment,
data-model, operations, limitations).

## Stack

Python · FastAPI (on uvicorn) · SQLite (stdlib `sqlite3`, raw SQL, no ORM) ·
httpx · Anthropic Messages API (direct HTTP, no SDK) · the brain over HTTP/JSON.
The package is `scout/`, tests in `tests/`, run with `pytest`; the `scout` CLI
installs via `pip install -e .`.

## Dev servers

The user's long-running dev servers (Python API on `:8765`, Vite on `:5173`) live in
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
  (`scout/capture/ats.py`); any other link gets the one-shot Haiku pass
  (`scout/capture`). Either way the dialog's kind pin overrides the
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
- **A job link resolves the company's own domain, then enriches it (2026-08-25):**
  a posting almost never sits on the hiring company's host, and a company with no
  domain is unenrichable (`fetch_status = no_domain`) and therefore unscoreable —
  so capture works to find one. In order: **Ashby's board page** states it outright
  (`window.__appData.organization.publicWebsite`, read by `ats.fetch_board_org`,
  which now also supplies the display name — the one ATS that identifies the
  company's site; Greenhouse/Lever/Rippling/Dover expose nothing, verified against
  their live APIs); else the **JD body**, mined by `capture.company_domain_from_text`
  — a URL is accepted only when its registrable label reads as the company name
  (`domain_reads_as_name`: "withpersona.com" for Persona, "applied.co" for Applied
  Intuition), because a JD links the investor, e-verify.gov and its own LinkedIn
  too, and a wrong domain is a wrong *identity*. That mined domain also **overrides
  the page's own host when the host reads as no company at all** (`_company_domain`)
  — a recruiting marketplace like paraform.com must not become the company. It
  never *demotes* a stated domain: nothing corroborated leaves the host standing
  ("about.google" survives). Then `Capturer._autoenrich` fetches the about-page
  inline for a company that has a domain and no enrichment row — best-effort, after
  the posting write, so a slow site never costs the posting. `auto_enrich=False` in
  tests keeps captures off the open internet. `_ATS_HOSTS` also grew
  gem.com / kula.ai / careers-page.com / paraform.com — hosts that carry postings
  in the working set but are not companies. Only gem.com had actually become an
  identity (Charta Health is still on file as `jobs.gem.com`, and enriches 404);
  the rest are blocked pre-emptively.
- **The jobs view is the application tracker** (replaced the user's Notion
  tracker): a lean table — company name, application stage, outreach (the reply
  status + a ⏰ follow-ups-due badge), last outreach, and contacts (mailto links)
  — plus a **"N follow-ups due" banner** that filters to postings owing a
  follow-up. **Outreach is tracked per contact (M51):** contacts are
  **company-level** people (one recruiter reused across that company's roles);
  each send is logged against a contact in `outreach_log` and **auto-arms a
  follow-up** (default 5 business days ≈ a calendar week, configurable via
  `/api/followup-interval`), surfaced when due/overdue. **The reply status
  (`outreach_status`) drives the lifecycle:** the first logged send auto-seeds it
  to the first configured label ("initial contact") when blank, and it **gates
  the alerts** — follow-ups only nag while the posting is in that awaiting phase
  (status blank or the first label); moving it off (a reply came, or it's closed
  out) silences the ⏰ alerts (the detail panel still shows every follow-up). The
  old posting-level `outreach_count` + `last_outreach_at` columns are gone —
  derived from the log (count powers the "not reached out" filter; the visible
  number was dropped); the per-posting free-form `contacts` blob was promoted to
  a `contacts` table (backfilled). Everything else lives in the slide-in panel, where a **contacts
  manager** handles add/edit/archive + per-contact log + follow-up (snooze / mark
  followed-up), and the posting card has the application-stage controls
  (`PUT /api/postings/{id}`). Each logged send records the **actual email body**
  (`outreach_log.body`, M53), shown per-entry in the history. A **follow-up
  template** (M53; a second singleton in `outreach_template`, default in
  `outreach.DefaultFollowupTemplate`, edited in Settings → "follow-up template")
  is pure `{{var}}` substitution — `{{contact_name}}`, `{{contact_role}}`,
  `{{role}}`, `{{company}}`, `{{last_sent}}`, `{{last_message}}` (the last send's
  body) — rendered client-side: each contacted contact's **"Follow up"** button
  copies the filled template to the clipboard and pre-fills the log. Endpoints:
  `GET/POST /api/companies/{id}/contacts`, `PUT/DELETE /api/contacts/{id}`,
  `GET/POST /api/postings/{id}/outreach-log`, `PUT/DELETE /api/outreach-log/{id}`,
  `GET/PUT /api/followup-template`. The jobs filters default to **every**
  application stage and reply status selected (rejected included); the "★ Next
  up" filter is a standalone button beside the "N follow-ups due" button (below
  Filters), not a dropdown item. **Bulk stage moves:** each row carries a select
  checkbox (the header one ticks every row the filter is currently showing), and
  a selection reveals a bulk bar above the table that moves them all to one stage
  in a single call (`POST /api/postings/bulk`) — the "an offer landed, archive
  the rest" move. Selection is pruned to the visible rows, so narrowing the
  filter can only ever shrink what a bulk move touches. **Archived postings fold
  out of the company pane's job list** behind an "N archived — show" toggle
  (client-side only; the detail payload still carries them), since a role
  archived months ago is usually gone by the next time that company comes up.
- **Brain-first, done:** the brain is now a pgvector **document substrate**
  (graphiti is gone) — a librarian whose only consumer call is `GET /recall?q=&k=`,
  returning prose chunks `{heading, text, score, path}` (no polarity/strength
  tags). Scout's **distiller** (`scout/distill`) fans out a few company-fit
  recalls, dedups, then runs a two-step pass — classify each excerpt as COMPANY
  vs ROLE_OR_OTHER (quarantines role/career leak), then synthesize a
  **company-fit brief** (Hard dealbreakers / Strong preferences / Context, in
  prose) from the COMPANY items — on `--distill-model` (default Sonnet; verdict
  scoring stays on Haiku). The verdict engine reasons over that brief — unless a
  criteria doc is typed (Settings → Knowledge → Criteria), which
  `criteria.Resolver.resolve` returns outright with no brain call. The brief is cached locally in SQLite
  (table `brain_profile_cache`, freshness via `--brain-cache-ttl`, manual
  re-distill via the Criteria editor's Refresh / `POST /api/profile/refresh`);
  there is no file fallback — no typed doc and no usable brain or cache raises
  `criteria.ErrNoCriteria` and the verdict run fails loudly. The consumer surface is
  `recall` + `doc` + `map` (amended 2026-06-04): `GET /doc?id=` fetches whole
  documents verbatim by stable page id, `GET /map` is the discovery surface;
  `/profile` stays owner-only and scout never passes a `scope`. Distillation is
  **companies only** — role/title fit is a separate, later concern. `scout
  distill` prints the chunks + brief for tuning. Verdicts stay scout-local —
  never written to the brain. Default brain URL is `http://127.0.0.1:8100`. See
  `brainbot/plans/scout-migration.md` for the migration spec.
- **Local knowledge store (2026-08):** four typed prose docs — **criteria ·
  experience · voice · logistics** — under Settings → **Knowledge** (the default
  Settings group): each a blur-to-save textarea with a provenance chip ("typed by
  you" / "synced from the brain (N pages)" / both / "nothing on file …") and the
  brain-synced content read-only in a collapsible beneath; the Criteria editor
  also shows the brain's distilled brief with Refresh (re-distill) + "Copy to
  editor". A typed doc wins per doc; the brain is an optional importer. Storage:
  experience/voice/logistics are `outreach_sources` rows with an `origin` column
  (`'brain'` | `'local'`, M61) — the typed doc is the one `page_id='local'` row
  per need, written by `store.outreach_sources.put_local_source` (blank deletes
  it); the brain sync (`ensure_knowledge` → `discover` →
  `replace_outreach_sources`) only deletes/re-inserts `origin='brain'` rows, so a
  typed row survives every sync; the reader `outreach_knowledge(con, need)`
  concatenates typed first, then the brain pages (by title), so writer,
  humanizer, honesty checker and answers drafter get both with no code change.
  Criteria is a singleton `criteria_doc` table (M62, `scout/store/criteria_doc.py`,
  playbook pattern): `criteria.Resolver.resolve` returns a non-empty typed doc
  outright (`Block.source = "local:criteria"`; no `/changes`, no distill,
  `brain_profile_cache` untouched), else the existing brain cost cascade, else
  raises `criteria.ErrNoCriteria` (the web verdict job fails with "no criteria on
  file — type them in Settings → Knowledge → Criteria, or connect a brain with
  company-fit pages"; `scout verdict` exits with it). The reconciler
  (`criteria.reconcile_loop` → `AppState.reload_taste`) keeps running but is a
  cheap local read once a doc is typed. **Gone:** `scout/taste`, `taste.md` (+
  its Dockerfile COPY), `--taste-md`, `Config.taste_md_path`, `GET/PUT
  /api/taste`; renamed `taste.Block` → `criteria.Block`, `taste.hash` →
  `criteria.hash_text`, `taste.from_brain` → `criteria.from_text`. **Unchanged:**
  `verdicts.taste_version` (still sha256[:12] of playbook + `"\n---taste---\n"` +
  criteria version; `Block.source` is `local:criteria` or `brain:brief@<url>`),
  the `taste_filter` pre-filter + `/api/taste-filter`, `brain_profile_cache`,
  and `/api/profile` + `POST /api/profile/refresh` (the brain cache view + a
  forced re-distill; 404 with no brain configured) — "taste" survives only as
  those names. Endpoints: `GET/PUT /api/criteria` (replaces `/api/taste`;
  `scout/web/routes/config.py`; `{kind:"criteria", content, taste_version?,
  taste_source?}` — the stamp only while criteria are active; a PUT re-folds via
  `state.reload_taste` so the next verdict run uses it) and `GET/PUT
  /api/knowledge/{need}` (`scout/web/routes/knowledge.py`, need ∈
  experience|voice|logistics; GET → `{kind:"knowledge", need, content,
  brain:[{page_id,title,content,version,resolved_at}]}`, PUT `{content}` saves
  the typed doc, blank clears; 404 on an unknown need); `GET /api/outreach/sources`
  rows carry `origin`. **`ErrNoExperience` moved to draft/answer time:**
  discovery no longer raises it (an empty experience pick is valid);
  `outreach.require_experience(con)` raises it over the merged bundle ("no
  experience on file — type it in Settings → Knowledge, or add an experience page
  to your brain (scout syncs it automatically)"), the engine's `_require_experience`
  delegates to it, and the web gate keeps its shape — 412 `{"error", "need":
  "experience"}` on `POST /api/postings/{id}/outreach` and the answers endpoints
  (after one sync attempt). The **email honesty check now sees the logistics
  bundle** (`_fill_route` passes `self._knowledge("logistics")` to
  `_honesty_check_text`; it used to pass `""` while the answers path already
  passed it), so a true location / work-authorization claim in a filled hole is
  no longer flagged as invented. UI: the old read-only "Company-fit brief" pane,
  the taste.md editor, and the "View brain knowledge" sources modal are gone
  (Job hunting keeps Playbook + the pre-filter form); the draft/answers gate
  button is "Add your experience" → Settings → Knowledge; `/api/meta.brain`
  gates nothing. CLI: `scout outreach sources [--refresh] [--full]` prints
  need / origin / title / page_id rows (typed rows: origin `local`, title
  "(typed)"); `--full` also dumps the merged bundle per need — exactly the LLM
  input. `scout outreach draft --posting <id>` works with a typed experience doc
  and no brain; with nothing on file it fails loudly with the `ErrNoExperience`
  message.
- **Outreach pipeline — editable stage prompts + a mostly-fixed template (2026-06-13):**
  [`docs/pipeline.md`](./docs/pipeline.md) (`scout outreach`) is the reference.
  The pipeline is **four editable LLM stages — researcher · writer (fill) ·
  humanizer · honesty — each a system prompt fully editable from the dashboard**
  (Settings → *Outreach pipeline*). Each has a compiled default in
  `scout/outreach` (registry: `stages.py`); an override lives in the
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
  (motivation + the ask); `{{role}}`/`{{company}}` substitute in. **Knowledge**
  (experience + voice + logistics) is the local store's typed docs plus, when a
  brain is configured, pages *discovered* not pinned (`discover.py`: Haiku over
  `/map`, fetched via `/doc`, cached as `origin='brain'` rows in
  `outreach_sources` (M35)) that **auto-sync** — there is no manual "Refresh
  sources" button: every draft/answer run first calls `outreach.ensure_knowledge`,
  a change-aware sync that asks the brain `GET /changes` since the cursor stored
  in settings (`outreach_knowledge_cursor`) and only re-discovers when the brain
  actually moved (cheap no-op otherwise; serves last-good cache when the brain is
  down; never touches the typed rows). An empty discovery is a valid outcome —
  `ErrNoExperience` is raised at draft/answer time by `outreach.require_experience`
  over the *merged* bundle. The docs are typed under Settings → Knowledge, with
  the synced pages shown read-only beneath. The bundle is the
  honesty checker's ground truth — a thin
  experience doc makes the writer confabulate, so the real lever is good source
  text (typed or in the brain). The **engine** (Sonnet): JD pre-fetch → researcher (`web_search`, ranked
  *referenceable* hooks — never funding/taglines; a regenerate reuses the prior
  draft's research instead of re-searching) → fill (writes the holes; never
  invent / never manufacture a connection — honesty-checked) → humanize (cut
  generic/hollow + AI tells, keep genuine *specific* warmth) → **honesty check —
  the only gate** (vetoes any sender claim beyond the docs; honest → review
  queue, dishonest twice → failed). Verbatim template prose is true by
  construction. The jobs panel is the review queue (edit, mark-sent bumps
  tracking); fire-and-forget. CLI: `scout outreach sources [--refresh] | draft`.
  Spec'd but not built: a `draft-shorten` "too long → tighten" control.
- **Application answers, built:** [`docs/pipeline.md`](./docs/pipeline.md)
  (`scout questions`) is the reference; it reuses the outreach engine.
  **Detection** runs at capture time
  (`scout/capture/questions.py`) via per-platform resolvers — Greenhouse
  `?questions=true` (official) and Ashby `applicationForm` over the unofficial
  `non-user-graphql` endpoint (fail-soft to `unsupported` on schema drift),
  plus a Haiku HTML fallback for the server-rendered tail; identity / EEO /
  file / choice fields are filtered out and essays kept, with a load-bearing
  `questions_status` (ok|none|unsupported|unreachable). **Generation** is on a
  button (`Engine.GenerateAnswers`, Sonnet): per question it assembles JD +
  company-fit brief + the **experience bundle** + voice + a **logistics/profile
  bundle** (the same `outreach_sources` bundles — typed + brain-synced — the
  email pipeline uses; no
  more `PAST_EXPERIENCE_FULL` block), drafts once, then routes through the same
  outreach **honesty checker** (a false claim to a recruiter is worse than a thin
  answer); a second honesty fail keeps the answer flagged `needs_review` rather
  than shipping it. **Biographical/logistics facts** (current location, work
  authorization, comp, availability, relocation) come ONLY from the **logistics**
  knowledge need — a soft bundle (typed in Settings → Knowledge and/or
  brain-discovered) that is both a grounded card
  for the drafter and extra honesty ground truth; with no logistics on file the
  drafter writes a `[fill-in]` placeholder instead of confabulating (e.g. it used
  to invent a US state), and the honesty checker now vetoes any biographical claim
  absent from the cards. One row
  per question (`posting_answers`, M32), independently editable/regenerable via
  the pursuit panel's "Application" section (inline auto-save). **Generation is
  per-question** — each card has a Generate (undrafted) / Regenerate (drafted)
  button as the primary path, with a secondary "Draft all blank" for bulk; both
  go through the single-row regenerate, honesty-gated identically. **Unwanted
  questions are removable** (× → `DELETE /api/answers/{id}` → a hard delete, no
  confirm; a later re-detect re-inserts the question if it is still on the form,
  so removing is undone by a re-detect). Endpoints mirror outreach (`GET/POST /api/postings/{id}/answers`,
  `…/redetect`, `PUT`/`DELETE /api/answers/{id}`), gated on a non-empty
  experience bundle + `ANTHROPIC_API_KEY`. CLI: `scout questions detect --posting
  <id> | --all`. **Scout never submits** — it drafts; the user copy-pastes into
  the ATS.

## What's next

**Outreach go-live:** get experience + voice (+ logistics) on file — either
**type them under Settings → Knowledge** (the zero-brain path; drafting works
with no brain at all) or ingest the pages into the brain (the knowledge then
auto-syncs on the first draft — no Refresh step) — and **localize the
template** (Settings → Outreach → email body — your real name, sign-off, and
any verbatim prose you want in every email; it's a DB row, never committed).
Then run the first real draft via `scout outreach draft
--posting <id>`. The same experience bundle also unblocks
**application-answer generation** (shared gate). Also still pending: a
real **Crunchbase CSV run** end-to-end
(verify ingest column aliases against the real header first). The web UI is
the primary interface; the CLI is the secondary automation/debug surface.
`north-star.md` is the canonical architecture.

**Platform migration (FEAT-20260607_155517-3c84), done:** scout's web delivery is a toolkit-built PWA — a Vite + **React + TypeScript** app in `web/` consuming `@brainbot/web-toolkit` (its stack-agnostic CSS/tokens/pwa/session; the framework-bound `shell`/`components` are reimplemented locally in React — the toolkit gains no `react` dep), built to `web/dist/` and served as static files by the FastAPI app (US-003). `/api/*` + local SQLite unchanged; `GET /api/me` reads the edge identity. The shared Caddy/SSO edge config is authored + verified (US-004) and lives on brainbot branch `feat/scout-edge`; it applies when the stack is deployed (separate ops). See [brainbot/docs/app-platform.md](../brainbot/docs/app-platform.md).
