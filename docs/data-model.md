# Data model

scout's local SQLite working set. For *what* this store is and how it fits the
brain-first architecture (scout SQLite = disposable working set; the brain is
the system of record for the user), see [`north-star.md`](./north-star.md). This
doc is just the schema.

SQLite, one file (`scout.db` by default). Migrations live in
`internal/store/migrations/` (`0001`–`0013`), are embedded via `//go:embed`,
apply in filename order on every `Open()`, and are tracked in
`schema_migrations`.

Two pragmas, set in the DSN: `foreign_keys=ON`, `journal_mode=WAL`. WAL because
most stages do bursts of writes from worker pools and it handles that better
than the default rollback journal.

## Tables

### `companies` — the inventory
```sql
companies (
    id            TEXT PK,           -- deterministic UUIDv5; see "dedup" below
    source        TEXT NOT NULL,     -- 'crunchbase' | 'manual' | ... (last-writer provenance)
    source_id     TEXT,              -- the source's own id, if any (provenance only)
    name          TEXT NOT NULL,
    domain        TEXT,              -- normalized: no scheme, no www, no path
    headcount     INTEGER,
    funding_stage TEXT,
    location      TEXT,
    vertical      TEXT,
    raw_json      TEXT NOT NULL,     -- full original row, ordered by header
    ingested_at   DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Indexes on `name`, `location`, `headcount`, `vertical`. Headcount/vertical
indexes are speculative — drop if profiling says so.

`raw_json` is the escape hatch: anything the CSV exports that has no column is
preserved. Useful when a verdict looks wrong and you want the extra signal that
*was* in the row.

**Dedup.** `id` is a deterministic UUIDv5 (`store.CompanyID`) derived from the
company's *identity*: the normalized `domain`, or `'name:'+lower(name)` when
there's no domain. The same company always hashes to the same id, so the
primary key **is** the dedup key — ingest `INSERT ... ON CONFLICT(id) DO UPDATE`
collapses a re-ingest, and collapses the *same domain arriving from a different
source* into one row (last writer wins on the mutable columns). `(source,
source_id)` is kept only as provenance; it no longer constrains uniqueness.

---

### `enrichment` — cached site text
```sql
enrichment (
    company_id      TEXT PK FK companies(id) ON DELETE CASCADE,
    website_url     TEXT,             -- URL we successfully fetched
    website_summary TEXT,             -- stripped text, truncated
    fetch_status    TEXT NOT NULL,    -- see taxonomy below
    fetch_error     TEXT,             -- detail when status != ok
    fetched_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

One row per company, max. Index on `fetch_status`. The cache key is
`companies.ingested_at <= enrichment.fetched_at` — a re-ingest (newer
`ingested_at`) invalidates the row; `scout enrich --force` re-fetches
unconditionally.

Failed rows are kept (with `fetch_status` set) so we don't hot-loop on
permanently broken sites.

**`fetch_status` taxonomy:**

| Status | Meaning |
|---|---|
| `ok` | fetched, enough content to use |
| `low_content` | fetched but under the content floor (~200 runes — likely a JS/SPA shell) |
| `challenge` | page is a bot-challenge interstitial (Cloudflare/PerimeterX etc.) |
| `no_domain` | company has no domain to fetch |
| `http_<code>` | non-2xx HTTP response, e.g. `http_404`, `http_503` |
| `dns` | DNS resolution failed |
| `refused` | connection refused |
| `timeout` | request timed out |
| `error` | any other fetch error |

---

### `verdicts` — LLM decisions
```sql
verdicts (
    company_id      TEXT PK FK companies(id) ON DELETE CASCADE,
    verdict         TEXT NOT NULL,   -- 'yes' | 'maybe' | 'no'
    reason          TEXT NOT NULL,   -- one-line justification
    taste_version   TEXT NOT NULL,   -- criteria version (see below)
    model           TEXT NOT NULL,   -- scoring model, e.g. 'claude-haiku-4-5'
    scored_at       DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

One row per company — the current verdict. We don't keep verdict history; a
re-score overwrites the row (`UpsertVerdict`, `ON CONFLICT DO UPDATE`). "What
did the user think before" lives in the brain. Indexes on `verdict` and
`taste_version`.

**`taste_version` is the criteria version** (legacy column name; the concept is
*the user's criteria from the brain* — see north-star's terminology table). It is
`sha256[:12]` of `playbook + "\n---taste---\n" + criteria text`, where the
criteria text is the distilled company-fit brief (or the offline `taste.md`
fallback). When the brain learns something — or the playbook is edited — the
hash changes, and the next `verdict` run re-scores rows whose stored
`taste_version` no longer matches. That re-scoring is intended.

---

### `job_postings` — links to postings

```sql
job_postings (
    id           TEXT PK,           -- uuid
    company_id   TEXT NOT NULL FK companies(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,     -- the posting link (final, post-redirect URL)
    title        TEXT,              -- optional label / extracted role title
    location     TEXT,              -- extracted by capture (M19)
    summary      TEXT,              -- 1-2 sentence role summary, extracted (M19)
    source       TEXT,              -- 'manual' | 'capture' (NULL reads as manual)
    fetch_status TEXT,              -- capture fetch taxonomy; NULL for manual adds
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    captured_at  DATETIME,          -- last agent-pass fill (M19)
    applied_at       DATE,          -- application lifecycle (M20); NULL = not applied
    response         TEXT,          -- 'screening' | 'interview' | 'offer' | 'rejected'
    outreach_count   INTEGER NOT NULL DEFAULT 0,
    last_outreach_at DATE,
    contacts         TEXT           -- outreach contacts (M21), free-form comma-separated
)
```

Links to actual job/role postings found at a company. Migrations `0011` +
`0019`. Two ways in: **by hand** from the triage detail pane (`AddPosting`,
source `manual` — url + optional title only), or **by link-capture**
(`UpsertCapturedPosting`, source `capture`): the user pastes a URL, and one
Haiku pass (`internal/capture`) classifies the page and extracts
title/location/summary. Capture is **idempotent by URL** — re-pasting a link
(or capturing a hand-added one) refreshes the same row in place rather than
duplicating; both the pasted and the final post-redirect URL are matched.

Unlike `enrichment`/`verdicts` (0..1 per company, keyed on `company_id`), this
is **one-to-many**: a company can have any number of postings, so it gets its
own uuid `id` PK (like `runs`) plus an index on `company_id` (the company's
deterministic TEXT uuid).

**Application lifecycle (M20).** The jobs view doubles as the user's
application tracker (it replaced the external Notion one), so each posting
carries the lifecycle columns: `applied_at` (NULL = not applied; the checkbox
and its date are one nullable field), `response` (the furthest reply reached),
the outreach cadence (`outreach_count` + `last_outreach_at`), and `contacts`
(M21) — a free-form comma-separated list of outreach contacts ("Jane Doe
<jane@acme.com>, cto@…"; the UI renders email-shaped tokens as mailto links).
Set as full state via `UpdatePostingTracking` (`PUT /api/postings/{id}`);
response values are case-folded and validated, dates are bare ISO dates,
contacts are trimmed only. Outreach *message content* stays out of scout — see
the non-goals in `north-star.md`. `ListPostings` returns one company's postings newest-first;
`ListJobRows` joins every posting with its company's name/verdict/marks plus
the lifecycle columns for the UI's jobs view.

---

### `runs` — pipeline run history
```sql
runs (
    id            TEXT PK,           -- uuid
    stage         TEXT NOT NULL,     -- 'ingest' | 'enrich' | 'verdict'
    status        TEXT NOT NULL,     -- 'running' | 'done' | 'failed' | 'canceled'
    started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at   DATETIME,          -- NULL while running
    taste_version TEXT,              -- set for verdict runs only
    summary       TEXT,              -- JSON: stage-specific counts
    error         TEXT               -- set on failure
)
```

A durable record of each pipeline run triggered from the UI (or CLI). Migration
`0005`. `InsertRun` writes the `running` row when a background job starts;
`FinishRun` sets the terminal `status`, `finished_at`, and a JSON `summary`
(e.g. verdict counts). Live progress lines stream over SSE and are *not*
persisted — only the summary lands here. `ListRuns` powers the UI run history,
newest first. Indexes on `started_at` and `stage`.

---

### `verdict_trace` — decision trail (append-only)

```sql
verdict_trace (
    id              INTEGER PK AUTOINCREMENT,
    company_id      TEXT NOT NULL FK companies(id) ON DELETE CASCADE,
    run_id          TEXT,              -- UI run uuid; NULL for CLI runs
    model           TEXT NOT NULL,
    taste_version   TEXT NOT NULL,     -- criteria version that drove this pass
    criteria_source TEXT,              -- where 'what the user wants' came from
    verdict         TEXT NOT NULL,
    reason          TEXT NOT NULL,
    scored_at       DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Migration `0012`. Unlike every other company-scoped table, this one is
**append-only** — one row per verdict scoring pass, written by the scorer
(`scoreOne` → `writeTrace`) via `InsertVerdictTrace`. It is the answer to "*why
did this company get this verdict?*": it records which criteria drove the
decision (`criteria_source` + `taste_version`), which `model` scored it, and the
resulting `verdict` + `reason`. There is no per-company brain Q&A here — the
brain's only contribution to a verdict is the user's criteria, captured by the
source/version pair. `CompanyTrace(company_id)` reads it oldest-first to power
the UI's "Decision trail" panel (`GET /api/companies/:id/trace`).

Because it appends, it keeps history the `verdicts` snapshot throws away: each
re-score (new criteria version, or a forced run) adds a row, so you can watch a
company's verdict move as the criteria or playbook change — the prior verdicts
are still there, not overwritten. Writes are best-effort: a trace failure is
logged and never fails the verdict. Indexes on `(company_id, scored_at)` and
`run_id`.

A row holds the verdict provenance (source, version, model) but **not** the full
prompt or raw model response — it's a decision trail, not a request log. At
low-thousands of companies × a few re-scores that's single-digit MB.

---

### `brain_profile_cache` — local cache of the brain profile

```sql
brain_profile_cache (
    source_url   TEXT PK,              -- the brain base URL the profile came from
    body         TEXT NOT NULL,        -- the resolved criteria text (fact-derived block)
    content_hash TEXT NOT NULL,        -- stable change-detection / version key (distill basis hash, not the body)
    fetched_at   DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Migration `0013`. One row per brain URL — the last distilled company-fit brief
scout produced from that brain, cached locally so a verdict run (or the web
server) doesn't re-distill on every invocation. Read by the `internal/criteria`
resolver: a row younger than `--brain-cache-ttl` (default 6h) is reused as-is;
older, the resolver re-distills (recall + synthesis) and overwrites the row, and
only when the brain is unreachable (or distillation fails) does it fall back to
the stale cached row (then to offline `taste.md`). This is a **disposable cache,
not a system-of-record** — the brain
remains the source of truth; deleting the row just forces a refetch. Like
`runs`, it is **standalone** — no company FK, no cascade.

---

### `schema_migrations` — migration ledger
```sql
schema_migrations (name TEXT PK, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)
```

One row per applied migration filename. The `migrate()` loop in
`internal/store/store.go` skips anything already recorded.

## Relationships

```
companies (1) ─── (0..1) enrichment
          (1) ─── (0..1) verdicts
          (1) ─── (0..N) job_postings
          (1) ─── (0..N) verdict_trace   -- append-only; one row per scoring pass

runs                 -- standalone; no FK to companies (run-level history)
brain_profile_cache  -- standalone; no FK to companies (one row per brain URL)
```

`FOREIGN KEY ... ON DELETE CASCADE` on every company-scoped table. Delete a
company and its `enrichment`/`verdicts`/`job_postings`/`verdict_trace` rows go
with it. `runs` is independent of any company (the optional
`verdict_trace.run_id` is a loose tag, not an FK).

## Idempotency keys at a glance

| Stage | Idempotency key | Bust the cache by |
|---|---|---|
| ingest | `id` = UUIDv5(domain \| `name:`+name) | re-ingest is upsert; not really "bust" |
| postings | none (always inserts a new uuid row) | — |
| filter | n/a (read-only) | — |
| enrich | `companies.ingested_at <= enrichment.fetched_at` | re-ingest, or `--force` |
| verdict | `verdicts.taste_version == current criteria version` | brain learns / playbook edit / `taste.md` edit, or `--force` |
| verdict_trace | n/a — append-only, one row per scoring pass | never deduped; deleted only with its company |
| brain brief | `brain_profile_cache.fetched_at` within `--brain-cache-ttl` | TTL expiry, or `POST /api/profile/refresh` (re-distill) |

## Why not Postgres / per-stage tables / event sourcing

SQLite is plenty for low-thousand-row company sets. One file is the entire
working set; nuking it and starting over costs nothing. Per-stage tables would
add joins for no benefit at this size. Event sourcing would be the right shape
if scout needed to reconstruct *all* history — but it doesn't; the brain does.
Scout keeps only the current snapshot plus a thin `runs` log.

The one scoped exception is `verdict_trace`: an append-only decision trail for
the *verdict* stage only, added for testing/tuning the scoring (so you can see
which criteria source and version drove each verdict, with which model, and how
it decided). It's deliberately narrow — verdict provenance, not a general event
store — and it's disposable like the rest of the working set.
