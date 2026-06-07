# Pipeline

Per-command reference. Architecture and the brain split live in
[`north-star.md`](./north-star.md) — this doc is *how each command behaves*.

The **web UI (`scout serve`) is the primary interface**; the CLI commands below
are the secondary automation/debug surface. Both drive the same stages:

```
ingest → filter → enrich → verdict → triage
                              │
                  brain ──────┘  (read-only: the user's criteria, cached locally)
```

`ingest`, `filter`, `enrich` are brain-free. The brain is touched only in
`verdict`, and only for reads — scout recalls the user's criteria and distills
them into a brief (cached locally) and never writes back (verdicts stay
scout-local). Default `--brainbot` is `http://127.0.0.1:8100`; empty disables it.

---

## `scout ingest <csv>`

| | |
|---|---|
| **Input** | CSV with a header row (Crunchbase export is the assumed shape). |
| **Output** | `read=N upserted=N skipped=N errors=N`; error lines on stderr. |
| **Idempotent** | Yes — upsert by deterministic `id` (UUIDv5 of domain, or name). |
| **Flags** | `--db scout.db`, `--source crunchbase`. |

**Behavior:**
- Column aliases in `internal/ingest/csv.go` map many header names to canonical
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
  existing company. See `ingest.AddManual` / `ingest.ErrCompanyExists`.
- **Job, no agent pass** → `POST /api/postings` (source `manual`): no fetch, no
  LLM. The posting attaches to the typed company name and/or the link's own
  host (`capture.CompanyDomainFromURL`; ATS hosts identify nothing), creating
  the company via `ingest.EnsureCompany` on first sight; a link that names
  neither is rejected (`400`) rather than guessed at.
- **Either kind, agent pass ticked** → `POST /api/capture` with the kind pinned
  and the typed fields passed along — **user input wins, extraction fills the
  blanks**.

**Link capture (the agent pass).** `POST /api/capture {url, kind?, fields?}`
runs `internal/capture`: one Haiku call over the page fetched with the
enrichment fetch stack, classifying it — **job posting vs company page vs
other** — and extracting structured fields. A pinned `kind` (the dialog's
toggle) overrides the classifier; `fields` carry typed values that win over
extraction (headcount/funding-stage are never extracted — they only pass user
input through). A job posting is stored in `job_postings`
(title/location/summary) attached to its company, with the company created
first (source `capture`, via `ingest.EnsureCompany`) when it isn't in the
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
| **Input** | `taste.toml` (mechanical pre-filter), `companies` table. |
| **Output** | Survivor table + total/survivor counts + drop-reason histogram. |
| **Idempotent** | Read-only — no state changes. |
| **Flags** | `--db scout.db`, `--taste taste.toml`. |

`taste.toml` is a **purely mechanical pre-filter** — cheap hard gates that cull
rows before the expensive verdict step. It is *not* judgment; nuanced fit
happens at verdict time, grounded in the brain.

**Behavior:**
- Loads `taste.toml`, pulls all company rows into Go, evaluates per row.
- Eval order, first failing check is the recorded drop reason:
  `location → headcount_min/max → vertical_excluded → vertical_not_allowed → funding_stage`.
- Eval is in Go (not SQL) for per-reason drop counts and substring matching;
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

**Flags:** `--db`, `--taste taste.toml`, `--taste-md taste.md`,
`--playbook playbook.md`, `--brainbot URL` (default `http://127.0.0.1:8100`;
empty disables), `--brain-cache-ttl 6h`, `--model claude-haiku-4-5`,
`--workers 4`, `--force`, `--only-blanks`, `--company id,...`.

`--company id,...` (web: `company_ids` in the run body) scores exactly those
companies and always re-scores — even a sticky manual verdict is replaced,
since a targeted run is an explicit ask. Filter survival and an `ok`
enrichment row are still required; companies that don't qualify are reported
in the progress lines, not scored. The UI's per-company **re-score** button
in the detail pane uses this.

### Resolving the criteria (distilled brief, cached)

The criteria are **the user's** — they come from the brain, not a scout file.
Resolution is centralized in `internal/criteria` (`criteria.Resolver`), shared by
both `cmdVerdict` and the web server, with a local SQLite cache in front of the
brain:

```
fresh cached brief? (age < --brain-cache-ttl) ──yes──▶ use it
       │ no
recall + distill (internal/distill) ──▶ brief ──▶ cache + use
       │ unreachable / distill failed
stale cached brief? ──yes──▶ use it (brain is down)
       │ no
fall back to taste.md (offline criteria)
```

