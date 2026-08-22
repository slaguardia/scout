# Data model

scout's local SQLite working set. For *what* this store is and how it fits the
architecture (scout SQLite = a disposable working set plus the user's typed
**knowledge store**; the brain is an optional source of record that fills that
store), see [`north-star.md`](./north-star.md). This doc is just the schema.

SQLite, one file (`scout.db` by default). Migrations live in
`scout/store/migrations/` (`0001`–`0062`), ship inside the `scout` package,
apply in filename order on every `open_db()`, and are tracked in
`schema_migrations`.

Two pragmas, set on every connection: `foreign_keys=ON`, `journal_mode=WAL`. WAL because
most stages do bursts of writes and it handles that better
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

**Dedup.** `id` is a deterministic UUIDv5 (`store.company_id`) derived from the
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
did the user think before" lives in `verdict_trace` (below). Indexes on
`verdict` and `taste_version`.

**`taste_version` is the criteria version** (legacy column name; the concept is
*the user's company-fit criteria* — see north-star's terminology table). It is
`sha256[:12]` of `playbook + "\n---taste---\n" + criteria version`
(`criteria.hash_text`), where the criteria version is the hash of the typed
criteria doc (`criteria_doc`, below) when one is on file, else the brain brief's
basis hash from `brain_profile_cache`. When the criteria doc is edited, the
brain learns something, or the playbook is edited, the hash changes, and the
next `verdict` run re-scores rows whose stored `taste_version` no longer
matches. That re-scoring is intended.

---

### `job_postings` — links to postings

```sql
job_postings (
    id           TEXT PK,           -- uuid
    company_id   TEXT NOT NULL FK companies(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,     -- the posting link (final, post-redirect URL)
    title        TEXT,              -- optional label / extracted role title
    location     TEXT,              -- extracted by capture
    source       TEXT,              -- 'manual' | 'capture' (NULL reads as manual)
    fetch_status TEXT,              -- capture fetch taxonomy; NULL for manual adds
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    captured_at  DATETIME,          -- last agent-pass fill
    -- structured detail (M28), filled by the ATS resolver
    posted_at TEXT, employment_type TEXT, workplace_type TEXT,
    department TEXT, comp_range TEXT, description TEXT,
    -- application lifecycle
    application_status TEXT NOT NULL DEFAULT '', -- application axis (M51): configurable stage label; '' = none (replaced the M50 dated stage_history)
    application_status_at TEXT,      -- M56: when application_status last changed; bumped only on a real stage change (not outreach/notes); NULL = unchanged since M56
    outreach_status    TEXT NOT NULL DEFAULT '', -- reply axis (M48): configurable label; '' = none
    notes            TEXT,          -- M31: free-form, human-only scratchpad
    next_up_at       DATETIME,      -- M27: "next up for outreach" to-do; clears when a send is logged
    questions_status TEXT, questions_at DATETIME  -- M32: application-question detection
    -- NOTE: outreach_count + last_outreach_at + the free-form contacts blob were
    -- DROPPED in M51 (contact-tracking) — outreach is tracked per contact now (see
    -- contacts / outreach_log below); the posting's count/last are DERIVED from outreach_log.
)
```

Links to actual job/role postings found at a company. Migrations `0011` +
`0022`–`0024`. Two ways in: **by hand** from the triage detail pane (`add_posting`,
source `manual` — url + optional title only), or **by link-capture**
(`upsert_captured_posting`, source `capture`): the user pastes a URL, and one
Haiku pass (`scout/capture`) classifies the page and extracts
title/location/summary. Capture is **idempotent by URL** — re-pasting a link
(or capturing a hand-added one) refreshes the same row in place rather than
duplicating; both the pasted and the final post-redirect URL are matched.

Unlike `enrichment`/`verdicts` (0..1 per company, keyed on `company_id`), this
is **one-to-many**: a company can have any number of postings, so it gets its
own uuid `id` PK (like `runs`) plus an index on `company_id` (the company's
deterministic TEXT uuid).

