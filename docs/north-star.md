# scout — north star

> The canonical statement of what scout is and how it's built. If any other
> doc (or code) disagrees with this, this wins and the other is stale. Written
> brain-first: **scout has no "taste" of its own — Alex's criteria live in the
> brain.** The word "taste" is retired; see [Terminology](#terminology).

## What scout is, in one line

A **job-fit scorer**: it ingests company dumps and, for each company, asks the
brain "who is Alex and what does he want?" then uses its own LLM to decide
whether the company is worth Alex's time — and writes that judgment back to
the brain.

It is brainbot's canonical example consumer (brainbot's `value-prop.md` names
the "job-fit scorer" as its #1 demonstration of the pattern).

## The core principle: intelligence vs. knowledge

```
        KNOWLEDGE                              INTELLIGENCE
   (who Alex is, what he                 (how to judge a company
    wants, his rules)                      for fit, in this domain)
            │                                       │
        ┌───▼────┐      reads criteria        ┌─────▼──────┐
        │ brain  │ ─────────────────────────▶ │   scout    │
        │        │ ◀───────────────────────── │ (own LLM + │
        └────────┘      writes verdicts        │  playbook) │
                                               └────────────┘
```

- **The brain owns the knowledge.** Everything about Alex — preferences,
  rules, hard exclusions, history — lives there. Scout never stores or
  duplicates it.
- **Scout owns the intelligence.** It brings its own LLM (Haiku) and a small
  operating *playbook* (how to decide). It reads the brain's knowledge and
  reasons over it.

This split is non-negotiable. Anything that pulls Alex's preferences into a
scout-local file (the legacy `taste.md`) is a **fallback for when the brain is
unreachable**, nothing more — and we don't invest in it.

## Terminology (retired vs. canonical)

| ❌ Don't say | ✅ Say | Why |
|---|---|---|
| "taste" / "taste block" | **Alex's criteria** (from the brain) | "taste" implied a local file; the criteria are the brain's |
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
| **Alex's criteria** | **the brain** (`profile` → episode bodies) | *what* Alex wants + his rules/exclusions |
| **This company** | scout SQLite + **brain** (`recall(name)`) | Crunchbase fields + enriched site text + brain memory about this specific company |

The playbook is the *only* "instructions" file scout owns, and it is
deliberately **not** Alex-data — it's procedure. The brain owns the rest.

## The stores

| Store | Holds | Disposable? |
|---|---|---|
| **scout SQLite** | working set: companies, enrichment, verdicts, status, runs | yes — rebuild from a CSV anytime |
| **the brain** | who Alex is + what he wants (the knowledge substrate) | no — the system of record for Alex |
| **Notion** | committed pipeline — the shortlist Alex actually pursues | no |
| **playbook.md** (scout-local) | how scout reasons — procedure only | versioned in the repo |

Scout never writes Notion (manual handoff). Scout writes the brain only via
`capture` (verdict write-back). Scout reads the brain via `profile`/`recall`.

## The pipeline, with brain touchpoints

```
ingest    CSV → companies                              (no brain — pure data)
filter    mechanical gate only (has domain? dedupe?)   (no brain — see OPEN below)
enrich    fetch company site → text                    (no brain — company data)
verdict   reads  Alex's criteria     ← brain: profile / episode bodies
          reads  company history      ← brain: recall(name)
          reasons  with Haiku + playbook
          writes verdict back         → brain: capture        (loop closes)
triage    browse / status / promote                    (no brain)
```

The brain is touched in exactly three places, all inside `verdict`. Everything
else is brain-free.

## How scout talks to the brain

Plain **HTTP/JSON** (no MCP — that's for Claude Code). Three operations:

- `GET /profile` — Alex's full current picture. **Read the episode bodies**,
  not just extracted facts (see below).
- `GET /recall?q=` — scored facts + episode bodies for a query; scout uses it
  for per-company memory. Scout sets its own score floor.
- `POST /capture` — write a verdict back as natural-language text; the brain
  decomposes and extracts it.

Authoritative contract: `brainbot/docs/consumer-api.md` +
`consumer-integration.md`. Scout's client mirrors `brainbot/migrate/graphiti_clients.py`.

### Facts vs. episodes (the rule that protects the gates)

The brain returns two things: **`facts`** (extracted, scored — but a *lossy,
positive-only* index that drops negatives/rules) and **episode bodies** (the
faithful captured text — complete, with the exclusions and gates). Per
brainbot's own docs, a job-fit scorer that reads only `facts` *"will miss
'fintech is explicitly excluded' and pursue something it should hard-skip."*

> **Rule:** scout reads **episode bodies** for Alex's criteria (anything
> rule-bearing). Facts are for fast positive lookups only.

## Invariants (don't break these)

1. **Brain = knowledge, scout = intelligence.** No Alex-preferences baked into
   scout except the offline fallback.
2. **Brain is an enhancement, never a single point of failure.** If it's down,
   scout logs and falls back to local criteria; it never hard-crashes a run.
3. **Editor isolation.** The UI taste/playbook editor writes local files only
   and never touches the brain client.
4. **Read bodies, not facts, for rules.** (See above.)
5. **Web-first.** The browser is the interface; the CLI is the secondary
   automation/debug surface, kept but not primary.

## OPEN decisions (resolve before building)

- **Fate of the `filter` stage.** Today `taste.toml` encodes *judgment*
  (allowed/excluded verticals) — a duplicate of rules that now live in the
  brain, so it will drift. Brain-first, `filter` should become **mechanical
  only** (drop rows with no domain, dedupe) and let *all* judgment happen at
  verdict time grounded in the brain. Alternative: drop `filter` entirely.
  **Recommendation: mechanical-only.** ← needs Alex's call.
- **Where the criteria bodies come from.** `profile` vs `recall(broad query)` —
  pin against one live `/profile` call (brainbot's two docs disagree on whether
  `profile` returns fact-records or bodies). Tracked in `brain-first-plan.md`.

## How this relates to the other docs

- [`brain-first-plan.md`](./brain-first-plan.md) — the execution plan to get the
  code from its current state to this north star.
- `PRD.md` — the original product spec (problem, non-goals, data model).
- `CLAUDE.md` — working instructions + current state for Claude.
