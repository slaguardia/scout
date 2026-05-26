# Limitations & deferred work

Honest accounting of where scout is thin, where it'll break first, and
what's deliberately deferred until real-use data justifies building it.

## What scout will actually do badly

### JS-rendered marketing sites

Sites that ship a near-empty HTML shell and render via JS get stripped to
nav chrome and "Loading..." and not much else. The verdict prompt still
runs, but with degraded signal — the LLM falls back on the Crunchbase
fields alone.

**Detection:** None today. A trivial heuristic ("if stripped text < 200
chars, flag as low-content") would help; not built.

**Fix:** Add a headless-browser path. Adds heavy deps (chromedp or
similar). Worth it only if a meaningful slice of survivors hit this case.

### Bot challenges

Cloudflare / PerimeterX / Akamai sometimes serve challenge pages instead
of content. Two failure shapes:

- Clean rejection → `http_403` or `http_429`. Visible.
- Silent challenge page → `fetch_status: ok` with junk text. **Invisible.**

The silent case is the worst — verdict runs with garbage input.

**Mitigation:** None today. Possible heuristics: keyword detection for
challenge boilerplate ("Just a moment..."), suspiciously short content
flag. Not built.

### Stale or wrong domains

Crunchbase domain data is sometimes stale (company moved, rebranded) or
typo'd. We get `dns` or `http_404` and move on. There's no cross-check
against a second source.

**Fix path:** Verify domains against a search engine before fetching.
Adds complexity and an external dep. Not done.

### Non-English about pages

The fetch works; the HTML strip works; the LLM is competent enough at
reading non-English content that this is usually fine. But the taste
block is in English and the rubric is English-centric. Edge case.

## What's deferred by design

These are explicitly punted in PRD §10/§11. They're listed so we know what
not to be surprised about, not as a to-do.

### Multiple ingest sources

CSV / Crunchbase only. AngelList, YC, scraped lists, etc. are deferred
until we have one source actually working end-to-end and know what the
combined data model wants to look like. Adding a new source is a new file
in `internal/ingest/` and a `--source` value; not architecturally hard.

### Careers / jobs page enrichment

"Are they hiring my level?" is huge signal. Deferred until verdict
quality with about-page only is measured. If yes/no decisions are
already fine, adding careers data is wasted complexity.

### Cross-run diffs ("what's new since last time")

Useful when running scout regularly against fresh CSVs, less so for ad-hoc
runs. Not built. The data is there (companies has `ingested_at`); a
`scout diff --since <ts>` would be ~20 lines.

### UI write-back for `status`

The schema has it (`new/reviewed/tracked/dismissed`). The UI doesn't write
it. Today, state changes happen via direct SQL or not at all. v2.

### Auto-promote to Notion

Explicit non-goal. The Notion handoff is manual on purpose — surfacing
candidates is cheap, committing to pursue one is not, and the friction is
useful.

## Architectural cost we're paying

### SQLite single-writer

Worker pools write to a single SQLite connection. WAL helps, but there's
still a per-connection serial point. At low thousands of rows this is
invisible; at hundreds of thousands you'd see it. Migration to a real
connection pool (or a `sql.DB` with `MaxOpenConns > 1`) is straightforward
when needed.

### Regex HTML stripping

Cheap, dependency-free, and brittle by definition. Edge cases that bite:
- `<` and `>` inside `<script>` strings that we strip wholesale: fine.
- Malformed HTML with unbalanced tags: regex non-greedy mode handles
  most, but some pages still leave residue. Manifests as JS source in
  the summary.
- Comments (`<!-- ... -->`) are NOT explicitly removed. They become spaces
  through the catch-all `<[^>]+>` rule, but their contents (if multi-line)
  survive. Minor issue, hasn't bitten yet.

### Verdict prompt assembly

Every call sends the full `taste.md` (~1.5 KB) plus the rubric. With 500+
companies that's 750 KB of redundant input per run.

**Fix:** Anthropic prompt caching with a cache control marker on the
system block. Cuts cost meaningfully at scale. Worth doing once verdict
runs get bigger.

### No retries on transient API failures

If Anthropic returns a 5xx, the row is marked `failed` and skipped. Next
run picks it up. Fine for batch, would be wrong for interactive use. Add
exponential backoff in `anthropic.Client.Send` if needed.

### No structured logging

`fmt.Println` and `fmt.Fprintf(os.Stderr, ...)`. Fine for a one-person CLI;
would need `log/slog` for anything multi-user.

## What would change at 10× scale

Hypothetical: scout runs against 10k companies per CSV.

- **Enrich:** parallelism tuning matters. Per-domain rate limiting (not
  per-worker) becomes worthwhile. Headless browser becomes painful at
  this rate; about-page-only stays the answer.
- **Verdict:** prompt caching becomes mandatory. Sonnet for the maybes
  starts to make sense (run Haiku on all, run Sonnet on maybes only).
  Batch API (Anthropic supports batch with discounted pricing) would cut
  cost ~50%.
- **Storage:** SQLite still fine. WAL handles the write rate.
- **UI:** client-side sort/filter on 10k rows still works (it's a single
  table). Server-side pagination becomes nice-to-have at 50k+.

None of those are blockers; all are knobs to turn when the scale arrives.

## What's just plain missing

Things we'd want but haven't built. Not blocking but worth being honest
about.

- **Tests.** Zero. The code is small and the contract is "does the
  pipeline work end-to-end on a sample CSV." For a personal tool, that's
  defensible — for anything else, write tests before extending.
- **A `scout taste edit` helper.** Today you edit `taste.md`/`taste.toml`
  by hand. A guided edit flow (preview which companies change verdict)
  would be cool.
- **A "why was this row dropped" lookup.** Filter shows aggregate drop
  reasons; doesn't tell you why a specific company was dropped. Easy add.
- **An export command.** `scout export --format csv --filter verdict=yes`
  for handing off to other tools. Easy add.

## When to actually fix any of this

When real use surfaces the pain. Premature fixes are worse than the
problems they prevent. The whole point of the architecture (CLI stages,
SQLite, manual Notion handoff) is to keep the surface area tiny so this
stuff stays cheap to add later.