**Application lifecycle.** The jobs view doubles as the user's application
tracker (it replaced the external Notion one), so each posting carries two
independent single-label axes — `application_status` (M51, the furthest
application stage reached; it replaced the M50 dated `stage_history`) and
`outreach_status` (M48, the reply state) — each a configurable label ('' = none;
vocabularies in the `application_stages` / `outreach_statuses` settings). Set as
full state via `UpdatePostingTracking` (`PUT /api/postings/{id}`), alongside
`notes`. The application axis also carries `application_status_at` (M56), a single
timestamp bumped only when `application_status` moves to a new value — an
outreach- or notes-only save through the same call leaves it untouched (SQLite
evaluates the `CASE` against the pre-update row). Surfaced in the jobs table
(under the stage select) and the pursuit panel ("since …"). Outreach *message
content* stays out of scout — see the non-goals in `north-star.md`.

**Per-contact outreach + follow-ups (M51).** Outreach is tracked per person, not
as a posting-level count:

```sql
contacts (
    id          TEXT PK,           -- uuid
    company_id  TEXT NOT NULL FK companies(id) ON DELETE CASCADE,
    name TEXT, role TEXT, email TEXT,   -- a name or an email is required
    archived_at DATETIME,          -- soft-delete; NULL = active
    created_at DATETIME, updated_at DATETIME
)   -- UNIQUE(company_id, email) WHERE email <> ''  (email is the per-company identity)

outreach_log (
    id               INTEGER PK,   -- autoincrement
    contact_id       TEXT NOT NULL FK contacts(id) ON DELETE CASCADE,
    posting_id       TEXT NOT NULL FK job_postings(id) ON DELETE CASCADE,
    sent_at          DATE NOT NULL DEFAULT (DATE('now')),
    body             TEXT,         -- M53: the actual email sent (for the history + {{last_message}})
    note             TEXT,
    followup_due_at  DATE,         -- NULL = no follow-up wanted
    followup_done_at DATETIME,     -- NULL = still pending
    created_at       DATETIME
)
```

