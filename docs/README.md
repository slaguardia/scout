# scout — docs

Start with **[north-star.md](./north-star.md)** — it's the canonical
architecture (what scout is, the brain-as-knowledge / scout-as-intelligence
split, the diagrams, the stores, the invariants). Everything else is reference
and links back to it.

| Doc | What it covers |
|---|---|
| [north-star.md](./north-star.md) | **Canonical. Start here.** Architecture, diagrams, the four verdict inputs, the stores, invariants. |
| [pipeline.md](./pipeline.md) | Each command in detail: inputs, behavior, idempotency. The web UI (`scout serve`) is the primary interface. |
| [verdict.md](./verdict.md) | The LLM call: prompt assembly, brain-primary criteria, prompt caching. |
| [enrichment.md](./enrichment.md) | About-page fetch, HTML strip, fetch-status taxonomy. |
| [data-model.md](./data-model.md) | SQLite schema — every table and why it exists. |
| [operations.md](./operations.md) | Running it: flags, env vars, troubleshooting. |
| [limitations.md](./limitations.md) | Known limits and where it breaks first. |

Read order if you're new: **north-star → pipeline → verdict**.
