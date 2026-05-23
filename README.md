# scout

A personal job-research pipeline. Ingests company data (Crunchbase + others), filters it against my own taste rules, asks an agent to verdict each survivor using context from [brainbot](https://github.com/stevenlaguardia/brainbot), and surfaces a small triage list. I take it from there.

Companion project to brainbot. Brainbot stores *who I am and what I want*. Scout uses that context to evaluate *what's out there*. Committed pipeline lives in Notion (separate Application Tracker).

## Why this exists

Job-board scrolling and Crunchbase filtering are search problems with a personal taste function. The taste function is too specific and too evolving to encode as static filters — but it's exactly the kind of thing an LLM with the right context can do well in batch.

Scout is the batch.

## The three-store split

Scout deliberately doesn't try to be a system of record. Data lives where it belongs:

| Store | Role | What lives here |
|---|---|---|
| **Scout SQLite** | Working set | Raw ingest, enrichment, agent verdicts. Disposable between runs. |
| **brainbot graph** | Memory | "Looked at Acme on 2026-05-22, dismissed — vertical exclusion." Episodes for future context. |
| **Notion Application Tracker** | Committed pipeline | The shortlist of companies I'm actually pursuing. Edited from phone. |

The handoff is manual by design: scout surfaces candidates, I decide what's worth tracking, the Notion tracker is the source of truth for anything past that line. Automating the handoff is a non-goal until I've done it enough times to know what the decision actually feels like.

## Status

Pre-architecture. PRD next, then build.

See [`PRD.md`](./PRD.md) for the product spec (in progress).

## Stack (tentative)

- **Go** — pipeline, parallel fetches, single binary, typed stages
- **SQLite** — working set (`modernc.org/sqlite`, pure-Go, no CGO)
- **Anthropic SDK (Go)** — agent verdicts
- **brainbot HTTP API** — context for "who is Alex"
- **Read-only web UI** — triage view served by the Go binary

## Repo layout (planned)

```
scout/
├── README.md
├── PRD.md
├── cmd/
│   └── scout/                  — CLI entrypoint
├── internal/
│   ├── ingest/                 — CSV / API loaders
│   ├── filter/                 — rule-based pre-filter (SQL)
│   ├── enrich/                 — parallel web fetch + scrape
│   ├── verdict/                — agent calls, brainbot context
│   └── store/                  — SQLite access
├── web/                        — triage UI (static + JSON endpoint)
└── migrations/                 — SQLite schema
```
