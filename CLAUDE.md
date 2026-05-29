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

## What's done (M1 → M6)

- **M1** — `scout ingest <csv>`, `scout filter`, `scout stats`, schema migrations embedded.
- **M2** — `scout enrich`: parallel about-page fetch (default 8 workers, 12s timeout), regex HTML strip, ~3000-rune summary cached in `enrichment` table. Idempotent: re-runs skip rows where `enrichment.fetched_at >= companies.ingested_at`.
- **M3** — `scout verdict`: Haiku via direct Anthropic /v1/messages call (no SDK dep), narrative taste from `taste.md`, JSON output parsed and persisted to `verdicts`. Idempotent by `(company_id, taste_version)`.
- **M4** — `scout serve`: localhost HTML + `/api/companies` JSON, embedded `index.html` with client-side sort/filter/search.
- **Brain integration** — in flight. Scout reads Alex's criteria from the brain
  (`profile`/`recall`, episode bodies) and writes verdicts back via `capture`,
  all over plain HTTP/JSON. See `docs/brain-first-plan.md`.
- **UI v2 + v3 + playbook** — done: detail pane, status write-back, stats
  sidebar, full control surface (run the pipeline from the browser, CSV upload,
  live progress, run history), and a brain-isolated playbook editor.

Architecture is in `docs/north-star.md` (the canonical doc): the brain owns the
knowledge of Alex; scout brings the intelligence (its LLM + the playbook). No
scout-local "taste" — the local file is an offline fallback only.

## What's next

**Execute `docs/brain-first-plan.md`** — point the brain client at the live
contract, make the brain the source of Alex's criteria, then land a real
Crunchbase CSV run. `docs/north-star.md` is the target; the plan is the path.
