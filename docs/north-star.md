# scout — north star

> The canonical statement of what scout is and how it's built. If any other
> doc (or code) disagrees with this, this wins and the other is stale. Written
> knowledge-first: **scout has no "taste" of its own — it has a local knowledge
> store of the user's own words (criteria, experience, voice, logistics), which
> the brain optionally fills.** The word "taste" is retired; see
> [Terminology](#terminology).

## What scout is, in one line

A **job-fit scorer**: it ingests company dumps and, for each company, asks its
local knowledge store "who is the user and what do they want?" — the user's
criteria, typed in the dashboard or filled in from the brain — then uses its own
LLM to decide whether the company is worth the user's time. The brain is
optional and read-only for scout — verdicts stay in scout, not the brain.

It is brainbot's canonical example consumer (brainbot's `value-prop.md` names
the "job-fit scorer" as its #1 demonstration of the pattern).

## Why scout exists

Job discovery is a noisy filter problem. Crunchbase exports, YC batches, and
similar sources surface thousands of companies; maybe 1% are worth a serious
look. Manual triage is slow and inconsistent, and keyword filters miss nuance —
a "Solutions Engineer" role is on- or off-target depending on whether it's
*building*. An LLM with real personal context can do this in batch, **if** the
context is real (the user's own words — typed into scout, or synced from the
brain), the pipeline is cheap to re-run, and the output feeds the existing
workflow instead of replacing it.

**Non-goals.** Not a send tool — scout *drafts* cold outreach and application
answers (the outreach pipeline) but **never sends or submits**, and it doesn't
run email threads or automated sequences. It does track the pursuit: saved
postings carry a lean application lifecycle (application stage + reply status)
and **per-contact outreach tracking with follow-up reminders** (M51) — the jobs
view replaced the user's external tracker.
Not a job-board scraper — scout works on company-level data plus individually
captured posting links, not bulk listings. Not real-time; it's a batch tool,
run on a fresh dump. Not auto-applying. Not multi-user — it's the user's tool.

## System at a glance

```
                          ┌──────────┐
                          │ the user │   browses · triages · types their
                          └────┬─────┘   knowledge (Settings → Knowledge)
                               │ browser @ localhost
   Crunchbase CSV ──────▶ ┌────┴───────────────────────────┐
                          │            scout                │
                          │  ingest → filter → enrich →     │
                          │  verdict → triage UI            │
                          │  · SQLite (working set +        │
                          │    knowledge store: criteria,   │
                          │    experience, voice, logistics)│
                          │  · Haiku (own LLM) + playbook   │
                          └────────────────┬────────────────┘
                 fills the store (optional) │ reads only; a typed doc wins
                                       ┌────▼────────┐
                                       │  the brain  │
                                       │  knowledge  │
                                       │ of the user │
                                       └─────────────┘
```

Scout reads the brain (optional) to fill its knowledge store but never writes
it, and runs without it once the docs are typed. Verdicts live only in scout's
SQLite — scout makes no external writes.

## The core principle: intelligence vs. knowledge

```
        KNOWLEDGE                              INTELLIGENCE
   (who the user is, what                 (how to judge a company
    they want, their rules)                for fit, in this domain)
            │                                            │
   ┌────────▼────────┐  reads the user's criteria  ┌─────▼──────┐
   │ scout's local   │ ──────────────────────────▶ │   scout    │
   │ knowledge store │                             │ (own LLM + │
   └────────▲────────┘                             │  playbook) │
            │ fills it (optional;                  └────────────┘
        ┌───┴────┐  read-only — scout
        │ brain  │  never writes back)
        └────────┘
```

- **Scout owns a local knowledge store.** Four prose docs in scout's SQLite,
  typed in the dashboard (Settings → Knowledge): the company-fit **criteria**,
  plus **experience**, **voice** and **logistics** for the outreach pipeline.
  Everything about the user that scout reasons over is read from here.
- **The brain is an optional source of record that fills it.** Scout reads the
  brain's prose and **distills** it into a company-fit brief; the outreach
  knowledge auto-syncs whole pages. Per doc, a typed doc always sits in front of
  what the brain synced — there is no global "standalone mode" switch. Scout
  never writes the brain.
- **Scout owns the intelligence.** It brings its own LLM (Haiku) and a small
  operating *playbook* (how to decide), and reasons over the criteria — the
  typed doc, or the distilled brief.

This split is non-negotiable. The brain is never a single point of failure: with
the docs typed, scoring, outreach drafting and application answers all run with
no brain at all. With nothing on file anywhere — no typed doc and nothing usable
from the brain — scout fails loudly (`criteria.ErrNoCriteria`,
`outreach.ErrNoExperience`) rather than scoring or drafting against nothing.
There is no fallback file.

## Terminology (retired vs. canonical)

| ❌ Don't say | ✅ Say | Why |
|---|---|---|
| "taste" / "taste block" | **the user's criteria** (the knowledge store's criteria doc) | "taste" implied a scout-local opinion; the criteria are the user's own words |
| "taste source" | **typed** or **brain** (per doc; typed wins) | the source is the knowledge store, which the brain optionally fills |
| `taste.md` / "fallback criteria" | **the criteria doc** (Settings → Knowledge → Criteria) | the file is gone; there is no fallback tier — only the typed doc, else the brain's brief |
| "the agent's taste" | **the playbook** (how) + **the knowledge store** (what) | two different things, two sources |

