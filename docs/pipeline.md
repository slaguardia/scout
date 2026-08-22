# Pipeline

Per-command reference. Architecture and the brain split live in
[`north-star.md`](./north-star.md) — this doc is *how each command behaves*.

The **web UI (`scout serve`) is the primary interface**; the CLI commands below
are the secondary automation/debug surface. Both drive the same stages:

```
ingest → filter → enrich → verdict → triage
                              │
          knowledge store ────┘  (scout-local: criteria typed in Settings → Knowledge,
          ▲                       or the brain's distilled brief, cached locally)
          │
          brain (optional) ─── read-only source that fills the store
```

`ingest`, `filter`, `enrich` are brain-free. **Scout owns a local knowledge
store** — four prose docs typed under Settings → Knowledge (company-fit
criteria, experience, voice, logistics) — and the brain is an **optional**
source that fills it: `verdict` recalls the user's criteria and distills them
into a brief (cached locally), `outreach`/`questions` discover experience +
voice + logistics pages. A typed doc always wins over what the brain synced,
per doc; with the docs typed, everything runs with no brain at all. Reads only —
scout never writes back (verdicts stay scout-local). Default `--brainbot` is
`http://127.0.0.1:8100`; empty disables it.

---

## `scout ingest <csv>`

| | |
|---|---|
| **Input** | CSV with a header row (Crunchbase export is the assumed shape). |
| **Output** | `read=N upserted=N skipped=N errors=N`; error lines on stderr. |
| **Idempotent** | Yes — upsert by deterministic `id` (UUIDv5 of domain, or name). |
| **Flags** | `--db scout.db`, `--source crunchbase`. |

**Behavior:**
- Column aliases in `scout/ingest/csv.py` map many header names to canonical
  fields (`Organization Name`/`Company`/`name`, `UUID`/`id`, `Industries`/`Industry`,
  `Headcount`/`Employees`, `Headquarters Location`/`HQ Location`, etc.).
- **Strips a UTF-8 BOM from the first header cell** — Crunchbase exports are
  UTF-8-with-BOM, and without this the first column (`Organization Name` → the
  company name) wouldn't match its alias and every row would skip as nameless.
- Per row: builds a `store.Company`, preserves the original row in `raw_json`
  (untouched, header-ordered), upserts. Rows with no resolved name are skipped.
- Upsert key is the deterministic primary key `id` = UUIDv5 of the normalized
  `domain`, or `"name:"+lower(name)` when there's no domain. The same company —
  including the same domain from a *different source* — collapses into one row.
- Headcount tolerates ranges (`"11-50"` → upper bound `50`) and commas (`"1,200"`).
- Domain normalized: lowercased, `https://`/`http://`/`www.` and any path stripped.
- `ingested_at` bumps on every upsert, which invalidates downstream enrichment.

**The Add dialog (UI only).** Besides CSV upload, the web UI's **Add…** dialog
(Run panel) ingests one company or one job posting from its link — the link is
the only required field, everything else is optional, and a **fill in the
blanks** tick chooses between a plain write and the link-capture agent pass.
Four combinations, three endpoints:

- **Company, no agent pass** → `POST /api/companies` (source `manual`). A blank
  name defaults to the domain; vertical/location/headcount/funding-stage are
  optional. Funding stage is a dropdown and verticals a multi-select, both
  populated from the values already in the set (`GET /api/facets`; verticals
  are the deduped tags split out of the composite `Industries` cells, rejoined
  `"A, B, C"` on save). Unlike a CSV re-ingest, a manual add for a website
  **already present is rejected (`409`), never overwritten** — it returns the
  existing company. See `ingest.add_manual` / `ingest.CompanyExists`.
- **Job, no agent pass** → `POST /api/postings` (source `manual`): no fetch, no
  LLM. The posting attaches to the typed company name and/or the link's own
  host (`capture.company_domain_from_url`; ATS hosts identify nothing), creating
  the company via `ingest.ensure_company` on first sight; a link that names
  neither is rejected (`400`) rather than guessed at.
- **Either kind, agent pass ticked** → `POST /api/capture` with the kind pinned
  and the typed fields passed along — **user input wins, extraction fills the
  blanks**.

