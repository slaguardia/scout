# scout — Claude instructions

You're working in **scout**, Alex's personal job-research pipeline. This is a portfolio project and a real tool he uses. Both audiences matter.

## What scout is

A Go CLI + (eventually) read-only web UI that ingests company dumps (Crunchbase CSV first), filters them against Alex's taste rules, asks an LLM to verdict each survivor, and surfaces a triage list. Alex manually promotes interesting ones to his Notion Application Tracker.

## The three-store split (don't blur these)

| Store | Role | What lives here |
|---|---|---|
| **scout SQLite** (this repo) | Working set | Raw ingest, enrichment, verdicts. Disposable. |
| **brainbot graph** (sibling repo `~/Repositories/brainbot/`) | Memory | "Looked at Acme, dismissed — vertical exclusion." Episodes. |
| **Notion Application Tracker** (driven by `~/Repositories/personal/scripts/tracker.py`) | Committed pipeline | The shortlist Alex actually pursues. |

Scout stores **inventory and verdicts**. Brainbot stores **judgments worth remembering**. Notion stores **commitments**. Don't try to make scout a system of record — that's not its job.

## Read these first

- [`README.md`](./README.md) — orientation, stack, repo layout
- [`PRD.md`](./PRD.md) — spec, locked decisions (§10), open questions (§11), milestones (§12)
- [`taste.toml`](./taste.toml) — structured filter rules; `verticals.allowed` is intentionally empty until Alex fills it

## Stack

Go 1.22 · SQLite (`modernc.org/sqlite`, pure-Go) · BurntSushi/toml · Anthropic Go SDK (later, M3)

## Milestones (from PRD §12)

1. **M1** ✅ scaffold — ingest + filter, no LLM
2. **M2** enrichment — parallel about-page fetch + summarize
3. **M3** verdict — Haiku call with static taste, results to SQLite
4. **M4** triage UI — read-only web view served by the Go binary
5. **M5** brainbot integration — replace static taste with live brainbot context
6. **M6** episode write-back — verdicts flow back into brainbot

## Posture (same as personal/)

- Direct, blunt when useful. No hedging, no pep talks.
- Recommend with the tradeoff, in 2–3 sentences, on exploratory questions.
- Push back if you see something off. Silence is the failure mode.
- Never invent experience or capability for Alex.

## What's done in M1

- Repo scaffolded, `go.mod` declared, schema migration embedded
- `scout ingest <csv>` — Crunchbase column aliases, raw_json preservation, upsert on `(source, source_id)`
- `scout filter` — applies `taste.toml`, prints survivors + drop-reason breakdown
- `scout stats` — row count

Alex needs to `brew install go && go mod tidy` before first run; Go wasn't installed at scaffold time.

## What's next

Pick up at **M2 enrichment**. About-page only. Parallel fetch with a worker pool. Cache in SQLite keyed by `company_id`. Re-run is a no-op unless `companies.ingested_at` is newer than `enrichment.fetched_at`.
