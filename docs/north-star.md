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

**Non-goals.** Not a pipeline tracker — scout surfaces and scores candidates;
what the user does with a committed candidate is out of scope.
Not a job-board scraper — scout works on company-level data, not listings. Not
real-time; it's a batch tool, run on a fresh dump. Not auto-applying. Not
multi-user — it's the user's tool.

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
| **brain brief cache** (in scout SQLite) | the last distilled company-fit brief, per brain URL — reused within `--brain-cache-ttl`, stale-fallback when the brain is down | yes — a disposable cache; the brain is the source of truth |
| **the brain** | who the user is + what they want (the knowledge substrate) | no — the system of record for the user |
| **playbook.md** (scout-local) | how scout reasons — procedure only | versioned in the repo |
| **taste.toml** (scout-local) | the mechanical pre-filter — cheap hard gates (location, headcount, stage, has-domain). NOT taste/judgment. | versioned in the repo |

Scout makes **no external writes**: it never writes the brain (verdicts are
scout-local), reading it via `recall` only.

## The pipeline, with brain touchpoints

```
ingest    CSV → companies                              (no brain — pure data)
filter    mechanical pre-filter (taste.toml: location, (no brain — cheap hard gates,
          headcount, stage, has-domain)                 NOT judgment)
enrich    fetch company site → text                    (no brain — company data)
verdict   reads  the user's criteria  ← brain: recall → distilled brief
                                         (cached locally, TTL)
          reasons  with Haiku + playbook
          writes verdict              → scout SQLite (not the brain)
triage    browse / promote                             (no brain)
```

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
   questions) and make **one grounded LLM call** to synthesize a concise
   **company-fit brief**, with prose sections scout's LLM writes itself:
   *Hard dealbreakers*, *Strong preferences*, *Context*.
3. Cache the brief and judge every company against it.

The structure (dealbreakers / preferences / context) is the distiller's
**output**, written in prose — not tags handed over by the brain. Tagged facts
as *input* fight how an LLM reasons; structure that the LLM derives from prose
does not. The brief is scout-local: a re-derived view of brain knowledge, never
written back, never a verdict.

The synthesis prompt that does this review is shown verbatim in
[`verdict.md` → *The distiller prompt*](./verdict.md#the-distiller-prompt-recall--brief)
— it's the single place to tune *how* the raw notes become criteria.

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
5. **Web-first.** The browser is the interface; the CLI is the secondary
   automation/debug surface, kept but not primary.

## Resolved: the `filter` stage

`taste.toml` **stays, as a purely mechanical pre-filter** — cheap hard gates
(location, headcount, funding stage, has-domain) that cull rows before the
expensive verdict step. It is **not** taste/judgment: nuanced fit ("is this
really right for the user") happens only at verdict time, grounded in the brain.
The name is historical; treat it as the mechanical layer. Any vertical
*judgment* currently in `taste.toml` (`verticals.allowed`/`excluded`) should be
thinned to coarse cheap culls at most, with the real exclusion logic living in
the brain (the user's notes), surfaced via recall and the distilled brief.

## How this relates to the other docs

This doc owns the architecture and concept; the rest is reference and links back
here.

- [`pipeline.md`](./pipeline.md) — each command's behavior.
- [`verdict.md`](./verdict.md) — the LLM call: prompt assembly, caching.
- [`enrichment.md`](./enrichment.md) — about-page fetch + fetch-status taxonomy.
- [`data-model.md`](./data-model.md) — the SQLite schema.
- [`operations.md`](./operations.md) — flags, env, troubleshooting.
- [`limitations.md`](./limitations.md) — current limits and where it breaks first.
- `CLAUDE.md` — working instructions + current state for Claude.
