# Limitations & deferred work

Where scout is thin, where it breaks first, and what's deliberately deferred
until real-use data justifies building it. Architecture lives in
[`north-star.md`](./north-star.md); this is the honest-defects companion.

## Where the signal degrades

Enrich fetches one about-page per company, strips HTML with regex, and hands
the text to the verdict LLM. Three failure shapes leak in. The first two are
now *detected* and excluded from verdict candidates; the third is silent.

| Failure | Detection | What happens |
|---|---|---|
| JS-rendered SPA shell | `low_content` — stripped text < 200 runes | text cached for inspection; row excluded from verdict candidates |
| Bot challenge (Cloudflare/PerimeterX/Akamai) | `challenge` — boilerplate match on text < 1000 runes ("just a moment", "verify you are human", …) | row excluded from verdict candidates |
| Stale / wrong domain | `dns`, `http_404` — visible | excluded; no second-source cross-check |

`fetch_status` taxonomy: `ok`, `low_content`, `challenge`, `no_domain`,
`http_<code>`, `dns`, `refused`, `timeout`, `error`. Only `ok` rows reach the
verdict stage.

### The remaining hole: silent challenge pages

A challenge interstitial that is *long* (≥ 1000 runes of junk) or doesn't match
a known phrase still records `fetch_status: ok` and feeds garbage to the
verdict. The short/known case is caught; the long/novel case is not. New CDN
challenge templates need a new phrase in `challengePhrases`.

### Non-English about-pages

Fetch and strip work fine, and the LLM reads non-English content competently.
But the user's criteria and the playbook rubric are English-centric, so fit
reasoning on a non-English page is weaker. Edge case, not a blocker.

## Architectural cost we're paying

### Regex HTML stripping

Cheap, dependency-free, brittle by definition. Edge cases that bite:

- Malformed HTML with unbalanced tags: the non-greedy `<[^>]+>` rule handles
  most, but some pages leave residue (manifests as stray JS in the summary).
- Comments (`<!-- ... -->`) are not explicitly stripped. The opening/closing
  delimiters go through the catch-all tag rule, but multi-line comment *bodies*
  survive. Minor; hasn't bitten yet.

A real HTML parser would fix this at the cost of a dependency. Not worth it
until residue actually corrupts verdicts.

### SQLite single-writer

Enrich and verdict run sequentially over a single SQLite connection (one shared
`sqlite3` connection isn't thread-safe to share across threads). WAL helps, but
there's still a serial write point. Invisible at low thousands of rows; visible at
hundreds of thousands. The fix (a per-request/pooled connection layer) is
straightforward when the scale arrives.

### No stage-level API retry/backoff

The verdict and enrich stages add no retries of their own. A transient 5xx or
429 that exhausts the shared client's retries marks the row `failed`; the next
run picks it up. Fine for batch; wrong for interactive use.

### No structured logging

`print(...)` / `print(..., file=sys.stderr)` throughout. Fine for a one-person
tool; would need the `logging` module for anything multi-user or for log aggregation.

## What's deferred by design

Listed so they're not surprises — not a to-do list.

### Multiple ingest sources

Crunchbase CSV only. AngelList, YC, scraped lists, etc. wait until one source
runs clean end-to-end and the combined data model is clear. A new source is a
new file in `scout/ingest/` plus a `--source` value — not architecturally
hard.

### Careers / jobs-page enrichment

"Are they hiring the user's level?" is strong signal, deferred until verdict quality
with about-page-only is measured. If yes/no decisions are already good, careers
data is wasted complexity.

### Cross-run diffs ("what's new since last time")

Useful for regular runs against fresh CSVs, less so ad-hoc. The data exists
(`companies.ingested_at`, plus the durable `runs` table); a `scout diff --since
<ts>` would be small. Not built.

### Auto-promote / external pipeline writes

Explicit non-goal. Scout surfaces candidates and records a triage status;
committing to pursue one happens outside scout, on purpose — surfacing
candidates is cheap, committing to pursue one is not, and that friction is the
point.

## What would change at 10× scale

Hypothetical: 10k companies per CSV.

- **Enrich:** per-domain rate limiting (not per-worker) becomes worthwhile.
  Headless browsing would be painful at this rate; about-page-only stays the
  answer.
- **Verdict:** the Batch API (discounted async pricing) would roughly halve
  cost. Prompt caching is already on — the system block (contract + playbook +
  criteria) is cached across a run.
- **Storage:** SQLite still fine; WAL handles the write rate.
- **UI:** client-side sort/filter on a single 10k-row table still works;
  server-side pagination becomes nice-to-have past ~50k.

All knobs, no blockers.

## What's just plain missing

Wanted but unbuilt. Not blocking; worth being honest about.

- **A guided criteria-edit flow.** The UI editor writes `taste.md`/`playbook.md`
  (local files only — never the brain) and shows how many verdicts an edit makes
  stale, but there's no "preview which companies flip verdict" before saving.
- **A "why was this row dropped" lookup.** Filter reports aggregate drop
  reasons; it can't yet explain a single company's drop. Easy add.
- **An export command.** `scout export --format csv --filter verdict=yes` for
  handing off to other tools. Easy add.

## Tests

Scout is no longer untested. Coverage exists across the load-bearing packages:
`scout/brainbot`, `scout/taste`, `scout/verdict`, `scout/store`,
`scout/ingest`, `scout/enrich` (the suite lives in `tests/`, run with `pytest`).
The thinnest area is end-to-end pipeline coverage on a real Crunchbase CSV; unit
boundaries are covered.

## When to actually fix any of this

When real use surfaces the pain. Premature fixes cost more than the problems
they prevent. Keeping the surface area small (staged pipeline, SQLite, no
external writes) is exactly what keeps all of the above cheap to add later.
