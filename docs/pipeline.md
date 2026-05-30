# Pipeline

Per-command reference. Architecture and the brain split live in
[`north-star.md`](./north-star.md) — this doc is *how each command behaves*.

The **web UI (`scout serve`) is the primary interface**; the CLI commands below
are the secondary automation/debug surface. Both drive the same stages:

```
ingest → filter → enrich → verdict → triage
                              │
                  brain ──────┘  (read-only: criteria + per-company recall)
```

`ingest`, `filter`, `enrich` are brain-free. The brain is touched only in
`verdict`, and only for reads — scout reads the user's criteria and per-company
recall, and never writes back (verdicts stay scout-local). Default `--brainbot`
is `http://127.0.0.1:8100`; empty disables it.

---

## `scout ingest <csv>`

| | |
|---|---|
| **Input** | CSV with a header row (Crunchbase export is the assumed shape). |
| **Output** | `read=N upserted=N skipped=N errors=N`; error lines on stderr. |
| **Idempotent** | Yes — upsert by `(source, source_id)`. |
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
- Upsert key `(source, source_id)`. No UUID column → `source_id` is `"name:"+name`.
- Headcount tolerates ranges (`"11-50"` → upper bound `50`) and commas (`"1,200"`).
- Domain normalized: lowercased, `https://`/`http://`/`www.` and any path stripped.
- `ingested_at` bumps on every upsert, which invalidates downstream enrichment.

---

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
| **Flags** | `--db`, `--workers 8`, `--timeout 12s`, `--force`. |

**Behavior:**
- Targets every company whose domain has no enrichment row, or whose
  `companies.ingested_at` is newer than its `enrichment.fetched_at`
  (`--force` re-fetches all). Failure rows are NOT auto-retried — use `--force`.
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
empty disables), `--model claude-haiku-4-5`, `--workers 4`, `--force`.

### Resolving the criteria (brain-primary)

The criteria are **the user's** — they come from the brain, not a scout file.

```
--brainbot set ──▶ GET /health ──ok──▶ Criteria() = GET /profile bodies
                       │                     │ (empty bodies → broad GET /recall)
                    unreachable           empty → healthy-but-empty
                       │                     │
                       └────────┬────────────┘
                                ▼
                        fall back to taste.md (offline criteria)
```

- The brain client reads **episode BODIES** (`/profile`), not extracted facts —
  bodies carry the user's gates and hard exclusions; facts are a lossy
  positive-only index that drops them. See `north-star.md` → *Facts vs. episodes*.
- A brain that's **unreachable** *or* **healthy-but-empty** falls back to
  `taste.md`. The fallback is offline-only — scout never invests in it.
- The resolved block becomes a `taste.Block`: `Text`, `Source`
  (`brain:profile@<url>` or `file:taste.md`), and `Version`.

### `taste_version` = criteria + playbook hash

`Version = sha256[:12]` of the playbook text plus the criteria text. When the
brain learns something new, the criteria text changes → the version changes →
those companies re-score on the next run. **That re-score is intended.** Editing
`playbook.md` does the same.

### Scoring each survivor

1. Re-runs filter for survivors, joins enrichment on `fetch_status='ok'`.
2. Skip if a verdict row already matches the current `taste_version` (unless `--force`).
3. **Per-company brain context:** when the brain is healthy, `Recall(name, 5)`,
   keeping only facts with `score >= 0.4` (a fresh company scores low and injects
   nothing). Results are cached per run; a brain miss is logged and ignored —
   verdict never fails on it.
4. Sends to the Anthropic Messages API. The system block layers a fixed JSON
   **output contract** + the **playbook** (how to decide; built-in rubric if
   none) + the **criteria** (what the user wants). **Prompt caching is on**
   (`Cached:true`) — the system block is identical across the run, so it's
   cached after the first call.
5. Parses `{"verdict":"yes|maybe|no","reason":...}` (tolerant of fences/noise),
   upserts into `verdicts`.

**See also:** [verdict.md](./verdict.md) for prompts, parsing, model choice.

---

## `scout serve` — the primary interface

| | |
|---|---|
| **Input** | `companies`/`enrichment`/`verdicts`/`runs` + optional brain. |
| **Output** | `scout triage UI at http://localhost:8765`. |
| **Flags** | `--db`, `--addr :8765`, `--taste-md`, `--taste`, `--playbook`, `--source`, `--brainbot URL`. |

A single embedded HTML page plus a **full control surface** — the whole pipeline
runs from the browser. Graceful shutdown on SIGINT/SIGTERM.

**Read / triage**

| Route | Does |
|---|---|
| `GET /` | the embedded triage UI |
| `GET /api/companies` | every company joined with verdict and enrichment |
| `GET /api/companies/{id}` | full detail |
| `GET /api/companies/{id}/brain` | **per-company recall** panel — `Recall(name, 5)` |
| `GET /api/stats` | counts + current criteria version/source |
| `GET /api/meta` | capability flags (control on, brain healthy, verdict key, source) |
| `GET /healthz` | `ok` |

**Run the pipeline as background jobs**

| Route | Does |
|---|---|
| `POST /api/ingest` | multipart CSV upload (field `csv`) → temp file → ingest job |
| `POST /api/run/{stage}` | start `enrich`/`verdict` as a job |
| `GET /api/jobs/{id}/stream` | **live SSE progress** (one line per company) |
| `POST /api/jobs/{id}/cancel` | cancel a running job |
| `GET /api/runs` | **durable run history** (last 30, from the `runs` table) + busy stage |

- The runner allows one job at a time (409 Conflict if busy). Each run is
  recorded in `runs` (verdict runs stamp the criteria version).
- `verdict` jobs 412 without `ANTHROPIC_API_KEY`. The server health-gates the
  per-company recall client the same way the CLI does.

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
