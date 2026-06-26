# Enrichment

How the `enrich` stage turns a domain into a chunk of text the verdict LLM can
read. Architecture context: [`north-star.md`](./north-star.md) — `enrich` is the
brain-free "fetch company site → text" stage.

Code: `scout/enrich/enrich.py`.

## Strategy

For each company with a non-empty domain, try these URLs in order:

1. `https://<domain>/about`
2. `https://<domain>/about-us`
3. `https://<domain>/company`
4. `https://<domain>/`

First 2xx HTML response wins. Body is read up to 512 KB, then stripped and
truncated to 3000 runes.

We always start with HTTPS. We don't fall back to HTTP — if a company ships
modern hardware in 2026 without TLS that's a signal in itself.

```
domain ──▶ /about ──▶ /about-us ──▶ /company ──▶ /
              │           │            │         │
              └───── first 2xx HTML wins ────────┘
                              │
              read ≤512 KB → strip HTML → truncate 3000 runes
                              │
              ┌───────────────┼───────────────┐
         challenge?      <200 runes?         else
              │               │               │
          challenge       low_content         ok
```

## HTML stripping

Regex-based, intentionally cheap. In order:

1. Remove `<script>...</script>` (case-insensitive, multiline).
2. Remove `<style>...</style>`.
3. Remove `<noscript>...</noscript>`.
4. Remove `<svg>...</svg>`.
5. Remove every remaining `<tag>` (and `</tag>`).
6. Decode common HTML entities (`&amp;`, `&lt;`, `&nbsp;`, smart quotes, em-dash, etc).
   Unknown entities become spaces.
7. Collapse runs of whitespace to a single space.
8. Truncate to 3000 runes (then append `…` if truncated).

That gives us the visible page text, navigation chrome and all. The LLM sorts
out signal from noise.

**Why not a real HTML parser?**

- Adds a dependency (a real HTML parser).
- The output is fed to an LLM that's better at salience than any tag-based
  extractor we'd write.
- Failure mode is "extra noise in the prompt," not "broken pipeline."

If we ever need DOM-aware extraction (e.g. JS-rendered content), this is the
call site to rewrite — it's a single function (`extract_text`) in
`scout/enrich/enrich.py`.

## Per-request HTTP shape

- Method: `GET`
- Headers: `User-Agent: scout/0.1 (...)`, `Accept: text/html,application/xhtml+xml`
- Timeout: 12s (configurable via `--timeout`).
- Redirect limit: 5.
- Body read limit: 512 KB. (Larger and we'd be wasting work; smaller and we'd
  truncate legit content.)
- Content-Type check: must contain "html". If a domain redirects us to a PDF or
  an image, we skip it as a non-HTML response.

## Concurrency

`--workers` defaults to 8. The Go design fanned fetches out across that many
goroutines; this Python port runs them **sequentially** over the single shared
`sqlite3` connection (not thread-safe across threads), so the worker pool isn't
reproduced — the progress header still prints the worker count, but only one
fetch runs at a time and DB writes go through that one connection. The observable
contract (Result counts, writes, progress lines) matches Go; only wall-clock
parallelism differs.

## Idempotency

The targets query (`store.enrichment_targets`) returns companies where:

```sql
e.company_id IS NULL                                  -- never fetched
OR datetime(c.ingested_at) > datetime(e.fetched_at)   -- re-ingested since last fetch
```

So re-running `enrich` is cheap when nothing has changed. `--force` overrides
and re-fetches every company with a domain.

## Failure handling

A failed fetch still writes a row, with `fetch_status` set to the failure mode
and `fetch_error` capturing the detail. We do this on purpose:

- Don't retry permanently broken domains on every run.
- Surface failures in the UI (filter by `fetch_status != 'ok'`).
- Distinguish "hasn't been fetched" from "fetch failed."

Status taxonomy — exactly the set the code emits:

| Status | Meaning |
|---|---|
| `ok` | Got 2xx HTML, ≥ 200 runes of stripped text, summary stored. |
| `low_content` | Got 2xx HTML but stripped text < 200 runes. Almost always a JS-rendered SPA shell. Summary is still stored for inspection, but the row is excluded from verdict candidates. |
| `challenge` | Got 2xx HTML but the page matches known bot-challenge boilerplate ("Just a moment...", "Checking your browser", etc.) AND is short (< 1000 runes). Summary is stored; row is excluded from verdict candidates. |
| `no_domain` | Company has no domain. Shouldn't be selected, defensive. |
| `http_<code>` | Last attempted URL returned `<code>` (e.g. `http_404`, `http_403`). |
| `dns` | DNS resolution failed. Domain typo, dead company, or DNS provider issue. |
| `refused` | TCP connection refused. Server down. |
| `timeout` | 12s elapsed before response. |
| `error` | Anything else; check `fetch_error`. |

**Classification order matters.** On a 2xx HTML response, `challenge` is checked
*before* `low_content` — challenge pages are usually short *and* match the
challenge keywords, so the more-specific signal wins. The summary text is stored
in all three cases; only `ok` survives to verdict.

Retry strategy is manual: `enrich --force`. We don't auto-retry on a schedule.
Most failures are persistent (dead domains).

## Fact extraction (fill-only-blanks)

When the Enricher has an Anthropic client (the web server passes its key
through; the CLI picks up `ANTHROPIC_API_KEY`), every `ok` fetch gets one extra
Haiku call over the page text that extracts `{name, vertical, location,
headcount, funding_stage}` — see `scout/enrich/facts.py`. The write is
strictly fill-only-blanks:

- The **name** is replaced only when it's still the bare-domain placeholder a
  name-less "Add company" gets (`fill_company_name_placeholder`). A typed or
  ingested name is never touched.
- The other columns go through `backfill_company_blanks`, which guards per
  column — a CSV value always wins over an extracted one.
- The prompt forbids guessing: headcount and stage are filled only when the
  page states them, so most sites fill name + vertical and honestly leave the
  rest blank.

Without a key, enrichment is purely mechanical (fetch + summary), as before.
Errors in the extraction call never fail the enrichment row — they're reported
on the progress stream and skipped.

The companion surface: `PUT /api/companies/:id` edits the same fields by hand
from the detail panel's "Company facts" section (full replace, name required,
domain immutable — it's the row's identity).

## What we're NOT fetching (yet)

Single about/landing page only. These are the obvious next moves if verdict
quality is weak:

- **Careers / Jobs pages.** Big signal for "is this company hiring my level?"
- **Blog / changelog.** Indicates engineering culture.
- **Press / news.** Stage, recent fundraise.
- **GitHub orgs.** Open-source presence is a strong "real engineering" signal.

Adding any of these would mean: a new `enrichment_<thing>` table or extending
`enrichment` with more columns, a new fetch path in `scout/enrich/enrich.py`,
and a corresponding section in the verdict prompt.

## Known weaknesses

- **JS-rendered SPAs.** Webflow/Framer/Next.js sites that ship a near-empty HTML
  shell. We get nav chrome and "Loading..." and not much else. Detected by
  stripped-text length < 200 runes → `fetch_status: low_content`. Row is
  excluded from verdict candidates. A headless browser is the escalation if a
  meaningful slice of survivors hit this.
- **Bot challenges.** Cloudflare/PerimeterX/Akamai will sometimes serve a
  challenge page. The clean-rejection cases (`http_403`/`http_429`) are obvious.
  The silent case (200 OK with challenge HTML) is detected by matching known
  boilerplate ("Just a moment...", "Checking your browser", etc.) on short
  stripped text → `fetch_status: challenge`. Row is excluded from verdict
  candidates.
- **Wrong domain.** Crunchbase sometimes has stale or typo'd domains. Manifests
  as `dns` or `http_404`. No mitigation.
- **Single-language assumption.** If a company's about page is non-English, we'll
  fetch it fine but the model has to deal. Mostly fine for Haiku.