- The brief comes from the **distiller** (`internal/distill`): it fans out a few
  **company-fit** recalls (`GET /recall`), dedups the prose chunks, then runs a
  two-step pass — classify each excerpt as COMPANY vs ROLE_OR_OTHER, then
  synthesize a company-fit brief from the COMPANY items only — sections (*Hard
  dealbreakers / Strong preferences / Context*) the LLM writes in prose, not tags
  handed over by the brain. Runs on `--distill-model` (default Sonnet). See
  `north-star.md` → *Distilling the criteria*.
  `/recall` is the **only** brain call; scout never passes a `scope` and never
  queries per company.
- A distilled brief is written to `brain_profile_cache` and reused within
  `--brain-cache-ttl` (default 6h). If the brain is unreachable *or* distillation
  fails, a *stale* cached brief is used before scout drops to `taste.md`.
- A brain that's **unreachable with no cache** *or* **healthy-but-empty** falls
  back to `taste.md`. The fallback is offline-only — scout never invests in it.
- The resolved block becomes a `taste.Block`: `Text`, `Source`
  (`brain:brief@<url>` or `file:taste.md`), and `Version`.
- `scout distill` prints the recalled chunks + the brief without scoring — the
  debug/tuning instrument for the recall → brief step.

### `taste_version` = criteria + playbook hash

`Version = sha256[:12]` of the playbook text plus the criteria text. When the
brain learns something new, the criteria text changes → the version changes →
those companies re-score on the next run. **That re-score is intended.** Editing
`playbook.md` does the same.

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

## `scout serve` — the primary interface

| | |
|---|---|
| **Input** | `companies`/`enrichment`/`verdicts`/`runs` + optional brain. |
| **Output** | `scout triage UI at http://localhost:8765`. |
| **Flags** | `--db`, `--addr :8765`, `--taste-md`, `--taste`, `--playbook`, `--source`, `--brainbot URL`, `--brain-cache-ttl 6h`. |

A toolkit-built PWA (`web/`, consuming `@brainbot/web-toolkit`, embedded via
`go:embed internal/web/dist/`) plus a **full control surface** — the whole
pipeline runs from the browser. Graceful shutdown on SIGINT/SIGTERM.

**Read / triage**

| Route | Does |
|---|---|
| `GET /` | the embedded triage UI |
| `GET /api/companies` | every company joined with verdict and enrichment |
| `POST /api/companies` | **manual single-company add** (source `manual`); website required, a duplicate website → `409` |
| `GET /api/companies/{id}` | full detail |
| `GET /api/postings` | every posting joined with its company's name/verdict/marks + application lifecycle (the **jobs view / tracker**) |
| `POST /api/postings` | **direct posting add** (no fetch, no LLM); company resolved from the typed name and/or the link's host, `400` when neither identifies one |
| `PUT /api/postings/{id}` | set a posting's application lifecycle (applied date, response, outreach count/date) |
| `PUT /api/postings/{id}/next-up` | queue/unqueue a posting as **next up for outreach**; the mark self-clears when outreach_count bumps |
| `POST /api/capture` | **link-capture agent pass**: fetch + classify + extract one pasted URL; optional pinned `kind` + typed `fields` that win over extraction (412 without the key, 422 when unfetchable) |
| `GET /api/facets` | distinct funding stages + verticals in the set (feeds the Add dialog's pickers) |
| `GET /api/profile` | **read-only** cached distilled brief + freshness (the active criteria) |
| `POST /api/profile/refresh` | force a re-distill (recall + synthesis) from the brain |
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
  through the same `internal/criteria` resolver the CLI uses (cached brief →
  live recall + distill → stale cache → `taste.md`).

**Editor — local files only, never the brain**

| Route | Does |
|---|---|
| `GET`/`PUT /api/taste` | read/write `taste.md` (the offline fallback criteria) |
| `GET`/`PUT /api/playbook` | read/write `playbook.md` |

A PUT re-resolves criteria + re-folds the playbook into the version (matching
`scout verdict`). Per the editor-isolation invariant in `north-star.md`, these
write the **local files only** and never touch the brain client.

---

## `scout stats`

| | |
|---|---|
| **Output** | `companies=N` + verdict histogram if any. |

A quick sanity check between stages.
