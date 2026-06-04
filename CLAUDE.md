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
- **Jobs view + link capture:** the UI has a companies | jobs tab; **Add by
  link** posts any URL to `POST /api/capture`, where a one-shot Haiku pass
  (`internal/capture`) classifies the page (job posting / company page / other)
  and extracts details. Postings land in `job_postings` (title, location,
  summary; idempotent by URL), unknown companies are created via
  `ingest.EnsureCompany` (source `capture`; ATS/job-board hosts rejected as
  identities), and a captured company page seeds the enrichment row from the
  fetched text. Unfetchable pages report their honest fetch status and write
  nothing.
- **Brain-first, done:** the brain is now a pgvector **document substrate**
  (graphiti is gone) — a librarian whose only consumer call is `GET /recall?q=&k=`,
  returning prose chunks `{heading, text, score, path}` (no polarity/strength
  tags). Scout's **distiller** (`internal/distill`) fans out a few company-fit
  recalls, dedups, then runs a two-step pass — classify each excerpt as COMPANY
  vs ROLE_OR_OTHER (quarantines role/career leak), then synthesize a
  **company-fit brief** (Hard dealbreakers / Strong preferences / Context, in
  prose) from the COMPANY items — on `--distill-model` (default Sonnet; verdict
  scoring stays on Haiku). The verdict engine reasons over that brief. The brief is cached locally in SQLite
  (table `brain_profile_cache`, freshness via `--brain-cache-ttl`, manual
  re-distill from the UI's Criteria panel); `taste.md` is the offline fallback
  when the brain is unreachable and the cache is gone. Scout must **not** call
  `/profile` or `/map` (owner-only) and never passes a `scope`. Distillation is
  **companies only** — role/title fit is a separate, later concern. `scout
  distill` prints the chunks + brief for tuning. Verdicts stay scout-local —
  never written to the brain. Default brain URL is `http://127.0.0.1:8100`. See
  `brainbot/plans/scout-migration.md` for the migration spec.

## What's next

A real **Crunchbase CSV run** end-to-end (blocked on the user downloading the
export — verify ingest column aliases against the real header first). The web UI
is the primary interface; the CLI is the secondary automation/debug surface.
`north-star.md` is the canonical architecture.
