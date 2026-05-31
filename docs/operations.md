# Operations

How to actually run scout. Flags, env, and what to do when something goes
sideways. For *what scout is* and the brain/scout split, see
[`north-star.md`](./north-star.md) — this doc is purely operational.

## Prerequisites

- Go 1.22+ (1.26+ on dev machines is fine).
- `ANTHROPIC_API_KEY` for scoring (the `verdict` stage, including UI-triggered
  runs).
- The brain on `http://127.0.0.1:8100` if you want live criteria (read-only).
  **Optional** — scout caches the last profile it fetched and falls back to
  `taste.md` when the brain is unreachable and the cache is gone.

## First-run

```bash
brew install go
cd ~/Repositories/scout
go mod tidy
go build -o scout ./cmd/scout
```

The migrations are embedded; the first `scout <anything>` call creates
`scout.db` and runs them (currently through `0013`).

## The normal way in: the browser

`scout serve` is the primary interface. Everything below the CSV — ingest,
enrich, verdict — runs from there as background jobs with live progress, plus
triage and the Criteria panel (view/refresh the brain profile, or edit the
`taste.md` fallback) with the always-editable playbook.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./scout serve
# scout triage UI at http://localhost:8765
```

Then in the browser: upload a CSV, run the stages, triage the results. The
brain defaults to `http://127.0.0.1:8100`; pass `--brainbot ""` to disable it
(criteria fall back to `taste.md`).

## A CLI pipeline run

The same stages, headless — for automation or debugging.

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# 1. Drop the CSV into the DB.
./scout ingest data/crunchbase-export.csv
# read=423 upserted=423 skipped=0 errors=0

# 2. Sanity-check the mechanical pre-filter.
./scout filter
# ... survivor table ...
# total=423 survivors=87
# dropped by:
#   funding_stage         12
#   headcount_max          4
#   location              198
#   vertical_excluded     122

# 3. Fetch about-pages.
./scout enrich
# considered=87 fetched=87 ok=71 failed=16

# 4. Score with Haiku. Criteria come from the brain (@127.0.0.1:8100) when
#    healthy (cached locally), else taste.md.
./scout verdict
# taste source=brain:profile@http://127.0.0.1:8100 version=b4cd783174d6
# considered=71 scored=71 skipped=0 failed=0
#   maybe 18
#   no    35
#   yes   18

# 5. Triage in the browser.
./scout serve
# scout triage UI at http://localhost:8765
```

Re-running any stage is safe. Each stage skips work it's already done.

## How scoring resolves criteria

```
scout verdict
   │
   ├─ fresh cached profile? (age < --brain-cache-ttl, default 6h) → use it
   │
   ├─ else --brainbot set (default :8100) and healthy?
   │     ├─ yes → GET /profile facts → render grouped criteria block
   │     │        (gates, preferences, context; tagged by polarity/strength)
   │     │        ↳ cache it locally (brain_profile_cache), then use it
   │     │        ↳ empty? fall back to taste.md
   │     └─ no/unreachable → stale cached profile if any, else taste.md  (logged)
   │
   └─ score with Haiku + playbook → write {verdict, reason} to SQLite
```

The brain is touched in exactly one place — reading `/profile` for the user's
criteria, cached locally (TTL) so repeated runs don't refetch. There is no
per-company brain query.

Verdicts are written to scout's SQLite and nowhere else — the brain is
read-only for scout. The **criteria version** (`taste_version` in the schema) is
`sha256[:12]` of the playbook + criteria text. When the brain learns something,
the criteria change, the version changes, and the next run re-scores. That's
intended.

## Flag reference

### Global

Every subcommand accepts `--db <path>`, default `scout.db`.

### `scout ingest <csv>`

| Flag | Default | What |
|---|---|---|
| `--source` | `crunchbase` | Source tag stored on each row. Distinguishes CSV vintages. |

### `scout filter`

| Flag | Default | What |
|---|---|---|
| `--taste` | `taste.toml` | Path to the mechanical pre-filter rules. |

### `scout enrich`

| Flag | Default | What |
|---|---|---|
| `--workers` | `8` | Parallel fetchers. |
| `--timeout` | `12s` | Per-request timeout. |
| `--force` | `false` | Re-fetch every company even if cached. |

### `scout verdict`

| Flag | Default | What |
|---|---|---|
| `--taste` | `taste.toml` | Mechanical pre-filter rules (the SQL gate inside this stage). |
| `--taste-md` | `taste.md` | Offline criteria fallback, used only when the brain is unreachable or empty. |
| `--playbook` | `playbook.md` | Scout's how-to-decide manual. Folded into the criteria version, so editing it re-scores. Optional. |
| `--brainbot` | `http://127.0.0.1:8100` | Brain base URL (HTTP). Read-only source of the user's criteria (`/profile`). **Empty disables** → `taste.md` fallback. |
| `--brain-cache-ttl` | `6h` | How long a cached brain profile stays fresh before the resolver refetches `/profile`. |
| `--model` | `claude-haiku-4-5` | Anthropic model for scoring. |
| `--workers` | `4` | Parallel API calls. |
| `--force` | `false` | Re-score every survivor even if the criteria version matches. |