**Link capture (the agent pass).** `POST /api/capture {url, kind?, fields?}`
runs `scout/capture`: one Haiku call over the page fetched with the
enrichment fetch stack, classifying it — **job posting vs company page vs
other** — and extracting structured fields. A pinned `kind` (the dialog's
toggle) overrides the classifier; `fields` carry typed values that win over
extraction (headcount/funding-stage are never extracted — they only pass user
input through). A job posting is stored in `job_postings`
(title/location/summary) attached to its company, with the company created
first (source `capture`, via `ingest.ensure_company`) when it isn't in the
list; the company's own domain is resolved from the extraction with
ATS/job-board hosts (greenhouse, lever, ashby, …) explicitly rejected as
identities. A company page upserts the company and **seeds its enrichment row
from the already-fetched text** (only when no enrichment exists), so the next
verdict run can score it immediately. Unlike `AddManual`, an existing company
is the happy path (the posting just attaches), and capture is idempotent by
URL — re-pasting refreshes the same posting. Unfetchable pages (login walls,
bot challenges) return their honest `fetch_status` (`422`) and write nothing;
unpinned `kind=other` pages write nothing too.

## `scout filter`

| | |
|---|---|
| **Input** | the pre-filter rules (the `taste_filter` DB singleton), `companies` table. |
| **Output** | Survivor table + total/survivor counts + drop-reason histogram. |
| **Idempotent** | Read-only — no state changes. |
| **Flags** | `--db scout.db`. |

The pre-filter is a **purely mechanical gate** — cheap hard gates that decide
which companies the expensive verdict step bothers to score. It is *not*
judgment; nuanced fit happens at verdict time, grounded in your criteria.