`taste` survives in code only as the verdict provenance column
`verdicts.taste_version` (still sha256[:12] of playbook + `"\n---taste---\n"` +
the criteria version), the `AppState.reload_taste`/`current_taste` method names,
and the `taste_filter` pre-filter singleton (`/api/taste-filter`). `scout/taste`,
`taste.md`, `--taste-md` and `/api/taste` are gone — the package is
`scout/criteria` (`criteria.Block`, `criteria.hash_text`, `criteria.from_text`)
and the route is `/api/criteria`.

## The four inputs to a verdict

A single verdict decision combines four things from three sources:

| Input | Source | Role |
|---|---|---|
| **Output contract** | code constant (fixed) | the required JSON shape `{verdict, reason}` — never editable |
| **Playbook** | scout repo file (`playbook.md`) | *how* to decide: rubric, tie-breaking, "default to maybe when unsure". Scout's own logic. |
| **The user's criteria** | **scout's knowledge store** — the criteria doc typed in Settings → Knowledge, served outright; when it is empty, the brain (`recall` → prose chunks, distilled by scout into a company-fit brief, cached locally) | *what* the user wants + their rules/exclusions |
| **This company** | scout SQLite | Crunchbase fields + enriched site text |

```
  output contract (code, fixed) ─┐
  playbook — how to decide ────┤
  the user's criteria ─────────┼──▶  Haiku  ──▶  { verdict, reason }  ──▶  SQLite (verdicts)
    (knowledge store: the typed│
     doc, else the brain's     │
     distilled brief, cached)  │
  this company ────────────────┘
    (scout SQLite only)
```

The playbook is the *only* "instructions" file scout owns, and it is
deliberately **not** user-data — it's procedure. The rest is the user's: the
knowledge store holds it, in their own words, and the brain optionally fills it.

## The stores

| Store | Holds | Disposable? |
|---|---|---|
| **scout SQLite** | working set: companies, enrichment, verdicts, runs | yes — rebuild from a CSV anytime |
| **knowledge store** (in scout SQLite) | the user's own words, typed in Settings → Knowledge: the **criteria doc** (`criteria_doc` singleton) and the **experience / voice / logistics** docs (`outreach_sources` rows with `origin='local'`, one per need; blank deletes the row). Beside the typed rows sit the brain-synced pages (`origin='brain'`) — a sync replaces only those, a typed row survives every sync, and readers concatenate the typed doc first, then the brain pages | the typed docs: no — the user wrote them. The synced pages: yes — re-synced from the brain |
| **brain brief cache** (in scout SQLite) | the last distilled company-fit brief, per brain URL — consulted only when the criteria doc is empty; kept current by the change-propagation cascade (`/changes` cursor → distill basis → re-synthesize), served verbatim until the brain actually changes; stale-fallback (within `--brain-cache-ttl`) when the brain is down. See [`brainbot/docs/change-propagation.md`](../../brainbot/docs/change-propagation.md) | yes — a disposable cache; the brain is its source of truth |
| **the brain** (optional) | who the user is + what they want, as source pages — fills the knowledge store (distilled into the criteria brief; whole pages synced for experience/voice/logistics) | not scout's to dispose of — and scout runs without it once the docs are typed |
| **playbook** (scout-local) | how scout reasons — procedure only | DB singleton, edited in the dashboard (Settings → Job hunting); compiled-in default |
| **pre-filter rules** (scout-local) | the mechanical pre-filter — cheap hard gates (location, headcount, vertical, stage). NOT taste/judgment. | DB singleton (`taste_filter`), edited in the dashboard (Settings → Job hunting → "pre-filter"); compiled-in default ([`scout/filter/taste_default.toml`](../scout/filter/taste_default.toml)) |

