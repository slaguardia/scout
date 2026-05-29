# Architecture

> ⚠️ **Legacy — superseded by [`north-star.md`](./north-star.md).** This doc
> describes the taste-first build (local `taste.md` as the source of Alex's
> criteria, MCP brain client). The project is brain-first now: Alex's criteria
> come from the brain, not a local file. Read `north-star.md` for the canonical
> architecture; the package-layout notes below are still roughly accurate but
> the taste/brain framing here is stale.

## Shape

Single Go binary. SQLite for state. Six subcommands, each one stage of a
pipeline. Stages talk through the database, not through pipes — every stage
is restartable on its own and the DB is the only shared artifact.

```
cmd/scout/main.go            CLI entry. One flag.Parse per subcommand.
internal/
  store/                     SQLite open + migrations + per-table helpers.
  ingest/                    CSV → companies. Crunchbase column aliases.
  filter/                    taste.toml → SQL pre-filter (eval in Go).
  enrich/                    HTTP fetch + HTML strip → enrichment.
  taste/                     Load taste.md, compute taste_version.
  anthropic/                 Messages API client. No SDK.
  verdict/                   Filter survivors × enrichment → LLM → verdicts.
  brainbot/                  MCP JSON-RPC client for the brain (M5/M6).
  web/                       Embedded index.html + JSON endpoint.
```

No package imports another internal package outside its dependency direction:
`store` is the base, `enrich`/`verdict`/`web` depend on it, nothing depends
on `web` or `verdict`. `verdict` pulls together `store + filter + taste +
anthropic + brainbot` — it's the only multi-dependency package by design.

## The three-store split

Repeated from `CLAUDE.md` because it's load-bearing. Don't blur these.

| Store | Lives in | Role |
|---|---|---|
| **scout SQLite** | this repo | Working set. Raw ingest, enrichment, verdicts. Disposable between runs. |
| **brainbot graph** | `~/Repositories/brainbot/` | Memory. "Looked at Acme, dismissed — vertical exclusion." Episodes for future context. |
| **Notion Application Tracker** | driven by `~/Repositories/personal/scripts/tracker.py` | Committed pipeline. The shortlist Alex actually pursues. |

Scout never writes to Notion. Scout writes to brainbot only via the
`episodes` subcommand. Brainbot reads scout? No — scout reads brainbot's
taste context at verdict-time (M5). The handoff to Notion is manual.

## Data flow

```
1. ingest    CSV file              → companies (upsert by source, source_id)
2. filter    companies + taste.toml → in-memory survivor set + drop reasons
3. enrich    companies w/ domain   → enrichment row per company (one HTTP fetch)
4. verdict   survivors × enrichment → verdicts row per company (one LLM call)
5. serve     all 3 tables joined   → HTML/JSON UI on localhost
6. episodes  verdicts w/o sent row → brainbot POST → episodes_sent
```

Each stage is **idempotent**. Re-running ingest upserts; re-running enrich
skips rows whose enrichment is newer than the company's ingested_at;
re-running verdict skips rows whose taste_version matches the current
taste's hash; re-running episodes skips rows already in episodes_sent.

## What scout is *not*

Repeated from PRD §3 because every architectural decision falls out of it:

- **Not a system of record.** Notion is. Scout is the working set.
- **Not real-time.** Batch tool. Run on demand.
- **Not a job-board scraper.** Company-level only. Roles are out of scope.
- **Not auto-applying.** Surfaces candidates. Alex commits.
- **Not multi-user.** Single binary, single SQLite file, single user.

Every time the design felt like it wanted to grow into one of those, the
answer was to push the responsibility back to brainbot, Notion, or
tracker.py.

## Stage boundaries are CLI boundaries

You can run `ingest → filter → enrich → verdict → serve` as five separate
shells, days apart, against the same `scout.db`. The CLI is the API. There
is no daemon, no scheduler, no queue. If you want a daily refresh, wire
`launchd` or `cron` against the binary.

## Read order for reading the code

1. `internal/store/store.go` — embedded migrations, schema bootstrap.
2. `internal/store/migrations/*.sql` — the actual tables.
3. `cmd/scout/main.go` — top-down view of every subcommand.
4. `internal/verdict/verdict.go` — the only stage with real complexity (worker pool, prompt assembly, JSON parsing, idempotency check).
5. Everything else falls out from there.