**It is a scoring gate, not a data gate.** It never deletes a company, never
hides one from the companies list, and does not run at ingest or gate enrich —
this command is read-only and only *previews* who a bulk verdict run would
score. Every company you import is stored and shown in the list regardless; one
the filter excludes simply sits there with no verdict yet (`—`), and you can
open it or [targeted-rescore](#scout-verdict) it (which bypasses the filter).

The rules live in the DB as a singleton (raw TOML), **edited from the dashboard**
(Settings → Job hunting → "pre-filter") and with a **master on/off switch** — turn it off and
a bulk run scores everything. The compiled-in default is
[`scout/filter/taste_default.toml`](../scout/filter/taste_default.toml). A
targeted per-company verdict re-score **bypasses** the pre-filter entirely.

**Behavior:**
- Loads the rules from the DB (falling back to the compiled-in default), pulls
  all company rows into memory, evaluates per row.
- Eval order, first failing check is the recorded drop reason:
  `location → headcount_min/max → vertical_excluded → vertical_not_allowed → funding_stage`.
- Eval is in Python (not SQL) for per-reason drop counts and substring matching;
  N is low thousands, so speed isn't the bottleneck.
- Location with no data passes only if `location.remote_ok`. Headcount is
  checked only when present.

---

## `scout enrich`

| | |
|---|---|
| **Input** | `companies` with a non-empty domain. |
| **Output** | `considered=N fetched=N ok=N failed=N`. |
| **Idempotent** | Yes — re-fetches only rows re-ingested since last fetch. |
| **Flags** | `--db`, `--workers 8`, `--timeout 12s`, `--force`, `--only-blanks`, `--company id,...`. |

**Behavior:**
- Targets every company whose domain has no enrichment row, or whose
  `companies.ingested_at` is newer than its `enrichment.fetched_at`
  (`--force` re-fetches all; `--only-blanks` restricts to companies with no
  enrichment row at all). Failure rows are NOT auto-retried — use `--force`.
- `--company id,...` (web: `company_ids` in the run body) runs exactly those
  companies and always re-fetches — targeted implies force. The UI's
  per-company **re-enrich** button in the detail pane uses this.
- N workers (default 8). Each tries `https://<domain>/about` → `/about-us` →
  `/company` → `/`; first 2xx HTML response wins.
- Strips `<script>`/`<style>`/`<noscript>`/`<svg>` and all tags, decodes common
  entities, collapses whitespace, truncates to 3000 runes. 512 KB read cap,
  redirect limit 5.
- Writes one `enrichment` row per company with a `fetch_status`:

  | status | meaning |
  |---|---|
  | `ok` | got HTML with ≥ 200 runes of stripped text |
  | `low_content` | < 200 runes (likely a JS-SPA shell); cached but skipped at verdict |
  | `challenge` | bot-challenge interstitial (Cloudflare/PerimeterX/Akamai etc.) |
  | `no_domain` | company has no domain |
  | `http_<code>` | last non-2xx response code |
  | `dns` | DNS lookup failed |
  | `refused` | TCP connection refused |
  | `timeout` | per-request `Client.Timeout` |
  | `error` | anything else; detail in `fetch_error` |

**See also:** [enrichment.md](./enrichment.md) for fetch strategy and stripping.

---

## `scout verdict`

| | |
|---|---|
| **Input** | filter survivors × `enrichment` with `fetch_status='ok'`, plus the resolved criteria. |
| **Output** | `considered=N scored=N skipped=N failed=N` + verdict histogram (+ cache line). |
| **Idempotent** | Yes, by `(company_id, taste_version)`. |
| **Requires** | `ANTHROPIC_API_KEY`. |

**Flags:** `--db`, `--brainbot URL` (default `http://127.0.0.1:8100`; empty
disables), `--brain-cache-ttl 6h`, `--model claude-haiku-4-5`,
`--distill-model`, `--workers 10`, `--force`, `--only-blanks`,
`--company id,...`. The criteria, pre-filter rules and playbook all come from
the DB — there are no file flags.

`--company id,...` (web: `company_ids` in the run body) scores exactly those
companies and always re-scores — even a sticky manual verdict is replaced,
since a targeted run is an explicit ask. Filter survival and an `ok`
enrichment row are still required; companies that don't qualify are reported
in the progress lines, not scored. The UI's per-company **re-score** button
in the detail pane uses this.

### Resolving the criteria (typed doc, else the distilled brief, cached)

The criteria are **the user's** — typed straight into scout, or distilled from
the brain. Resolution is centralized in `scout/criteria` (`criteria.Resolver`),
shared by both `cmd_verdict` (the CLI) and the web server, with a local SQLite
cache in front of the brain:

```
typed criteria doc? (Settings → Knowledge → Criteria) ──yes──▶ use it (brain not consulted)
       │ no
no brain configured ──────────────────────────────────▶ ErrNoCriteria
       │ brain configured
cached brief, brain unchanged since it? (Tier 0/1) ──yes──▶ use it
       │ no cache / changed
recall + distill (scout/distill) ──▶ brief ──▶ cache + use
       │ unreachable / distill failed
cached brief within --brain-cache-ttl? ──yes──▶ use it (brain is down)
       │ no
ErrNoCriteria — nothing to score against
```

- **A typed doc wins outright.** The `criteria_doc` singleton
  (`scout/store/criteria_doc.py`, edited at Settings → Knowledge → Criteria via
  `PUT /api/criteria`) is served as-is when non-empty, source `local:criteria` —
  no `/changes` probe, no health check, no distill, and `brain_profile_cache`
  is left untouched. Only an empty doc falls through to the brain cascade.
- The brief comes from the **distiller** (`scout/distill`): it fans out a few
  **company-fit** recalls (`GET /recall`), dedups the prose chunks, then runs a
  two-step pass — classify each excerpt as COMPANY vs ROLE_OR_OTHER, then
  synthesize a company-fit brief from the COMPANY items only — sections (*Hard
  dealbreakers / Strong preferences / Context*) the LLM writes in prose, not tags
  handed over by the brain. Runs on `--distill-model` (default Sonnet). See
  `north-star.md` → *Distilling the criteria*.
  `/recall` is the **only** brain call; scout never passes a `scope` and never
  queries per company.
- A distilled brief is written to `brain_profile_cache` and served verbatim
  while the brain reports nothing moved since it (`GET /changes`, Tier 0) or the
  re-gathered basis is unchanged (Tier 1); a real change re-synthesizes (Tier 2).
  If the brain is unreachable *or* distillation fails, the cached brief is used
  while it is within `--brain-cache-ttl` (default 6h) before scout gives up.
- **Nothing anywhere** — no typed doc, and no brain / a brain that's
  **unreachable with no usable cache** / **healthy-but-empty** — raises
  `criteria.ErrNoCriteria`: the web verdict job fails with *"no criteria on file
  — type them in Settings → Knowledge → Criteria, or connect a brain with
  company-fit pages"* and `scout verdict` exits with the same error. Scoring
  against empty criteria is never silently allowed; there is no file fallback.
- The resolved block becomes a `criteria.Block`: `text`, `source`
  (`local:criteria` or `brain:brief@<url>`, each `+ playbook` once the playbook
  is folded in), and `version`.
- `scout serve` re-resolves in the background (`criteria.reconcile_loop` →
  `AppState.reload_taste`, every `--reconcile-interval`, default 2m) so a
  cached brief converges to the brain on its own; with a typed doc each pass is
  a cheap local read — `resolve()` returns before any brain call.
- `scout distill` prints the recalled chunks + the brief without scoring — the
  debug/tuning instrument for the recall → brief step.

### `taste_version` = criteria + playbook hash

`Version = sha256[:12]` of the playbook text plus the criteria text. When the
criteria change — you edit the typed doc, or the brain learns something new —
the text changes → the version changes → those companies re-score on the next
run. **That re-score is intended.** Editing the playbook does the same.

### Scoring each survivor

1. Re-runs filter for survivors, joins enrichment on `fetch_status='ok'`.
2. Skip if a verdict row already matches the current `taste_version` (unless `--force`).
3. Sends to the Anthropic Messages API. The system block layers a fixed JSON
   **output contract** + the **playbook** (how to decide; built-in rubric if
   none) + the **criteria** (what the user wants). **Prompt caching is on**
   (`Cached:true`) — the system block is identical across the run, so it's
   cached after the first call.
4. Parses `{"verdict":"yes|maybe|no","reason":...}` (tolerant of fences/noise),
   upserts into `verdicts`.

**See also:** [verdict.md](./verdict.md) for prompts, parsing, model choice.

---

## `scout outreach`

| | |
|---|---|
| **Input** | a `job_postings` row, the **knowledge store** (experience + voice + logistics — typed under Settings → Knowledge and/or *discovered* from the brain), the web (company research), the scout-local **email template**, and the **four pipeline-stage prompts** — each an editable system prompt with a compiled default (researcher · writer · humanizer · honesty). |
| **Output** | a drafted cold email on the posting, in the review queue. Scout never sends — the jobs panel is the review queue; mark-sent bumps tracking. |
| **Idempotent** | Re-drafting replaces the draft; a regenerate **reuses the prior draft's research** instead of re-searching. Knowledge lives in `outreach_sources` — the typed doc per need (`origin='local'`, at most one) plus brain-synced pages (`origin='brain'`) — and the brain side **auto-syncs** at run start (`ensure_knowledge`: a change-aware `GET /changes` check, re-discovering only when the brain moved; a sync replaces only `brain` rows, so a typed doc survives every sync) — no manual refresh. |
| **Subcommands** | `scout outreach sources [--refresh] [--full]` (sync from the brain + print one `need / origin / title / page_id` row per source — a typed doc shows origin `local`, title `(typed)`; `--refresh` forces a full re-discovery; `--full` also dumps the merged bundle per need — exactly the LLM input), `scout outreach draft --posting <id>` (research → draft; works with a typed experience doc and no brain). |

**Four editable LLM stages.** Every stage's system prompt has a compiled default
in `scout/outreach` (registry in `stages.py`) and is overridable per-stage
from the dashboard (Settings → *Outreach pipeline*), stored in the
`prompt_overrides` table and resolved at draft time by `Engine.stage_prompt`. A
bad edit only fails that stage's drafts (Reset reverts it), never the server —
the JSON contract lives inside each default prompt. Every stage **except the
Writer** can be toggled off/skipped (`Engine.stage_enabled`). There is **no judge
and no "doctrine"** — both removed: the judge's depth-gating produced robotic,
clever-sounding output (and a critique report-card on the user); the doctrine doc
was superseded. The writing register is **plain, warm, and specific** —
cold-email replies are driven by specificity/relevance + brevity, not cleverness
(evidence: the `cold-outreach-research` skill).

The **email template** (a localized DB singleton) is **mostly the user's fixed
prose** — verbatim background + closer — with the only generated holes a leashed
**opener** (reference one real specific thing + a genuine reaction, else a plain
intro) and a short **closer** (motivation + the ask); `{{role}}` / `{{company}}`
substitute in. **Knowledge** (experience HARD / voice + logistics soft) is read
from the store per need (`outreach_knowledge`: the typed doc first, then the
brain pages by title — every stage gets both); the brain side is discovered via
`/map`+`/doc`, not pinned. Experience is the honesty checker's ground truth — a
thin experience doc makes the writer confabulate, so a good experience doc
(typed, or a good source page) is the real lever.

**Behavior (engine, Sonnet):** JD pre-fetch → **researcher** (`web_search`;
ranked *referenceable* hooks — eng/blog posts, founder theses, real launches,
never funding/taglines; a regenerate reuses the prior research) → one **fill**
(writer) call that writes the holes against research + experience + voice (never
invent / never manufacture a connection; a no-send signal is a valid refusal) →
**humanizer** (cut generic/hollow + AI tells, keep genuine *specific* warmth;
never changes a fact) → **honesty check — the only gate** (vetoes any sender
claim beyond the documented experience + logistics bundle, so a true location /
work-authorization line in a hole is not flagged as invented; honest → review
queue, dishonest twice → failed). A disabled stage is skipped. Verbatim template
prose is true by construction. **The experience gate is at draft time, over the
merged bundle:** `outreach.require_experience` raises `ErrNoExperience` (*"no
experience on file — type it in Settings → Knowledge, or add an experience page
to your brain (scout syncs it automatically)"*) when typed + synced experience
is empty — discovery itself treats an empty pick as a valid outcome. The web
endpoints answer `412 {"error", "need": "experience"}`; the UI's gate button
("Add your experience") opens Settings → Knowledge. The engine wires into
`serve` when `ANTHROPIC_API_KEY` is set; drafting is fire-and-forget. Code:
`scout/outreach`.

---

## `scout questions`

| | |
|---|---|
| **Input** | a `job_postings` row (its ATS application form), plus — for generation — the same JD + company-fit brief + experience bundle + voice the email pipeline uses. |
| **Output** | one `posting_answers` row per detected essay question, each independently editable/regenerable from the pursuit panel's "Application" section. **Scout never submits** — it drafts; you copy-paste into the ATS. |
| **Idempotent** | Re-detect refreshes the question set; per-question Regenerate redraws one answer. |
| **Subcommands** | `scout questions detect (--posting <id> | --all)`. Generation is on a UI button (`Engine.generate_answers`), gated on a non-empty experience bundle (typed + synced — the same `ErrNoExperience` / `412` gate as outreach) + `ANTHROPIC_API_KEY`. |

**Detection** runs at capture time (`scout/capture/questions.py`) via
per-platform resolvers — Greenhouse `?questions=true` (official) and Ashby
`applicationForm` over the unofficial `non-user-graphql` endpoint (fail-soft to
`unsupported` on schema drift), plus a Haiku HTML fallback. Identity / EEO /
file / choice fields are filtered out and essays kept, tracked by a load-bearing
`questions_status` (`ok|none|unsupported|unreachable`).

**Generation** (Sonnet) drafts each answer once, then routes it through the same
outreach **honesty checker** (a false claim to a recruiter is worse than a thin
answer); a second honesty fail keeps the answer flagged `needs_review` rather
than shipping it. Endpoints mirror outreach (`GET/POST
/api/postings/{id}/answers`, `…/redetect`, `PUT /api/answers/{id}`).

---

## `scout serve` — the primary interface

| | |
|---|---|
| **Input** | `companies`/`enrichment`/`verdicts`/`runs` + optional brain. |
| **Output** | `scout triage UI at http://localhost:8765`. |
| **Flags** | `--db`, `--addr :8765`, `--source`, `--brainbot URL`, `--brain-cache-ttl 6h`, `--reconcile-interval 2m`, `--gmail-sync-interval`, `--distill-model`, `--outreach-model`. |

A toolkit-built PWA (`web/`, consuming `@brainbot/web-toolkit`, served as static
files from `web/dist/`) plus a **full control surface** — the whole
pipeline runs from the browser. Graceful shutdown on SIGINT/SIGTERM.

**Read / triage**

| Route | Does |
|---|---|
| `GET /` | the triage UI (the built PWA, served as static files) |
| `GET /api/companies` | every company joined with verdict and enrichment |
| `POST /api/companies` | **manual single-company add** (source `manual`); website required, a duplicate website → `409` |
| `GET /api/companies/{id}` | full detail |
| `GET /api/postings` | every posting joined with its company's name/verdict/marks + application lifecycle (the **jobs view / tracker**) |
| `POST /api/postings` | **direct posting add** (no fetch, no LLM); company resolved from the typed name and/or the link's host, `400` when neither identifies one |
| `PUT /api/postings/{id}` | set a posting's application lifecycle (application stage, reply status, notes); outreach count/date are derived, not set here |
| `PUT /api/postings/{id}/next-up` | queue/unqueue a posting as **next up for outreach**; the mark self-clears when an outreach send is logged |
| `GET/POST /api/companies/{id}/contacts` | list / add a company's outreach contacts (M51) |
| `PUT/DELETE /api/contacts/{id}` | edit / archive one contact |
| `GET/POST /api/postings/{id}/outreach-log` | list / log per-contact outreach sends (a send auto-arms a follow-up) |
| `PUT/DELETE /api/outreach-log/{id}` | edit (snooze / mark followed-up) / delete a logged send |
| `GET/PUT /api/followup-interval` | the default follow-up interval in business days (0 = off) |
| `GET/PUT /api/followup-template` | the copy-paste follow-up template (M53; `{{var}}` substitution) |
| `POST /api/capture` | **link-capture agent pass**: fetch + classify + extract one pasted URL; optional pinned `kind` + typed `fields` that win over extraction (412 without the key, 422 when unfetchable) |
| `GET /api/facets` | distinct funding stages + verticals in the set (feeds the Add dialog's pickers) |
| `GET /api/profile` | **read-only** view of the brain's cached distilled brief + freshness, plus the active criteria's source/version (a non-empty typed criteria doc still wins at resolve time) |
| `POST /api/profile/refresh` | force a re-distill (recall + synthesis) from the brain; `404` with no brain configured, `502` when it is unreachable or empty |
| `GET /api/stats` | counts + current criteria version/source |
| `GET /api/meta` | capability flags (control on, brain healthy, verdict/capture key, source) |
| `GET /healthz` | `ok` |

**Run the pipeline as background jobs**

| Route | Does |
|---|---|
| `POST /api/ingest` | multipart CSV upload (field `csv`) → temp file → ingest job |
| `POST /api/run/{stage}` | start `enrich`/`verdict` as a job; optional JSON body `{force, only_blanks, company_ids}` — `company_ids` runs exactly those companies and implies force |
| `GET /api/jobs/{id}/stream` | **live SSE progress** (one line per company) |
| `POST /api/jobs/{id}/cancel` | cancel a running job |
| `GET /api/runs` | **durable run history** (last 30, from the `runs` table) + busy stage |

- The runner allows one job at a time (409 Conflict if busy). Each run is
  recorded in `runs` (verdict runs stamp the criteria version).
- `verdict` jobs 412 without `ANTHROPIC_API_KEY`. The server resolves criteria
  through the same `scout/criteria` resolver the CLI uses (typed doc → cached
  brief → live recall + distill → cache within TTL); with nothing anywhere the
  job fails with the *"no criteria on file — type them in Settings → Knowledge →
  Criteria, or connect a brain with company-fit pages"* error.

**Editor — scout-local rows only, never the brain**

| Route | Does |
|---|---|
| `GET`/`PUT /api/criteria` | read/write the typed company-fit criteria doc (`criteria_doc` singleton; non-empty wins over the brain's brief). Response `{kind:"criteria", content, taste_version?, taste_source?}` — the stamp only while criteria are active |
| `GET`/`PUT /api/knowledge/{need}` | `need` ∈ `experience`\|`voice`\|`logistics`: GET → `{kind:"knowledge", need, content, brain:[{page_id,title,content,version,resolved_at}]}` (the typed doc + the brain-synced pages, read-only here); PUT `{content}` saves the typed doc, blank clears it; `404` on an unknown need |
| `GET`/`PUT /api/playbook` | read/write the playbook (DB singleton) |

A criteria or playbook PUT re-folds the active criteria version
(`state.reload_taste`, matching `scout verdict`) so the next verdict run uses
the edit. Per the editor-isolation invariant in `north-star.md`, these write
**scout-local rows only** and never touch the brain client — a knowledge PUT
never touches the brain-synced rows, and a later sync never touches the typed
row.

---

## `scout stats`

| | |
|---|---|
| **Output** | `companies=N` + verdict histogram if any. |

A quick sanity check between stages.
