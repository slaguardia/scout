# scout — PRD

> Status: **draft / in progress.** This doc is the working spec. Sections marked `TBD` are open questions to hash out before building.

## 1. Problem

Job discovery is a noisy filter problem. Crunchbase exports, AngelList lists, YC batches, and similar sources surface thousands of companies. Maybe 1% are worth a serious look for me. Manual triage is slow and inconsistent; static keyword filters miss nuance ("Solutions Engineer" can be on-target or off-target depending on whether the role is *building*).

An LLM with the right personal context can do this filtering in batch — but only if the context is real, the pipeline is cheap to re-run, and the output integrates with the existing application workflow instead of replacing it.

## 2. Goal

Given a dump of N companies (hundreds to low thousands), produce a triage list of ~10–30 high-signal candidates with a one-line "why" for each, in a read-only UI I can skim in under 5 minutes. Anything I want to commit to goes into the existing Notion Application Tracker via `tracker.py`.

## 3. Non-goals

- **Not a replacement for the Notion Application Tracker.** Notion is the system of record for committed pipeline.
- **Not a job board scraper.** Scout works on company-level data, not listings. Roles get evaluated downstream once I'm interested in the company.
- **Not real-time.** Batch tool. Run it when I have a fresh dump or want to re-score with updated taste rules.
- **Not auto-applying.** No automation past the triage UI.
- **Not multi-user.** Personal tool.

## 4. Users

One: me.

## 5. Core flow

```
1. Ingest:    Crunchbase CSV (initial) → SQLite raw table
2. Filter:    SQL pre-filter (vertical / location / headcount / stage) → survivors
3. Enrich:    parallel fetch company site → about/careers/blurb → SQLite enriched cols
4. Verdict:   for each survivor → query brainbot for taste context → LLM call → verdict + reason
5. Surface:   read-only web UI lists verdicts, sortable/filterable
6. Handoff:   I manually run `tracker.py add <Company>` for the ones I want to pursue
```

Each stage is idempotent and resumable. Re-running a stage doesn't duplicate work.

## 6. The taste context

Scout doesn't hardcode preferences. It pulls them from brainbot at verdict-time. The contract is roughly: "give me Alex's current role criteria, verticals, exclusions, and location policy as a single context block." That block goes into the system prompt for the verdict call.

This means: changing the taste in brainbot changes scout's verdicts on the next run, with no scout code changes. That's the bet.

**Resolved:** scout calls the brain's `search_memory_facts` MCP tool with `query: "job search taste preferences"` (group `brain`, up to 20 facts) and joins the returned fact strings into a single narrative block fed to the verdict prompt. See `docs/brainbot-contract.md`.

## 7. Data model (SQLite)

Rough sketch — refined during build:

```sql
companies (
  id INTEGER PRIMARY KEY,
  source TEXT,              -- 'crunchbase' | 'manual' | ...
  source_id TEXT,
  name TEXT NOT NULL,
  domain TEXT,
  headcount INTEGER,
  funding_stage TEXT,
  location TEXT,
  raw_json TEXT,            -- original row, untouched
  ingested_at DATETIME
);

enrichment (
  company_id INTEGER PRIMARY KEY,
  website_summary TEXT,
  fetched_at DATETIME,
  fetch_status TEXT
);

verdicts (
  company_id INTEGER PRIMARY KEY,
  verdict TEXT,             -- 'yes' | 'maybe' | 'no'
  reason TEXT,              -- one-line
  taste_version TEXT,       -- which brainbot snapshot was used
  scored_at DATETIME
);

status (
  company_id INTEGER PRIMARY KEY,
  status TEXT,              -- 'new' | 'reviewed' | 'tracked' | 'dismissed'
  updated_at DATETIME
);
```

Nothing gets deleted. `status` lets the UI filter without losing history.

## 8. Triage UI

Read-only. Served by the Go binary on localhost.

- Table view: name | verdict | reason | vertical | location | headcount | site link
- Filters: verdict, status, vertical, headcount range
- Sort by any column
- No write-back in v1 — status changes happen via CLI

**Open:** v2 might add write-back for `status` (review/dismiss inline). Not v1.

## 9. Out of scope for v1

- Multiple ingest sources (CSV from Crunchbase only)
- Auto-rerun on schedule
- Diffing across runs ("what's new since last time")
- Writing back to brainbot ("Alex dismissed Acme") — Phase 2
- UI write-back

## 10. Decisions locked for v1

- **Taste source:** static `taste.toml` checked into the repo. brainbot integration is M5, after the static version has been used enough to know the right endpoint shape.
- **Enrichment depth:** about/landing page only. Careers page added later if signal is too weak.
- **Model for verdicts:** Haiku. Cheap enough to run on every survivor without thinking. Escalate to Sonnet only if quality is bad.
- **Caching:** enrichment and verdicts are both keyed by `company_id` and stored in SQLite. Re-running a stage is a no-op unless the underlying row changed (tracked via `ingested_at` / `taste_version`).

## 11. Still open

- [ ] Whether to add a careers-page enrichment pass (deferred — measure verdict quality first).
- [ ] Whether the brain's `search_memory_facts` result for "job search taste preferences" is coherent enough as raw concatenated facts, or whether scout needs an LLM pre-pass to synthesize it before feeding the verdict prompt. Measure on real data first.

## 12. Milestones

1. **M1 — Ingest + filter.** ✅ `scout ingest`, `scout filter` against `taste.toml`.
2. **M2 — Enrichment.** ✅ `scout enrich`: parallel about-page fetch, HTML strip, SQLite cache, idempotent.
3. **M3 — Verdict (static taste).** ✅ `scout verdict`: Haiku via Anthropic API, narrative taste from `taste.md`, idempotent by `taste_version`.
4. **M4 — Triage UI.** ✅ `scout serve`: read-only HTML/JSON on localhost, sort/filter/search.
5. **M5 — brainbot integration.** ✅ `scout verdict --brainbot URL` pulls live taste via the brain's `search_memory_facts` MCP tool; file fallback if unreachable.
6. **M6 — Episode write-back.** ✅ `scout episodes --brainbot URL` ships verdicts as natural-language episodes via the brain's `add_memory` MCP tool; dedup via `episodes_sent`.

Scout's brain client lives at [`internal/brainbot/client.go`](./internal/brainbot/client.go). The wire protocol, tool surface, and integration patterns are owned by brainbot — see its [`docs/consumer-integration.md`](../brainbot/docs/consumer-integration.md). Scout-side specifics are in [`docs/brainbot-contract.md`](./docs/brainbot-contract.md).