Contacts are **company-level** (one recruiter reused across that company's
roles). Each send is one immutable `outreach_log` row; the follow-up rides the
send — the active follow-up for a (contact, posting) thread is simply the
**latest** send's, until it's marked done or superseded by a newer send. A send
auto-arms `followup_due_at` to `sent_at + N business days` (the
`followup_interval_days` setting, default 5; 0 = off) unless an explicit date or
`no_followup` is passed. The posting's `outreach_count` / `last_outreach_at`
(and the jobs view's `followups_due` badge) are **derived** from this table.
Stores: `scout/store/contacts.py`. Endpoints: `GET/POST
/api/companies/{id}/contacts`, `PUT/DELETE /api/contacts/{id}`, `GET/POST
/api/postings/{id}/outreach-log`, `PUT/DELETE /api/outreach-log/{id}`,
`GET/PUT /api/followup-interval`. The legacy posting-level `contacts` blob (M24)
was backfilled into this table and dropped.

**Follow-up template (M53).** A second singleton row in `outreach_template`
(key `followup`, alongside the email template's `default`), compiled-in default
`outreach.DEFAULT_FOLLOWUP_TEMPLATE`. Pure `{{var}}` substitution (no LLM holes) —
`{{contact_name}}`, `{{contact_role}}`, `{{role}}` (job title), `{{company}}`,
`{{last_sent}}`, `{{last_message}}` (the last send's body) — rendered client-side
for the per-contact "Follow up" copy-paste. Edited via `GET/PUT
/api/followup-template`.

`list_postings` returns one company's postings newest-first;
`list_job_rows` joins every posting with its company's name/verdict/marks plus
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
(`score_one` → `write_trace`) via `insert_verdict_trace`. It is the answer to "*why
did this company get this verdict?*": it records which criteria drove the
decision (`criteria_source` + `taste_version`), which `model` scored it, and the
resulting `verdict` + `reason`. `criteria_source` is the resolved
`criteria.Block.source` — `local:criteria + playbook` (the typed doc) or
`brain:brief@<url> + playbook` (the distilled brief). There is no per-company
brain Q&A here — the brain's only possible contribution to a verdict is the
user's criteria, captured by the source/version pair. `company_trace(company_id)`
reads it oldest-first to power the UI's "Decision trail" panel
(`GET /api/companies/:id/trace`).

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

### `criteria_doc` — the typed company-fit criteria

```sql
criteria_doc (
    key        TEXT PK,                -- singleton: 'default'
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Migration `0062`. The criteria the user types in Settings → Knowledge →
Criteria — a DB singleton on the `playbook` pattern (same shape; store
`scout/store/criteria_doc.py`, `get_criteria_doc` / `put_criteria_doc`). A
**non-empty doc is the criteria, outright**: `criteria.Resolver.resolve()`
returns it as a `Block` with `source = "local:criteria"` before any brain call —
no `/changes` probe, no health check, no distill — and leaves
`brain_profile_cache` untouched. Empty → the brain cascade under
`brain_profile_cache` below. Edited via `GET/PUT /api/criteria`; a PUT re-folds
the active criteria version (`AppState.reload_taste`), so a criteria edit
changes `taste_version` exactly like a playbook edit does and the next verdict
run re-scores. This is the user's own writing, not a cache — nuking the DB
loses it. Standalone — no company FK.

---

### `outreach_sources` — the outreach knowledge store

```sql
outreach_sources (
    need        TEXT NOT NULL,         -- 'experience' | 'voice' | 'logistics'
    page_id     TEXT NOT NULL,         -- brain stable page id, or 'local' for the typed doc
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',  -- whole-document text
    version     TEXT NOT NULL DEFAULT '',  -- brain page version; '' for the typed doc
    resolved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    origin      TEXT NOT NULL DEFAULT 'brain',  -- M61: 'brain' | 'local'
    PRIMARY KEY (need, page_id)
)
```

Migrations `0035` + `0061`. The prose docs the outreach engine and the answers
drafter reason over, keyed by knowledge need (`outreach.KNOWLEDGE_NEEDS`:
experience — hard, the honesty checker's ground truth; voice and logistics —
soft). Two origins share the table:

- **`origin = 'local'`** — the doc typed in Settings → Knowledge, at most one
  per need, always `page_id = 'local'`. Written by `put_local_source`
  (`PUT /api/knowledge/{need}`); blank content deletes the row, so "never
  typed" and "cleared" look the same to every reader.
- **`origin = 'brain'`** — the pages the discovery pass (`outreach.discover`:
  Haiku over the brain `/map`, whole-fetched via `/doc`) bound to the need.
  Re-synced by `outreach.ensure_knowledge` only when the brain's `/changes`
  moved past the cursor stored in the `outreach_knowledge_cursor` setting.

The one rule: **a sync never touches a local row.** `replace_outreach_sources`
deletes and re-inserts only the need's `origin = 'brain'` rows, so a typed doc
survives every sync. The reader `outreach_knowledge(con, need)` concatenates
the typed doc **first**, then the brain pages by title (`# title` headers,
`---` separators) — which is how the writer, humanizer, honesty checker and
answers drafter all get both without code of their own. `ErrNoExperience` is
raised over that merged bundle at draft/answer time
(`outreach.require_experience`); an empty experience pick is a valid discovery
outcome, not an error. `GET /api/knowledge/{need}` returns the typed content
plus the need's brain rows; `GET /api/outreach/sources` lists every row with its
`origin`. Standalone — no company FK.

---

### `brain_profile_cache` — local cache of the brain's brief

```sql
brain_profile_cache (
    source_url   TEXT PK,              -- the brain base URL the profile came from
    body         TEXT NOT NULL,        -- the distilled company-fit brief
    content_hash TEXT NOT NULL,        -- stable change-detection / version key (distill basis hash, not the body)
    fetched_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    cursor       TEXT NOT NULL DEFAULT '',  -- M37: the brain's opaque /changes stamp at the last confirmed-current check
    verified_at  TEXT                       -- M37: when the brief was last confirmed current against the brain
)
```

Migrations `0013` + `0037`. One row per brain URL — the last distilled
company-fit brief scout produced from that brain, cached locally so a verdict
run (or the web server) doesn't re-distill on every invocation. Read by the
`scout/criteria` resolver **only when `criteria_doc` is empty** (a typed doc
returns before any brain call). Then the change-aware cost cascade runs:
Tier 0 asks the brain's `/changes` whether anything moved since `cursor`
(nothing → serve the row verbatim, re-stamp `verified_at`); Tier 1 re-runs the
recall gather and compares the basis hash against `content_hash` (unchanged →
serve verbatim, advance the cursor); Tier 2 re-synthesizes and overwrites the
row. No row, or a row without a cursor, is a cold full distill. When the brain
is unreachable the cached row is served while `verified_at` (else `fetched_at`)
is within `--brain-cache-ttl` (default 6h); past that ceiling — or with nothing
usable at all (no brain configured, or a healthy brain with no company-fit
pages and no cached row) — the resolver raises `criteria.ErrNoCriteria` and the
verdict run fails loudly rather than scoring against nothing. This is a
**disposable cache, not a system-of-record** — the brain remains the source of
truth for its brief; deleting the row just forces a refetch. Like `runs`, it is
**standalone** — no company FK, no cascade.

---

### `schema_migrations` — migration ledger
```sql
schema_migrations (name TEXT PK, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)
```

One row per applied migration filename. The `_migrate()` loop in
`scout/store/db.py` skips anything already recorded.

## Relationships

```
companies (1) ─── (0..1) enrichment
          (1) ─── (0..1) verdicts
          (1) ─── (0..N) job_postings
          (1) ─── (0..N) verdict_trace   -- append-only; one row per scoring pass

runs                 -- standalone; no FK to companies (run-level history)
criteria_doc         -- standalone; singleton (the typed company-fit criteria)
outreach_sources     -- standalone; keyed (need, page_id); origin 'local' | 'brain'
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
| verdict | `verdicts.taste_version == current criteria version` | criteria doc edit / playbook edit / brain learns, or `--force` |
| verdict_trace | n/a — append-only, one row per scoring pass | never deduped; deleted only with its company |
| criteria doc | n/a — singleton, typed; wins over the brain brief whenever non-empty | blank it (falls through to the brain brief, else `ErrNoCriteria`) |
| brain brief | `brain_profile_cache.cursor` unchanged per the brain's `/changes` (only consulted when `criteria_doc` is empty) | the brain moves with a changed basis (Tier 2), or `POST /api/profile/refresh` (re-distill); `--brain-cache-ttl` only caps how long an *unverifiable* row is served |
| outreach knowledge | `outreach_knowledge_cursor` setting unchanged per the brain's `/changes` | the brain moves (re-discover; replaces `origin = 'brain'` rows only — typed rows are never busted) |

## Why not Postgres / per-stage tables / event sourcing

SQLite is plenty for low-thousand-row company sets. One file is the entire
working set; nuking it and starting over costs nothing — except the typed
knowledge docs (`criteria_doc` + the `origin = 'local'` rows of
`outreach_sources`), which are the user's own writing, not a rebuildable cache.
Per-stage tables would add joins for no benefit at this size. Event sourcing
would be the right shape if scout needed to reconstruct *all* history — but it
doesn't; `verdict_trace` keeps the one trail that matters. Scout keeps only the
current snapshot plus a thin `runs` log.

The one scoped exception is `verdict_trace`: an append-only decision trail for
the *verdict* stage only, added for testing/tuning the scoring (so you can see
which criteria source and version drove each verdict, with which model, and how
it decided). It's deliberately narrow — verdict provenance, not a general event
store — and it's disposable like the rest of the working set.
