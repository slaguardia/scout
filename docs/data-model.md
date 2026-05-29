# Data model

scout's local SQLite working set. For *what* this store is and how it fits the
brain-first architecture (scout SQLite = disposable working set; the brain is
the system of record for the user), see [`north-star.md`](./north-star.md). This
doc is just the schema.

SQLite, one file (`scout.db` by default). Migrations live in
`internal/store/migrations/` (`0001`–`0007`), are embedded via `//go:embed`,
apply in filename order on every `Open()`, and are tracked in
`schema_migrations`.

Two pragmas, set in the DSN: `foreign_keys=ON`, `journal_mode=WAL`. WAL because
most stages do bursts of writes from worker pools and it handles that better
than the default rollback journal.

## Tables

### `companies` — the inventory
```sql
companies (
    id            INTEGER PK AUTOINCREMENT,
    source        TEXT NOT NULL,     -- 'crunchbase' | 'manual' | ...
    source_id     TEXT,              -- UUID from source, or 'name:<name>' fallback
    name          TEXT NOT NULL,
    domain        TEXT,              -- normalized: no scheme, no www, no path
    headcount     INTEGER,
    funding_stage TEXT,
    location      TEXT,
    vertical      TEXT,
    raw_json      TEXT NOT NULL,     -- full original row, ordered by header
    ingested_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_id)
)
```

Indexes on `name`, `location`, `headcount`, `vertical`. Headcount/vertical
indexes are speculative — drop if profiling says so.

`raw_json` is the escape hatch: anything the CSV exports that has no column is
preserved. Useful when a verdict looks wrong and you want the extra signal that
*was* in the row.

---

### `status` — review state
```sql
status (
    company_id INTEGER PK FK companies(id) ON DELETE CASCADE,
    state      TEXT NOT NULL DEFAULT 'new',  -- new | reviewed | tracked | dismissed
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Decoupled from ingest so re-ingest doesn't clobber review state. Seeded on first
upsert via `INSERT OR IGNORE`. Index on `state`.

The web UI writes this directly: the triage detail panel's status buttons
(`new`/`reviewed`/`tracked`/`dismissed`) `PUT` to the server, which calls
`SetStatus`. These states are scout-local triage markers only.

---

### `enrichment` — cached site text
```sql
enrichment (
    company_id      INTEGER PK FK companies(id) ON DELETE CASCADE,
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
    company_id      INTEGER PK FK companies(id) ON DELETE CASCADE,
    verdict         TEXT NOT NULL,   -- 'yes' | 'maybe' | 'no'
    reason          TEXT NOT NULL,   -- one-line justification
    taste_version   TEXT NOT NULL,   -- criteria version (see below)
    model           TEXT NOT NULL,   -- first-pass model, e.g. 'claude-haiku-4-5'
    scored_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    escalated_model TEXT             -- second-pass model, NULL if not escalated
)
```

One row per company — the current verdict. We don't keep verdict history; a
re-score overwrites the row (`UpsertVerdict`, `ON CONFLICT DO UPDATE`). "What
did the user think before" lives in the brain. Indexes on `verdict` and
`taste_version`.

**`taste_version` is the criteria version** (legacy column name; the concept is
*the user's criteria from the brain* — see north-star's terminology table). It is
`sha256[:12]` of `playbook + "\n---taste---\n" + criteria text`, where the
criteria text is the brain's episode bodies (or the offline `taste.md`
fallback). When the brain learns something — or the playbook is edited — the
hash changes, and the next `verdict` run re-scores rows whose stored
`taste_version` no longer matches. That re-scoring is intended.

**`escalated_model`** (migration `0004`) records the second-pass model that
re-scored a first-pass `maybe` (Sonnet escalation). `NULL` means no escalation
at the current `taste_version`. A first-pass upsert clears it to `NULL` (a
re-score invalidates any prior escalation). `MaybesNeedingEscalation` selects
`maybe` rows at the current `taste_version` whose `escalated_model` is `NULL` or
differs from the requested model, so escalation is idempotent per model.

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

### `schema_migrations` — migration ledger
```sql
schema_migrations (name TEXT PK, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)
```

One row per applied migration filename. The `migrate()` loop in
`internal/store/store.go` skips anything already recorded.

## Relationships

```
companies (1) ─── (0..1) status
          (1) ─── (0..1) enrichment
          (1) ─── (0..1) verdicts

runs            -- standalone; no FK to companies (run-level history)
```

`FOREIGN KEY ... ON DELETE CASCADE` on every company-scoped table. Delete a
company and its `status`/`enrichment`/`verdicts` rows go with it. `runs` is
independent of any company.

## Idempotency keys at a glance

| Stage | Idempotency key | Bust the cache by |
|---|---|---|
| ingest | `(source, source_id)` | re-ingest is upsert; not really "bust" |
| filter | n/a (read-only) | — |
| enrich | `companies.ingested_at <= enrichment.fetched_at` | re-ingest, or `--force` |
| verdict | `verdicts.taste_version == current criteria version` | brain learns / playbook edit / `taste.md` edit, or `--force` |
| escalate | `maybe` row not yet escalated to the requested model | new criteria version, or a different escalation model |

## Why not Postgres / per-stage tables / event sourcing

SQLite is plenty for low-thousand-row company sets. One file is the entire
working set; nuking it and starting over costs nothing. Per-stage tables would
add joins for no benefit at this size. Event sourcing would be the right shape
if scout needed to reconstruct history — but it doesn't; the brain does. Scout
keeps only the current snapshot plus a thin `runs` log.
