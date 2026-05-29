# scout — Claude instructions

You're working in **scout**, Alex's personal **job-fit scorer**. Portfolio
project and a real tool he uses — both audiences matter.

## Architecture — read this first

**[`docs/north-star.md`](./docs/north-star.md) is canonical.** The one-line
model: the **brain** owns the knowledge (who Alex is, what he wants, his
rules); **scout** brings the intelligence (its own LLM + a `playbook.md` for
*how* to judge). Scout reads Alex's criteria from the brain, reasons over them,
and writes verdicts back. There is **no scout-local "taste"** — `taste.md` is an
offline fallback only; `taste.toml` is a purely mechanical pre-filter.

Then: [`docs/brain-first-plan.md`](./docs/brain-first-plan.md) (the current work)
and [`docs/`](./docs/) for stage references.

## Stack

Go · SQLite (`modernc.org/sqlite`, pure-Go, no CGO) · BurntSushi/toml ·
Anthropic Messages API (direct HTTP, no SDK) · the brain over HTTP/JSON.

## Posture

- Direct, blunt when useful. No hedging, no pep talks.
- Recommend with the tradeoff, in 2–3 sentences, on exploratory questions.
- Push back if you see something off. Silence is the failure mode.
- Never invent experience or capability for Alex.
- Prefer deleting dead content over leaving deprecation notices.

## Current state

- **Built:** the pipeline (ingest → filter → enrich → verdict → triage) and the
  full web control surface — run everything from the browser (CSV upload, live
  progress, run history), plus a brain-isolated playbook editor.
- **In flight:** re-pointing the brain client at the live contract
  (`capture`/`recall`/`profile`, HTTP) and making the brain the source of
  Alex's criteria. This is `docs/brain-first-plan.md`.

## What's next

Execute `docs/brain-first-plan.md`: brain-contract rewrite → brain-primary
intelligence → a real Crunchbase CSV run. `north-star.md` is the target; the
plan is the path. The CLI stays as a secondary surface; the web UI is primary.
