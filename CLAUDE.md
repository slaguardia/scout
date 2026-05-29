# scout — Claude instructions

You're working in **scout**, the user's personal **job-fit scorer**. Portfolio
project and a real tool they use — both audiences matter.

## Architecture — read this first

**[`docs/north-star.md`](./docs/north-star.md) is canonical.** The one-line
model: the **brain** owns the knowledge (who the user is, what they want, their
rules); **scout** brings the intelligence (its own LLM + a `playbook.md` for
*how* to judge). Scout reads the user's criteria from the brain (read-only) and
reasons over them; verdicts stay scout-local and are never written back to the
brain. There is **no scout-local "taste"** — `taste.md` is an offline fallback
only; `taste.toml` is a purely mechanical pre-filter.

Then [`docs/`](./docs/) for stage references (pipeline, verdict, enrichment,
data-model, operations, limitations).

## Stack

Go · SQLite (`modernc.org/sqlite`, pure-Go, no CGO) · BurntSushi/toml ·
Anthropic Messages API (direct HTTP, no SDK) · the brain over HTTP/JSON.

## Posture

- Direct, blunt when useful. No hedging, no pep talks.
- Recommend with the tradeoff, in 2–3 sentences, on exploratory questions.
- Push back if you see something off. Silence is the failure mode.
- Never invent experience or capability for the user.
- Prefer deleting dead content over leaving deprecation notices.

## Current state

- **Built:** the pipeline (ingest → filter → enrich → verdict → triage) and the
  full web control surface — run everything from the browser (CSV upload, live
  progress, run history), plus a brain-isolated playbook editor.
- **Brain-first, done:** scout speaks the brain's live HTTP contract
  (`profile`/`recall`, read-only); the brain is the primary source of the user's
  criteria (the episode bodies from `profile`), health-gated, with `taste.md` as
  the offline fallback. Per-company context comes from `recall`. Verdicts stay
  scout-local — never written to the brain. Default brain URL is
  `http://127.0.0.1:8100`.

## What's next

A real **Crunchbase CSV run** end-to-end (blocked on the user downloading the
export — verify ingest column aliases against the real header first). The web UI
is the primary interface; the CLI is the secondary automation/debug surface.
`north-star.md` is the canonical architecture.
