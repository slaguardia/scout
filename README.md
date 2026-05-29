# scout

A personal **job-fit scorer**. Ingests company dumps (Crunchbase CSV), enriches
each from its website, and asks: *given everything the brain knows about Alex,
is this company worth his time?* It reasons with its own LLM and writes the
verdict back to the brain. Triage happens in a small local web UI; the shortlist
Alex commits to lives in Notion.

Companion to [brainbot](https://github.com/slaguardia/brainbot): **brainbot holds
the knowledge** (who Alex is, what he wants); **scout brings the intelligence**
(its LLM + a small playbook for *how* to judge). Scout is brainbot's canonical
example consumer.

→ **Architecture and how it all fits together: [`docs/north-star.md`](./docs/north-star.md).**

## Status

Pipeline + web control surface are built (ingest → filter → enrich → verdict →
triage, all drivable from the browser). The brain integration is being
re-pointed at the brain's live contract (`capture`/`recall`/`profile` over plain
HTTP/JSON) — see [`docs/brain-first-plan.md`](./docs/brain-first-plan.md).

## Quickstart

```bash
brew install go && go build -o scout ./cmd/scout
export ANTHROPIC_API_KEY=sk-ant-...

./scout serve          # the primary interface — drive everything from the browser
                       #   upload a CSV, enrich, verdict, triage at localhost:8765
```

The CLI stages (`ingest`, `filter`, `enrich`, `verdict`, `episodes`) still exist
as a secondary automation/debug surface, but the web UI is the way in.

## Stack

- **Go** — single binary, typed pipeline stages, parallel fetches
- **SQLite** — working set (`modernc.org/sqlite`, pure-Go, no CGO)
- **Anthropic Messages API** — verdicts (direct HTTP, no SDK)
- **the brain** — `capture`/`recall`/`profile` over HTTP for Alex's criteria
- **embedded web UI** — triage + control surface served by the Go binary