### `scout serve`

| Flag | Default | What |
|---|---|---|
| `--addr` | `:8765` | Listen address. |
| `--taste-md` | `taste.md` | Offline criteria fallback; editable in the UI (writes the **local file only**, never the brain). |
| `--taste` | `taste.toml` | Mechanical pre-filter rules used by UI verdict runs. |
| `--playbook` | `playbook.md` | Scout's how-to-decide manual; editable in the UI (local file only). |
| `--source` | `crunchbase` | Source tag for UI CSV uploads. |
| `--brainbot` | `http://127.0.0.1:8100` | Brain base URL (read-only). Primary criteria source (`/profile`), viewable/refreshable in the UI's Criteria panel. Empty disables → `taste.md` fallback. |
| `--brain-cache-ttl` | `6h` | How long a cached brain profile stays fresh before a refetch (shared resolver). |

### `scout stats`

Row counts and the verdict histogram. Takes only `--db`.

## Environment

| Var | Used by | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | `verdict` (CLI and UI runs) | Yes for scoring. |

Nothing else. scout reads variables from the shell environment **or** a `.env`
file in the working directory (auto-loaded at startup; a real environment
variable wins over the file). `.env` is gitignored — the recommended place for
the key:

```bash
# .env  (project root, gitignored)
ANTHROPIC_API_KEY=sk-ant-...
```

## Troubleshooting

**`go: cannot find main module`**
You're not in the repo root. `cd ~/Repositories/scout`.

**Ingest reports `skipped=N` but you didn't expect it**
Rows with no `name` column value are skipped. The Crunchbase column
aliases live in `internal/ingest/csv.go`. If your CSV uses an exotic
header, either rename it or add an alias.

**Filter says `total=0 survivors=0` but the CSV ingested fine**
Sanity-check `taste.toml`. Common gotchas:
- `verticals.allowed` is non-empty AND your CSV uses different vertical names → nothing matches.
- `location.allowed` doesn't include "remote" but `remote_ok = false` → everyone with a remote location is dropped.

**Enrichment shows `failed=N` but no useful detail**
Each failure carries a `fetch_status`: `low_content`, `challenge`, `no_domain`,
`http_<code>`, `dns`, `refused`, `timeout`, or `error`. Inspect them:
```bash
sqlite3 scout.db "SELECT company_id, fetch_status, fetch_error FROM enrichment WHERE fetch_status != 'ok'"
```

**`brain unreachable at http://127.0.0.1:8100 ... falling back`**
Expected when the brain is down — the resolver serves a *stale* cached profile
if it has one, else `taste.md`, and scoring proceeds. If you want fresh criteria,
start the brain (or `POST /api/profile/refresh` from the UI); if you don't want
the brain at all, pass `--brainbot ""` to silence the probe. A *healthy but
empty* brain logs `no criteria captured yet` and also falls back to `taste.md`
until the user captures something.

**Verdict says `considered=0`**
Either no survivors (check `scout filter`), or no `ok` enrichment for the
survivors (check `scout enrich`), or everything is already scored at the
current criteria version — which means scout is doing its job. Use `--force`
to re-score anyway.

**`anthropic HTTP 401`**
Your `ANTHROPIC_API_KEY` is wrong or expired.

**`anthropic HTTP 429`**
Rate limited. Lower `--workers`, wait, retry. Failed rows are picked up on
the next run.

**`parse: no valid verdict JSON`**
Model returned something other than the requested JSON. Should be rare —
if it gets frequent, tighten the system prompt in
`internal/verdict/verdict.go::buildSystemPrompt`.

**Triage UI shows no rows after `verdict`**
The UI shows every company, not just scored ones. If you see nothing,
something is up with `scout.db`. Confirm `./scout stats`.

**Triage UI shows `unscored` for everyone**
You haven't run `scout verdict` yet, or it failed silently. Run again
with `--workers 1` and watch stderr.

## Inspecting the DB by hand

`scout.db` is plain SQLite. Use whatever:

```bash
sqlite3 scout.db
> .schema
> SELECT name, verdict, reason FROM companies c JOIN verdicts v ON v.company_id = c.id;
> SELECT fetch_status, COUNT(*) FROM enrichment GROUP BY fetch_status;
> SELECT taste_version, COUNT(*) FROM verdicts GROUP BY taste_version;   -- criteria version
> SELECT * FROM runs ORDER BY started_at DESC LIMIT 10;                  -- run history
```

## Tearing down

```bash
rm scout.db scout.db-wal scout.db-shm   # nukes the working set
```

The brain is untouched (scout only ever reads it).

## Running it on a schedule

There's no daemon. If you want a daily cron:

```cron
# Re-score whatever's new, every morning at 9am.
0 9 * * *  cd ~/Repositories/scout && ./scout enrich && ./scout verdict
```

But really — scout is a "run when you have a new CSV" tool. Cron is overkill.