Scout makes **no external writes**: it never writes the brain (verdicts are
scout-local) — it only reads it.

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
          dashboard (Settings → Job hunting → "pre-filter")
          and with a master on/off switch. A targeted
          re-score BYPASSES it.
enrich    fetch company site → text                    (no brain — company data)
verdict   reads  the user's criteria  ← the knowledge store: the typed criteria
                                         doc outright (no brain call), else the
                                         brain's distilled brief (cached locally;
                                         kept current by the /changes cost
                                         cascade, not a TTL). Nothing on file →
                                         the run fails loudly (ErrNoCriteria).
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
(`recall` + a synthesis call) before `verdict`, cached locally — and only when
no criteria doc is typed: `criteria.Resolver.resolve()` returns a non-empty
typed doc before any brain call (no `/changes` probe, no `/health`, no distill;
the background reconciler keeps running but each pass is then a cheap local
read). The synthesis LLM call and the verdict scoring are scout's. Everything
else in the scoring pipeline is brain-free.

## How scout talks to the brain

Plain **HTTP/JSON** (no MCP — that's for Claude Code). The brain is a pgvector
**document substrate** (graphiti is gone) — a librarian that returns the prose
most relevant to a question and never a verdict. Scout reads it through a
handful of read-only calls, each filling one part of the knowledge store:

- `GET /recall?q=&k=` — hybrid search; returns the top-k matching sections as
  **prose chunks** `{heading, text, score, path}`. There are no polarity/strength
  tags — the meaning is in the text. Scout fans out a few company-fit recalls and
  distills the results into a brief (see below) — the criteria path.
- `GET /map` + `GET /doc?id=` — the outreach knowledge sync
  (`outreach.ensure_knowledge` → `discover`): a cheap model picks, from the map,
  the pages that cover experience / voice / logistics; scout whole-fetches each
  and caches it as an `origin='brain'` row beside the typed doc. An empty pick
  for a need is a valid outcome (the draft-time gate decides over the merged
  bundle).
- `GET /changes?since=` — the change signal both paths key off, so a re-distill
  or a re-sync only happens when the brain actually moved.

Scout must **not** call `/profile` (scope-required, owner-only), and must never
pass a `scope` it had to "know" — the brain's folder taxonomy is the brain's
business. There is no write path (no `capture`): the brain is fed only by
sources (Notion sync), through the human, never by scout.

Authoritative contract: the brain's own `brain/brain/api.py` and the migration
spec `brainbot/plans/scout-migration.md`. (The old graph reference client
`brainbot/migrate/graphiti_clients.py` speaks the dead contract — do not use it.)

### Distilling the criteria (recall → brief)

This is the brain path for the criteria — taken only when the criteria doc is
empty. With the user's small corpus, recall is **coarse**: it returns whole
pages, scored almost flat, mixing the relevant with the irrelevant. So scout
adds an intelligence layer — the **distiller** (`scout/distill`) — in front of
it:

1. Fan out a few **company-fit** recalls ("what kind of company does the user
   want", "what does the user avoid", stage/size, verticals). *Companies only —
   role/title fit is a separate, later concern.*
2. Dedup the returned chunks (coarse recall hands back the same pages for several
   questions), then run a **two-step** LLM pass: **classify** each excerpt as
   COMPANY vs ROLE_OR_OTHER (quarantining role/career material), then
   **synthesize** a concise **company-fit brief** from the COMPANY items only,
   with prose sections scout's LLM writes itself: *Hard dealbreakers*, *Strong
   preferences*, *Context*. Runs on `--distill-model` (default Sonnet).
3. Cache the brief (`brain_profile_cache`) and judge every company against it —
   until the user types a criteria doc, which wins outright. The Criteria editor
   (Settings → Knowledge) shows the brain's brief beneath the typed doc, with
   Refresh (a forced re-distill) and "Copy to editor" to seed the typed doc from
   it.

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

> **Rule:** scout gates on the criteria's prose — typed doc or distilled brief —
> what it states as a dealbreaker is a hard skip, a requirement is a gate, a
> preference is a weight, context is background.

## Invariants (don't break these)

1. **Scout owns a local knowledge store; the brain is an optional source of
   record that fills it.** Scout = intelligence. The user's knowledge lives in
   scout's SQLite in their own words (the typed docs), with the brain's synced
   pages / distilled brief beside them; per doc, the typed doc wins. The brain
   is **read-only** for scout — verdicts are scout-local data and are never
   written back to the brain.
2. **The brain is never a single point of failure.** With the docs typed,
   scoring, outreach drafting and application answers run with no brain at all;
   when it's down, the cached brief and the last-synced pages serve. Nothing on
   file anywhere is a loud error (`ErrNoCriteria` fails the verdict run,
   `ErrNoExperience` gates a draft/answer with a 412) — never a silent score or
   draft against nothing.
3. **Editor isolation.** The Knowledge and playbook editors write scout-local
   rows only (`criteria_doc`, `outreach_sources`, the playbook singleton) and
   never touch the brain client.
4. **Gate on the criteria's prose.** What the criteria state as a dealbreaker is
   a gate; preferences are weights; context is background. There are no
   polarity/strength tags — the stance is in the words. (See above.)
5. **Web-first.** The browser stays the interface; the CLI is the secondary
   automation/debug surface, kept but not primary. The UI is now a **toolkit-built
   PWA** (`web/`, consuming `@brainbot/web-toolkit`); the FastAPI server serves
   its built `web/dist/` as static files at `GET /`. What remains future is putting it **behind the
   shared edge** (Caddy + oauth2-proxy; see [Web delivery is moving to the app
   platform](#web-delivery-is-moving-to-the-app-platform)). The browser-as-interface
   intent is unchanged, and so are the `/api/*` surface and the local-SQLite data.

## Resolved: the `filter` stage

The pre-filter **stays, as a purely mechanical gate** — cheap hard gates
(location, headcount, funding stage, has-domain) that decide which companies the
expensive verdict step bothers to score. It is **not** taste/judgment: nuanced
fit ("is this really right for the user") happens only at verdict time, grounded
in the user's criteria. The name is historical; treat it as the mechanical layer.

It is a **scoring gate, not a data gate**: it never deletes a company, hides one
from the list, or gates ingest/enrich — an excluded company is stored and shown
like any other, just without a verdict until you score it. The rules are the
`taste_filter` DB singleton (edited in the dashboard, with a master on/off
switch); there is no longer a `taste.toml` file. Any vertical *judgment* in the
rules (`verticals.allowed`/`excluded`) should be thinned to coarse cheap gates at
most, with the real exclusion logic living in the criteria doc (the user's own
words, or the brain's notes distilled into the brief).

## Web delivery is moving to the app platform

Scout's **web delivery** is being re-homed onto a shared **app platform**. The
first step is **done**: the UI moved from a single embedded `index.html` to a
toolkit-built, installable PWA (`web/`, consuming `@brainbot/web-toolkit`), whose
built `web/dist/` the FastAPI server serves as static files at `GET /`. Still
ahead is putting it **behind a shared edge** (Caddy + oauth2-proxy) for HTTPS and
Google sign-in. This is **delivery only** — scout's `/api/*` surface and its
local-SQLite working set (companies, enrichment, verdicts, runs) are **unchanged**,
and the CLI stays the secondary surface. Data does not move to the brain/Postgres;
verdicts stay scout-local (invariant 1). The identity endpoint `GET /api/me` now
exists (it reads the edge's `X-Auth-Request-Email` header, returning `{email}` or
`{}`); the optional `/api/brain/*` read proxy is **not implemented** — scout has a
purpose-built `/api/profile` (the brain-brief view under Settings → Knowledge →
Criteria) and does not surface generic recall/doc/map. The cross-app design and migration order live in the canonical
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
