# Pipeline

Each subcommand in detail. Read top-to-bottom — they're meant to be run in
order, though every stage handles being re-run.

## `scout ingest <csv>`

**Input:** a CSV with a header row. Crunchbase export is the assumed shape;
column aliases in `internal/ingest/csv.go` accept many common header names
(`Organization Name`, `Company`, `name`, `UUID`, `Industries`, `Industry`,
`Headcount`, `Employees`, `Headquarters Location`, `HQ Location`, etc).

**Behavior:**
- Reads header, maps to canonical fields, indexes column positions.
- For each row: builds a `store.Company`, preserves the original row in
  `raw_json` (untouched, ordered by header), upserts.
- Upsert key: `(source, source_id)`. If the CSV has no UUID/ID column,
  `source_id` falls back to `"name:" + name` — best-effort dedup.
- Headcount tolerates ranges like `"11-50"` (takes the upper bound) and
  commas (`"1,200"`).
- Domain is normalized: lowercased, `https://`/`http://`/`www.` stripped,
  path stripped.
- Status row is seeded as `'new'` on first insert; re-ingest doesn't reset it.

**Output:** `read=N upserted=N skipped=N errors=N` plus error lines on stderr.

**Idempotent?** Yes. Upsert by `(source, source_id)`. `ingested_at` is bumped
on every upsert, which invalidates downstream enrichment cache.

**Flags:** `--db scout.db`, `--source crunchbase`.

---

## `scout filter`

**Input:** `taste.toml` (rules), `companies` table.

**Behavior:**
- Loads taste.toml.
- `SELECT id, name, location, vertical, headcount, funding_stage FROM companies`
  — pulls all rows into Go, evaluates per-row.
- Evaluation order: location → headcount → excluded verticals → allowed
  verticals → funding stage. First failing check is the recorded drop reason.
- Survivors are printed as a tab-separated table.

**Why eval in Go and not SQL:**
- Per-reason drop counts. SQL `WHERE` clauses don't tell you *which*
  predicate dropped a row.
- Substring matching on `vertical`/`location` is cleaner in Go.
- N is low thousands. Speed isn't the bottleneck.

**Output:** survivor table + total/survivor counts + drop-reason histogram.

**Idempotent?** Read-only. No state changes.

**Flags:** `--db scout.db`, `--taste taste.toml`.

---

## `scout enrich`

**Input:** `companies` table.

**Behavior:**
- Selects every company with a non-empty domain that either has no
  enrichment row, or whose `companies.ingested_at` is newer than its
  `enrichment.fetched_at` (or all of them, with `--force`).
- Spawns N workers (default 8). Each worker:
  - Tries `https://<domain>/about` → `/about-us` → `/company` → `/`.
  - First 2xx HTML response wins.
  - Strips `<script>`, `<style>`, `<noscript>`, `<svg>`, all tags, decodes
    common entities, collapses whitespace, truncates to 3000 runes.
  - Writes one `enrichment` row per company with `fetch_status`:
    - `ok` — got HTML
    - `no_domain` — company has no domain (shouldn't happen given the SELECT)
    - `http_<code>` — last non-2xx response code
    - `dns` — DNS lookup failed
    - `refused` — TCP refused
    - `timeout` — `Client.Timeout`
    - `error` — anything else; detail in `fetch_error`
- Per-request timeout default 12s. Redirect limit 5.

**Output:** `considered=N fetched=N ok=N failed=N`.

**Idempotent?** Yes. Re-runs only re-fetch rows where the company has been
re-ingested since the last fetch. Failure rows are NOT auto-retried — to
retry, pass `--force`.

**Flags:** `--db`, `--workers 8`, `--timeout 12s`, `--force`.

**See also:** [enrichment.md](./enrichment.md) for details on the fetch
strategy and HTML stripping.

---

## `scout verdict`

**Input:** survivors from filter × `enrichment` with `fetch_status = 'ok'`, plus a taste block.

**Behavior:**
1. Resolves the taste block:
   - If `--brainbot URL` set → MCP call `search_memory_facts(query="job search taste preferences", max_facts=20, group_ids=["brain"])` against `{URL}/mcp`, joins the returned `facts[].fact` strings into a narrative block. Falls back to `taste.md` on any error.
   - Else → read `taste.md`.
2. Hashes the taste text to compute `taste_version` (sha256[:12]).
3. Re-runs filter to get survivors. Joins with enrichment on `fetch_status = 'ok'`.
4. For each survivor:
   - If a verdict row already exists with the same `taste_version` → skip.
   - Else POST to Anthropic Messages API with a structured system+user prompt.
   - Parse `{"verdict": ..., "reason": ...}` from the response.
   - Upsert into `verdicts`.
5. Workers default to 4. Per-call timeout 45s.

**Requires:** `ANTHROPIC_API_KEY` env var.

**Output:** `considered=N scored=N skipped=N failed=N` plus verdict histogram.

**Idempotent?** Yes, by `(company_id, taste_version)`. Editing `taste.md`
changes the version and triggers re-scoring on the next run.

**Flags:** `--db`, `--taste taste.toml`, `--taste-md taste.md`,
`--brainbot URL`, `--model claude-haiku-4-5`,
`--escalate-model claude-sonnet-4-5` (optional second pass on maybes),
`--workers 4`, `--force`.

**See also:** [verdict.md](./verdict.md) for prompts, parsing, model choice.

---

## `scout serve`

**Input:** `companies`, `enrichment`, `verdicts`, `status` tables.

**Behavior:**
- Embeds `internal/web/index.html` via `//go:embed`.
- HTTP server with three routes:
  - `GET /` → the embedded HTML.
  - `GET /api/companies` → JSON: every company joined with optional
    verdict, status, enrichment URL/summary. Ordered by verdict
    (`yes` < `maybe` < `no` < unscored), then name.
  - `GET /healthz` → `ok`.
- Page is a single dark-mode table. Client-side sort by column, filter by
  verdict/status, free-text search across name/vertical/reason, click a
  row to expand the website summary inline.
- Graceful shutdown on SIGINT/SIGTERM.

**Output:** `scout triage UI at http://localhost:8765` (or wherever).

**Idempotent?** Read-only. No state changes.

**Flags:** `--db`, `--addr :8765`.

---

## `scout episodes`

**Input:** `verdicts` table, brainbot URL.

**Behavior:**
- Selects verdicts whose `(company_id, taste_version)` isn't in
  `episodes_sent`.
- For each: looks up company name/domain, formats a natural-language
  sentence ("Scout verdicted <Company> as 'yes' on YYYY-MM-DD. Reason: …"),
  and calls `add_memory` over MCP at `{URL}/mcp`. On 2xx, records in `episodes_sent`.

**Requires:** `--brainbot URL` (or `BRAINBOT_URL` env var).

**Output:** `sent=N failed=N`.

**Idempotent?** Yes, by `(company_id, taste_version)` via `episodes_sent`.

**See also:** [brainbot-contract.md](./brainbot-contract.md) for the wire
shape.

---

## `scout stats`

**Output:** `companies=N` plus verdict histogram if any.

Useful sanity check between stages.
