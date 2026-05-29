# scout

A personal **job-fit scorer**. Ingests company dumps (Crunchbase CSV), enriches
each from its website, and asks: *given everything the brain knows about the
user, is this company worth their time?* It reasons with its own LLM and writes
the verdict to its local store. Triage happens in a small local web UI, where
the user marks candidates reviewed / tracked / dismissed.

Companion to [brainbot](https://github.com/slaguardia/brainbot): **brainbot holds
the knowledge** (who the user is, what they want); **scout brings the intelligence**
(its LLM + a small playbook for *how* to judge). Scout is brainbot's canonical
example consumer.

→ **Architecture and how it all fits together: [`docs/north-star.md`](./docs/north-star.md).**

## Status

Pipeline + web control surface are built (ingest → filter → enrich → verdict →
triage, all drivable from the browser). The brain is wired as the primary
source of the user's criteria over plain HTTP/JSON (`profile`/`recall`, read
only), with `taste.md` as the offline fallback when the brain is unreachable.

## Quickstart

```bash
brew install go && go build -o scout ./cmd/scout
export ANTHROPIC_API_KEY=sk-ant-...

# The brain runs at http://127.0.0.1:8100 by default (and is on by default).
# If it's down, scout logs once and falls back to taste.md.
./scout serve          # the primary interface — drive everything from the browser
                       #   upload a CSV, enrich, verdict, triage at localhost:8765
```

The CLI stages (`ingest`, `filter`, `enrich`, `verdict`) still exist as a
secondary automation/debug surface, but the web UI is the way in.

## Stack

- **Go** — single binary, typed pipeline stages, parallel fetches
- **SQLite** — working set (`modernc.org/sqlite`, pure-Go, no CGO)
- **Anthropic Messages API** — verdicts (direct HTTP, no SDK)
- **the brain** — `profile`/`recall` over HTTP (read-only) for the user's criteria
- **embedded web UI** — triage + control surface served by the Go binary
