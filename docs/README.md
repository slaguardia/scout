# scout — docs

Reference docs for what scout is, how it works, and where it's thin. The
README is the elevator pitch; the PRD is the spec. These docs are for
anyone (mostly future-me) trying to understand or change the implementation.

## Index

| Doc | What it covers |
|---|---|
| [north-star.md](./north-star.md) | **Canonical. Start here.** What scout is, the brain-as-knowledge / scout-as-intelligence split, the four verdict inputs, the stores, invariants. |
| [brain-first-plan.md](./brain-first-plan.md) | Execution plan to bring the code to the north star (brain contract rewrite, brain-primary intelligence, real CSV run). |
| [pipeline.md](./pipeline.md) | Each subcommand in detail: inputs, behavior, outputs, idempotency rules. |
| [data-model.md](./data-model.md) | SQLite schema, every table and why it exists. |
| [verdict.md](./verdict.md) | The LLM call: prompts, parsing, versioning, model choice. |
| [enrichment.md](./enrichment.md) | How we fetch about-pages, strip HTML, and handle failure modes. |
| [operations.md](./operations.md) | Running it: flags, env vars, troubleshooting. |
| [limitations.md](./limitations.md) | Known limitations, deferred work, where it'll break first. |
| [ui-v2-prd.md](./ui-v2-prd.md) | PRD for the v2 triage UI: detail pane, status write-back, stats sidebar. (Shipped.) |
| [ui-v3-control-surface.md](./ui-v3-control-surface.md) | Driving the pipeline from the UI: job runner, CSV upload, live SSE progress, run history, brain-isolated taste/playbook editor. (Shipped.) |

## Quick mental model

```
Crunchbase CSV
    ↓
ingest  → companies (SQLite)
    ↓
filter  → survivors            ← taste.toml (structured rules)
    ↓
enrich  → enrichment (1 HTTP fetch per company)
    ↓
verdict → verdicts             ← taste.md / brainbot (narrative taste)
    ↓                            ← Anthropic Messages API (Haiku)
serve   → localhost triage UI
    ↓
episodes → brainbot            (write-back, M6)
    ↓
[manual] tracker.py add        (Notion Application Tracker)
```

Read in this order if you're new: **north-star → brain-first-plan → pipeline → verdict**.
The rest is reference.
