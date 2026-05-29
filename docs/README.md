# scout — docs

Start with **[north-star.md](./north-star.md)** — it's the canonical
architecture (what scout is, the brain-as-knowledge / scout-as-intelligence
split, the diagrams, the stores, the invariants). Everything else is reference.

| Doc | What it covers |
|---|---|
| [north-star.md](./north-star.md) | **Canonical. Start here.** Architecture, diagrams, the four verdict inputs, the stores, invariants. |
| [brain-first-plan.md](./brain-first-plan.md) | Execution plan to bring the code to the north star (brain-contract rewrite, brain-primary intelligence, real CSV run). |
| [pipeline.md](./pipeline.md) | Each subcommand in detail: inputs, behavior, idempotency. |
| [data-model.md](./data-model.md) | SQLite schema — every table and why it exists. |
| [verdict.md](./verdict.md) | The LLM call: prompts, parsing, versioning, model choice. |
| [enrichment.md](./enrichment.md) | About-page fetch, HTML strip, fetch-status taxonomy. |
| [operations.md](./operations.md) | Running it: flags, env vars, troubleshooting. |
| [limitations.md](./limitations.md) | Known limits and where it breaks first. |

Read order if you're new: **north-star → brain-first-plan → pipeline → verdict**.
