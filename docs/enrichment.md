# Enrichment

How `scout enrich` turns a domain into a chunk of text the LLM can read.

## Strategy

For each company with a non-empty domain, try these URLs in order:

1. `https://<domain>/about`
2. `https://<domain>/about-us`
3. `https://<domain>/company`
4. `https://<domain>/`

First 2xx HTML response wins. Body is read up to 512 KB, then stripped and
truncated to 3000 runes.

We always start with HTTPS. We don't fall back to HTTP — if a company
ships modern hardware in 2026 without TLS that's a signal in itself.

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

That gives us the visible page text, navigation chrome and all. The LLM
sorts out signal from noise.

**Why not a real HTML parser?**

- Adds a dep (`golang.org/x/net/html` or similar).
- The output is fed to an LLM that's better at salience than any tag-based
  extractor we'd write.
- Failure mode is "extra noise in the prompt," not "broken pipeline."

If we ever need real DOM-aware extraction (e.g. JS-rendered content), this
is the call site to rewrite — it's a single function in `internal/enrich/enrich.go`.

## Per-request HTTP shape

- Method: `GET`
- Headers: `User-Agent: scout/0.1 (...)`, `Accept: text/html,application/xhtml+xml`
- Timeout: 12s (configurable via `--timeout`).
- Redirect limit: 5.
- Body read limit: 512 KB. (Larger and we'd be wasting work; smaller and
  we'd truncate legit content.)
- Content-Type check: must contain "html". If a domain redirects us to a
  PDF or an image, we skip it as a non-HTML response.

## Concurrency

`Workers` goroutines (default 8) consume from a buffered job channel. Each
worker does one fetch at a time. DB writes are serialized through SQLite's
lock — the upsert is fast enough that this isn't a bottleneck.

Why 8? It's a balance between throughput and not getting flagged as
abusive by Cloudflare. Most company sites are on the same handful of
CDNs; banging them at 32 parallel from one IP is rude. Bump if you have a
reason; default is conservative.

## Idempotency

The targets query (`store.EnrichmentTargets`) returns companies where:

```sql
e.company_id IS NULL                           -- never fetched
OR datetime(c.ingested_at) > datetime(e.fetched_at)   -- re-ingested since last fetch
```

So re-running `scout enrich` is cheap when nothing has changed. `--force`
overrides and re-fetches every company with a domain.

## Failure handling

A failed fetch still writes a row, with `fetch_status` set to the failure
mode and `fetch_error` capturing the detail. We do this on purpose:

- Don't retry permanently broken domains on every run.
- Surface failures in the UI (filter by `fetch_status != 'ok'`).
- Distinguish "hasn't been fetched" from "fetch failed."

Failure statuses:

| Status | Meaning |
|---|---|
| `ok` | Got 2xx HTML, summary stored. |
| `low_content` | Got 2xx HTML but stripped text < 200 runes. Almost always a JS-rendered SPA shell. Summary is still stored for inspection, but the row is excluded from verdict candidates. |
| `challenge` | Got 2xx HTML but the page matches known bot-challenge boilerplate ("Just a moment...", "Checking your browser", etc.) AND is short. Summary is stored; row is excluded from verdict candidates. |
| `no_domain` | Company has no domain. Shouldn't be selected, defensive. |
| `http_<code>` | Last attempted URL returned `<code>` (e.g. `http_404`, `http_403`). |
| `dns` | DNS resolution failed. Domain typo, dead company, or DNS provider issue. |
| `refused` | TCP connection refused. Server down. |
| `timeout` | 12s elapsed before response. |
| `error` | Anything else; check `fetch_error`. |

Retry strategy is manual: `scout enrich --force`. We don't auto-retry on a
schedule. Most failures are persistent (dead domains).

## What we're NOT fetching (yet)

PRD §10 explicitly defers these. Worth listing because they're the obvious
next moves if verdict quality is weak:

- **Careers / Jobs pages.** Big signal for "is this company hiring my
  level?" Deferred until verdict quality is measured.
- **Blog / changelog.** Indicates engineering culture.
- **Press / news.** Stage, recent fundraise.
- **GitHub orgs.** Open-source presence is a strong "real engineering" signal.

Adding any of these would mean: a new `enrichment_<thing>` table or
extending `enrichment` with more columns, a new fetch path in
`internal/enrich/enrich.go`, and a corresponding section in the verdict
prompt.

## Known weaknesses

- **JS-rendered SPAs.** Webflow/Framer/Next.js sites that ship a near-empty
  HTML shell. We get nav chrome and "Loading..." and not much else.
  Detected by stripped-text length < 200 runes → `fetch_status: low_content`.
  Row is excluded from verdict candidates. Going deeper (headless browser)
  is the v3 escalation if a meaningful slice of survivors hit this.
- **Bot challenges.** Cloudflare/PerimeterX/Akamai will sometimes serve a
  challenge page. The clean-rejection cases (`http_403`/`http_429`) are
  obvious. The silent case (200 OK with challenge HTML) is detected by
  matching known boilerplate ("Just a moment...", "Checking your browser",
  etc.) on short stripped text → `fetch_status: challenge`. Row is
  excluded from verdict candidates.
- **Wrong domain.** Crunchbase sometimes has stale or typo'd domains.
  Manifests as `dns` or `http_404`. No mitigation.
- **Single-language assumption.** If a company's about page is non-English,
  we'll fetch it fine but the model has to deal. Mostly fine for Haiku.
