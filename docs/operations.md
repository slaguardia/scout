# Operations

How to actually run scout. Flags, env, and what to do when something goes
sideways.

## Prerequisites

- Go 1.22+ (1.26+ on dev machines is fine).
- `ANTHROPIC_API_KEY` for `scout verdict`. Nothing else needs auth.

## First-run

```bash
brew install go
cd ~/Repositories/scout
go mod tidy
go build -o scout ./cmd/scout
```

The migrations are embedded; the first `scout <anything>` call creates
`scout.db` and runs them.

## A typical pipeline run

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# 1. Drop the CSV into the DB.
./scout ingest data/crunchbase-export.csv
# read=423 upserted=423 skipped=0 errors=0

# 2. Sanity-check the pre-filter.
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

# 4. Score with Haiku.
./scout verdict
# taste source=file:taste.md version=b4cd783174d6
# considered=71 scored=71 skipped=0 failed=0
#   maybe 18
#   no    35
#   yes   18

# 5. Triage in the browser.
./scout serve
# scout triage UI at http://localhost:8765

# 6. (Optional, when brain is up) ship verdicts as episodes.
./scout episodes --brainbot http://127.0.0.1:8000
```

Re-running any stage is safe. Re-running everything is also safe — each
stage skips work it's already done.

## Flag reference

### Global

Every subcommand accepts `--db <path>`, default `scout.db`.

### `scout ingest <csv>`

| Flag | Default | What |
|---|---|---|
| `--source` | `crunchbase` | Source tag stored on each row. Use this to distinguish multiple CSV vintages. |

### `scout filter`

| Flag | Default | What |
|---|---|---|
| `--taste` | `taste.toml` | Path to the structured rules file. |

### `scout enrich`

| Flag | Default | What |
|---|---|---|
| `--workers` | `8` | Parallel fetchers. |
| `--timeout` | `12s` | Per-request timeout. |
| `--force` | `false` | Re-fetch every company even if cached. |

### `scout verdict`

| Flag | Default | What |
|---|---|---|
| `--taste` | `taste.toml` | Structured rules (for the pre-filter step inside this subcommand). |
| `--taste-md` | `taste.md` | Narrative taste block fed to the model. |
| `--brainbot` | `""` | If set, pull taste from this brain URL (e.g. `http://127.0.0.1:8000`) via MCP `search_memory_facts`; fall back to `--taste-md` on error. |
| `--model` | `claude-haiku-4-5` | Anthropic model ID. |
| `--workers` | `4` | Parallel API calls. |
| `--force` | `false` | Re-score every survivor even if `taste_version` matches. |

### `scout episodes`

| Flag | Default | What |
|---|---|---|
| `--brainbot` | `$BRAINBOT_URL` | Required. Brain base URL (e.g. `http://127.0.0.1:8000`). Scout calls `POST {URL}/mcp` for `add_memory`. |

### `scout serve`

| Flag | Default | What |
|---|---|---|
| `--addr` | `:8765` | Listen address. |

## Environment

| Var | Used by | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | `verdict` | Yes for verdict. |
| `BRAINBOT_URL` | `episodes` | Yes for episodes unless `--brainbot` is passed. |

Nothing else.

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
Run `sqlite3 scout.db "SELECT company_id, fetch_status, fetch_error FROM enrichment WHERE fetch_status != 'ok'"`.

**Verdict says `considered=0`**
Either no survivors (check `scout filter`), or no `ok` enrichment for the
survivors (check `scout enrich`), or everything is already scored at the
current `taste_version` (which means scout is doing its job — use
`--force` if you want to re-score anyway).

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
> SELECT taste_version, COUNT(*) FROM verdicts GROUP BY taste_version;
```

## Tearing down

```bash
rm scout.db scout.db-wal scout.db-shm   # nukes the working set
```

Brainbot and the Notion tracker are untouched.

## Running it on a schedule

There's no daemon. If you want a daily cron:

```cron
# Re-score whatever's new, every morning at 9am.
0 9 * * *  cd ~/Repositories/scout && ./scout enrich && ./scout verdict
```

But really — scout is a "run when you have a new CSV" tool. Cron is
overkill for v1.
