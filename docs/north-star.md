# scout — north star

> The canonical statement of what scout is and how it's built. If any other
> doc (or code) disagrees with this, this wins and the other is stale. Written
> brain-first: **scout has no "taste" of its own — the user's criteria live in
> the brain.** The word "taste" is retired; see [Terminology](#terminology).

## What scout is, in one line

A **job-fit scorer**: it ingests company dumps and, for each company, asks the
brain "who is the user and what do they want?" then uses its own LLM to decide
whether the company is worth the user's time. The brain is read-only for scout —
verdicts stay in scout, not the brain.

It is brainbot's canonical example consumer (brainbot's `value-prop.md` names
the "job-fit scorer" as its #1 demonstration of the pattern).

## Why scout exists

Job discovery is a noisy filter problem. Crunchbase exports, YC batches, and
similar sources surface thousands of companies; maybe 1% are worth a serious
look. Manual triage is slow and inconsistent, and keyword filters miss nuance —
a "Solutions Engineer" role is on- or off-target depending on whether it's
*building*. An LLM with real personal context can do this in batch, **if** the
context is real (the brain), the pipeline is cheap to re-run, and the output
feeds the existing workflow instead of replacing it.

**Non-goals.** Not an outreach/CRM tool — saved postings carry a lean
application lifecycle (applied date, response stage, outreach count, contact
emails; the jobs view replaced the user's external tracker), but the *content*
of outreach — messages, templates, threads — stays out of scope.
Not a job-board scraper — scout works on company-level data plus individually
captured posting links, not bulk listings. Not real-time; it's a batch tool,
run on a fresh dump. Not auto-applying. Not multi-user — it's the user's tool.

## System at a glance

```
                          ┌──────────┐
                          │ the user │   browses · triages in the UI
                          └────┬─────┘
                               │ browser @ localhost
   Crunchbase CSV ──────▶ ┌────┴───────────────────────────┐
                          │            scout                │
                          │  ingest → filter → enrich →     │
                          │  verdict → triage UI            │
                          │  · SQLite (working set)         │
                          │  · Haiku (own LLM) + playbook   │
                          └────────────────┬────────────────┘
                       reads (only)         │ the user's criteria
                                       ┌────▼────────┐
                                       │  the brain  │
                                       │  knowledge  │
                                       │ of the user │
                                       └─────────────┘
```

Scout reads the brain (the user's criteria) but never writes it. Verdicts live
only in scout's SQLite — scout makes no external writes.

## The core principle: intelligence vs. knowledge

```
        KNOWLEDGE                              INTELLIGENCE
   (who the user is, what                 (how to judge a company
    they want, their rules)                for fit, in this domain)
            │                                       │
        ┌───▼────┐    reads the user's criteria  ┌─────▼──────┐
        │ brain  │ ────────────────────────────▶ │   scout    │
        │        │      (read-only — scout        │ (own LLM + │
        └────────┘       never writes back)       │  playbook) │
                                                 └────────────┘
```

- **The brain owns the knowledge.** Everything about the user — preferences,
  rules, hard exclusions, history — lives there. Scout never stores or
  duplicates it.
- **Scout owns the intelligence.** It brings its own LLM (Haiku) and a small
  operating *playbook* (how to decide). It reads the brain's prose, **distills**
  it into a company-fit brief, and reasons over that brief.

This split is non-negotiable. Anything that pulls the user's preferences into a
scout-local file (the legacy `taste.md`) is a **fallback for when the brain is
unreachable**, nothing more — and we don't invest in it.

## Terminology (retired vs. canonical)

| ❌ Don't say | ✅ Say | Why |
|---|---|---|
| "taste" / "taste block" | **the user's criteria** (from the brain) | "taste" implied a local file; the criteria are the brain's |
| "taste source" | **brain** (with local fallback) | the source is the brain |
| `taste.md` as the source | **fallback criteria** | local file is offline-only |
| "the agent's taste" | **the playbook** (how) + **the brain** (what) | two different things, two sources |

The code still uses `taste`-prefixed names (`internal/taste`, `taste.Block`,
`taste_version`) — that's **legacy naming to be migrated**, not a contradiction
of this doc. When you touch it, rename toward "criteria"/"brain context."

## The four inputs to a verdict

A single verdict decision combines four things from three sources:

| Input | Source | Role |
|---|---|---|
| **Output contract** | Go constant (fixed) | the required JSON shape `{verdict, reason}` — never editable |
| **Playbook** | scout repo file (`playbook.md`) | *how* to decide: rubric, tie-breaking, "default to maybe when unsure". Scout's own logic. |
| **The user's criteria** | **the brain** (`recall` → prose chunks, distilled by scout into a company-fit brief, cached locally) | *what* the user wants + their rules/exclusions |
| **This company** | scout SQLite | Crunchbase fields + enriched site text |

```
  output contract (Go, fixed) ─┐
  playbook — how to decide ────┤
  the user's criteria ─────────┼──▶  Haiku  ──▶  { verdict, reason }  ──▶  SQLite (verdicts)
    (brain: recall → distilled │
     brief, cached locally)    │
  this company ────────────────┘
    (scout SQLite only)
```

The playbook is the *only* "instructions" file scout owns, and it is
deliberately **not** user-data — it's procedure. The brain owns the rest.

## The stores

| Store | Holds | Disposable? |
|---|---|---|
| **scout SQLite** | working set: companies, enrichment, verdicts, runs | yes — rebuild from a CSV anytime |
| **brain brief cache** (in scout SQLite) | the last distilled company-fit brief, per brain URL — kept current by the change-propagation cascade (`/changes` cursor → distill basis → re-synthesize), served verbatim until the brain actually changes; stale-fallback (within `--brain-cache-ttl`) when the brain is down. See [`brainbot/docs/change-propagation.md`](../../brainbot/docs/change-propagation.md) | yes — a disposable cache; the brain is the source of truth |
| **the brain** | who the user is + what they want (the knowledge substrate) | no — the system of record for the user |
| **playbook** (scout-local) | how scout reasons — procedure only | DB singleton, edited in the dashboard (Criteria); compiled-in default |
| **pre-filter rules** (scout-local) | the mechanical pre-filter — cheap hard gates (location, headcount, vertical, stage). NOT taste/judgment. | DB singleton (`taste_filter`), edited in the dashboard (Criteria → "pre-filter"); compiled-in default ([`internal/filter/taste_default.toml`](../internal/filter/taste_default.toml)) |

Scout makes **no external writes**: it never writes the brain (verdicts are
scout-local), reading it via `recall` only.

## The pipeline, with brain touchpoints

```
ingest    CSV → companies                              (no brain — pure data)
filter    mechanical PRE-FILTER for the bulk verdict:    (no brain, no LLM —
          a cheap free gate on location, headcount,      cheap hard gates,
          vertical, stage. It gates ONLY which companies  NOT judgment)
          a bulk verdict run spends an LLM call on — it
          never deletes data, hides rows from the list,
          or gates ingest/enrich. Rules = the
          `taste_filter` DB singleton, editable in the
          dashboard (Criteria → "pre-filter") and with a
          master on/off switch. A targeted re-score
          BYPASSES it.
enrich    fetch company site → text                    (no brain — company data)
verdict   reads  the user's criteria  ← brain: recall → distilled brief
                                         (cached locally; kept current by the
                                          /changes cost cascade, not a TTL)
          reasons  with Haiku + playbook
          writes verdict              → scout SQLite (not the brain)
triage    browse / promote                             (no brain)
```

**On the pre-filter:** it exists only to avoid spending a paid LLM call on
obviously-out companies — it is brain-free and judgment-free by design. The
unambiguous gates (location, headcount, has-domain) are cheap facts worth
filtering on; the **vertical** include/exclude is the blunt one (case-
insensitive substring, e.g. "law" matches "Law Enforcement"), and as the
brain-derived brief matures it's the rule most reasonably moved out of the gate
and left to the LLM. It is **not** a data gate: every imported company is stored
and shown in the list regardless (a filtered-out company simply has no verdict
yet). Because it's now a DB singleton you can edit it, flip its **master on/off
switch**, or empty it live from the dashboard — no redeploy, no file. Disabled →
a bulk run scores everything. A targeted per-company re-score skips it entirely
either way (the explicit ask overrides the bulk cost gate).

The brain is touched in exactly one place — distilling the user's criteria
(`recall` + a synthesis call) before `verdict`, cached locally. The synthesis
LLM call and the verdict scoring are scout's. Everything else is brain-free.

## How scout talks to the brain

Plain **HTTP/JSON** (no MCP — that's for Claude Code). The brain is a pgvector
**document substrate** (graphiti is gone) — a librarian that returns the prose
most relevant to a question and never a verdict. Scout reads it through exactly
one call:

- `GET /recall?q=&k=` — hybrid search; returns the top-k matching sections as
  **prose chunks** `{heading, text, score, path}`. There are no polarity/strength
  tags — the meaning is in the text. Scout fans out a few company-fit recalls and
  distills the results into a brief (see below).

Scout must **not** call `/profile` (now scope-required, owner-only) or `/map`,
and must never pass a `scope` it had to "know" — `recall(query)` is the whole
interface; the brain's folder taxonomy is the brain's business. There is no
write path (no `capture`): the brain is fed only by sources (Notion sync),
through the human, never by scout.

Authoritative contract: the brain's own `brain/brain/api.py` and the migration
spec `brainbot/plans/scout-migration.md`. (The old graph reference client
`brainbot/migrate/graphiti_clients.py` speaks the dead contract — do not use it.)

### Distilling the criteria (recall → brief)

With the user's small corpus, recall is **coarse**: it returns whole pages,
scored almost flat, mixing the relevant with the irrelevant. So scout adds an
intelligence layer — the **distiller** (`internal/distill`) — in front of it:

1. Fan out a few **company-fit** recalls ("what kind of company does the user
   want", "what does the user avoid", stage/size, verticals). *Companies only —
   role/title fit is a separate, later concern.*
2. Dedup the returned chunks (coarse recall hands back the same pages for several
   questions), then run a **two-step** LLM pass: **classify** each excerpt as
   COMPANY vs ROLE_OR_OTHER (quarantining role/career material), then
   **synthesize** a concise **company-fit brief** from the COMPANY items only,
   with prose sections scout's LLM writes itself: *Hard dealbreakers*, *Strong
   preferences*, *Context*. Runs on `--distill-model` (default Sonnet).
3. Cache the brief and judge every company against it.

The structure (dealbreakers / preferences / context) is the distiller's
**output**, written in prose — not tags handed over by the brain. Tagged facts
as *input* fight how an LLM reasons; structure that the LLM derives from prose
does not. The two-step split matters: a single pass leaks the user's *role*
wants into the company brief (reframed as "company traits") even on a stronger
model — classifying first quarantines them. The brief is scout-local: a
re-derived view of brain knowledge, never written back, never a verdict.

The classify + synthesize prompts are shown verbatim in
[`verdict.md` → *The distiller prompts*](./verdict.md#the-distiller-prompts-classify--synthesize)
— the place to tune *how* the raw notes become criteria.

> **Rule:** scout gates on the brief's prose — what it states as a dealbreaker is
> a hard skip, a requirement is a gate, a preference is a weight, context is
> background.

## Invariants (don't break these)

1. **Brain = knowledge, scout = intelligence.** No user-preferences baked into
   scout except the offline fallback. The brain is **read-only** for scout —
   verdicts are scout-local data and are never written back to the brain.
2. **Brain is an enhancement, never a single point of failure.** If it's down,
   scout logs and falls back to local criteria; it never hard-crashes a run.
3. **Editor isolation.** The UI taste/playbook editor writes local files only
   and never touches the brain client.
4. **Gate on the brief's prose.** What the distilled brief states as a
   dealbreaker is a gate; preferences are weights; context is background. There
   are no polarity/strength tags — the stance is in the words. (See above.)
5. **Web-first.** The browser stays the interface; the CLI is the secondary
   automation/debug surface, kept but not primary. The UI is now a **toolkit-built
   PWA** (`web/`, consuming `@brainbot/web-toolkit`); the Go server `go:embed`s
   its built `internal/web/dist/` and serves it at `GET /` — so scout is still a
   single self-contained binary. What remains future is putting it **behind the
   shared edge** (Caddy + oauth2-proxy; see [Web delivery is moving to the app
   platform](#web-delivery-is-moving-to-the-app-platform)). The browser-as-interface
   intent is unchanged, and so are the Go `/api/*` surface and the local-SQLite data.

## Resolved: the `filter` stage

`taste.toml` **stays, as a purely mechanical pre-filter** — cheap hard gates
(location, headcount, funding stage, has-domain) that cull rows before the
expensive verdict step. It is **not** taste/judgment: nuanced fit ("is this
really right for the user") happens only at verdict time, grounded in the brain.
The name is historical; treat it as the mechanical layer. Any vertical
*judgment* currently in `taste.toml` (`verticals.allowed`/`excluded`) should be
thinned to coarse cheap culls at most, with the real exclusion logic living in
the brain (the user's notes), surfaced via recall and the distilled brief.

## Web delivery is moving to the app platform

Scout's **web delivery** is being re-homed onto a shared **app platform**. The
first step is **done**: the UI moved from a `go:embed` single `index.html` to a
toolkit-built, installable PWA (`web/`, consuming `@brainbot/web-toolkit`), whose
built `internal/web/dist/` the Go server `go:embed`s and serves at `GET /`. Still
ahead is putting it **behind a shared edge** (Caddy + oauth2-proxy) for HTTPS and
Google sign-in. This is **delivery only** — scout's Go `/api/*` surface and its
local-SQLite working set (companies, enrichment, verdicts, runs) are **unchanged**,
and the CLI stays the secondary surface. Data does not move to the brain/Postgres;
verdicts stay scout-local (invariant 1). The identity endpoint `GET /api/me` now
exists (it reads the edge's `X-Auth-Request-Email` header, returning `{email}` or
`{}`); the optional `/api/brain/*` read proxy is **not implemented** — scout has a
purpose-built `/api/profile` for its Criteria panel and does not surface generic
recall/doc/map. The cross-app design and migration order live in the canonical
platform doc: [brainbot/docs/app-platform.md](../../brainbot/docs/app-platform.md).

## How this relates to the other docs

This doc owns the architecture and concept; the rest is reference and links back
here.

- [`pipeline.md`](./pipeline.md) — each command's behavior.
- [`verdict.md`](./verdict.md) — the LLM call: prompt assembly, caching.
- [`enrichment.md`](./enrichment.md) — about-page fetch + fetch-status taxonomy.
- [`data-model.md`](./data-model.md) — the SQLite schema.
- [`operations.md`](./operations.md) — flags, env, troubleshooting.
- [`limitations.md`](./limitations.md) — current limits and where it breaks first.
- [brainbot/docs/app-platform.md](../../brainbot/docs/app-platform.md) — the shared
  app platform scout's web delivery is moving onto (toolkit PWA behind the shared
  edge); governs scout's shell/delivery, not its pipeline.
- `CLAUDE.md` — working instructions + current state for Claude.
