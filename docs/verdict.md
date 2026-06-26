# Verdict — the LLM call

The only stage that talks to an LLM. Everything else is plumbing. For the
architecture (brain owns knowledge, scout owns intelligence; the four inputs to
a verdict), see [`north-star.md`](./north-star.md) — this doc is the mechanics.

## TL;DR

For each survivor with `ok` enrichment, build one Messages API request, parse
the JSON out of the response, write to `verdicts`. No tool use, no multi-turn,
no stage-level retries beyond the shared HTTP client. One call, one verdict.

```
candidate ──▶ build_system_prompt(playbook, criteria)  (cached system block)
          ──▶ build_user_prompt(company)                (per-company)
          ──▶ Haiku  ──▶ parse_verdict  ──▶  {verdict, reason}  ──▶ verdicts
```

## The call

```go
POST https://api.anthropic.com/v1/messages
Headers:  x-api-key: $ANTHROPIC_API_KEY · anthropic-version: 2023-06-01
Body:
  {
    "model": "claude-haiku-4-5",
    "max_tokens": 256,
    "system": [{ "type": "text", "text": "<3 layers>",
                 "cache_control": {"type": "ephemeral"} }],
    "messages": [{"role": "user", "content": "<company facts + site text>"}]
  }
```

Per-call timeout: 45s, set per request. No streaming. The `--workers` flag
defaults to 4 (see **Concurrency** — this port scores sequentially).

## System prompt — three layers

`build_system_prompt(playbook, criteria)` concatenates, in order:

| # | Layer | Header string | Source | Editable? |
|---|---|---|---|---|
| 1 | **Hard contract** | *(none — leads the prompt)* | `HARD_CONTRACT` constant | No — a broken contract breaks the parser |
| 2 | **Playbook** (how to decide) | `--- PLAYBOOK (how to decide) ---` | `playbook.md`, else `BUILTIN_RUBRIC` | Yes — operator-editable in the UI |
| 3 | **Criteria** (what the user wants) | `--- CRITERIA (what the user wants) ---` | **the brain** (distilled brief), else `taste.md` | Brain-owned; local file is offline fallback |

The hard contract pins the output shape:

```
You are Scout's verdict engine. Given a company, decide if it's worth the user's
time to investigate further as a job opportunity. Reply ONLY with valid JSON,
no preamble, no markdown fences. The JSON must have exactly two fields:
  {"verdict": "yes"|"maybe"|"no", "reason": "one-line, specific"}
```

The criteria block is appended verbatim — not summarized, paraphrased, or
trimmed (the distiller already did the summarizing). The block leads with a
short gate rubric (`HARD_GATE_RUBRIC`): the brief states dealbreakers, requirements,
and preferences in prose, and the rubric tells the LLM to gate on dealbreakers/
requirements and weigh preferences. (The header text reads `CRITERIA`; the
concept is the user's criteria, from the brain. See
[`north-star.md` Terminology](./north-star.md#terminology-retired-vs-canonical).)

### Where the criteria come from (distilled brief, cached, file-fallback)

Resolved once per run, before scoring, by the shared `scout/criteria`
resolver (the same path the web server uses) with a local SQLite cache in front
of the brain:

```
fresh cached brief? (age < --brain-cache-ttl) ── yes ──▶ use it
       │ no
   recall + distill ── brief ──▶ scoring (cache it)
       │ empty ───▶ taste.md (brain knows nothing yet)
       │                                          unreachable / failed ──▶ stale cached brief?
       │                                                              │ yes → use it
       │                                                              │ no  → taste.md
   distilled brief  ──────────────────────────────────────────────▶ scoring
```

The criteria are the **distiller's** output (`scout/distill`): a few
company-fit `GET /recall` calls return prose chunks `{heading, text, score,
path}`, scout dedups them, then runs a **two-step** pass — (1) **classify** every
preference in the excerpts as `COMPANY` vs `ROLE_OR_OTHER` (with a verbatim quote
+ polarity), (2) **synthesize** the brief from the `COMPANY` items only, with
sections it writes itself — *Hard dealbreakers*, *Strong preferences*, *Context*.
The classify step physically removes the salient role/career material before the
synthesis runs, which is what reliably keeps it out of the brief (a single pass
leaks it back in even on a stronger model — structure fixes this, not model
size). There are no polarity/strength tags from the brain; the stance is in the
prose, and the brief states acceptable alternatives explicitly ("any one of: X,
Y, Z"). Both calls run at `temperature: 0` on the **distiller model**
(`--distill-model`, default Sonnet — the call is once per run, so fidelity is
worth more than the cost; verdict scoring stays on Haiku). The brief is cached in
`brain_profile_cache` and reused within `--brain-cache-ttl` (default 6h); when the
brain is unreachable or distillation fails the resolver serves a *stale* cached
brief before dropping to `taste.md`. A healthy-but-empty brain falls back to
`taste.md` too. Default brain URL: `http://127.0.0.1:8100`.

### The distiller prompts (classify → synthesize)

These are the two prompts that turn the brain's chunks into the brief — the
place to tune *how* the raw notes become criteria. They are `CLASSIFY_SYSTEM_PROMPT`
and `SYNTH_SYSTEM_PROMPT` in `scout/distill/distill.py` (shown verbatim here;
keep these blocks in sync when you edit the constants). Both run as the **system**
prompt at `temperature: 0`, prompt-cached. The classify step's **user** message
is the deduped chunks (`format_chunks`), each labeled `[Source: <path> —
<heading>]`; the synthesize step's **user** message is the classify output.

**Step 1 — classify (the leak gate):**

```
You are triaging excerpts from a user's personal job-search notes. Do NOT write a brief. Output a structured list only.

For EVERY distinct preference or rule in the excerpts, emit one item in EXACTLY this format:

<item scope="COMPANY|ROLE_OR_OTHER" polarity="INCLUDE|EXCLUDE|NEUTRAL" strength="HARD|SOFT|NEUTRAL">
quote: "<verbatim text copied exactly from the excerpt>"
claim: <one neutral sentence restating the preference>
</item>

Classification rules:
- scope="COMPANY" ONLY if the preference is about the COMPANY ITSELF: industry / vertical, what the product does, the industry it changes, mission, business model, funding stage, size / headcount, the company's location, ownership / independence.
- scope="ROLE_OR_OTHER" for ANYTHING about the user's job, day-to-day work, title, seniority, skills, the team/role culture they want, learning, or personal / career goals — EVEN IF it sounds company-flavored. These are all ROLE_OR_OTHER: "engineers do architecture not just coding", "being customer-facing matters", "mix of problems: software architecture, team dynamics", "building toward starting your own company", "maximize learning velocity", "proximity to people who have built and scaled".
- polarity is read from the QUOTE's literal wording, never inferred. A list of things to skip/avoid is EXCLUDE. A "hard rule" / "no X" / "skip" is EXCLUDE (and strength=HARD if stated as a hard rule). "Ideal / want / drawn to" is INCLUDE.
- strength=HARD only when the note says so ("hard rule", "always", "regardless", "automatic"). Otherwise SOFT. NEUTRAL for background facts.
- Cover EVERYTHING; do not judge importance — a later step filters and writes the brief.
- Copy quotes verbatim. Do not paraphrase or fix wording.
```

**Step 2 — synthesize (COMPANY items only):**

```
Below are pre-classified preference items extracted from a user's notes, each tagged with scope, polarity, and strength and carrying a verbatim quote.

Write a concise COMPANY-FIT BRIEF using ONLY items with scope="COMPANY". Silently ignore every scope="ROLE_OR_OTHER" item — never rephrase, summarize, or smuggle it in, not even into Context.

Render exactly these three sections, "- " bullets only (no numbered lists, no sub-headers), one criterion per bullet:

## Hard dealbreakers
polarity=EXCLUDE items, and strength=HARD INCLUDE requirements. A company that violates one is an automatic "no".

## Strong preferences
SOFT INCLUDE / EXCLUDE items — strong signals, not absolute.

## Context
NEUTRAL, company-level background only (e.g. how to weigh domain proximity). No role, career, or personal content.

Faithfulness:
- Preserve each item's polarity DIRECTION exactly as its quote states it. A skip-list stays a skip-list; never invert it or infer the allowed complement.
- When the notes list acceptable alternatives (e.g. several okay verticals), state them as alternatives: "any one of: X, Y, Z qualifies."
- Be specific and compact; name verticals, stages, traits. For hard location / stage gates, mirror the note's own wording.
- Before finishing, verify: (a) no bullet describes the user's role, work, or personal goals; (b) every include / exclude bullet's direction matches its source. Drop any bullet that fails.

An optional one-line title above the sections is fine. Output only the brief.
```

Why two calls: a single pass leaks the salient role/career material back into
the brief (reframed as "company traits") even on a stronger model — separating
*classify* from *synthesize* quarantines that material before the brief is
written. Tuning study results live in the commit that introduced this.

Inspect a live run with `scout distill` (prints the recalled chunks, the
classified items, and the brief); the brief is also viewable, and
re-distillable, in the UI's Criteria panel.

## User prompt

`build_user_prompt(c)`:

```
Company: <name>
Domain: <domain>
Vertical: <vertical>
Location: <location>
Headcount: <n>
Funding stage: <stage>

Website text (truncated):
<up to 3000 runes of stripped about-page text>

Return the JSON verdict now.
```

Fields with no value are omitted (no `Headcount: 0` noise). The user prompt is
purely the company's own data — Crunchbase fields plus the enriched site text.
There is **no per-company brain lookup**: the brain's only contribution to a
verdict is the user's criteria, which live in the cached system block, not here.

## Prompt caching

`Cached: true` on every call. The system block (contract + playbook + criteria)
is sent as one `cache_control: ephemeral` text block, so it's written to cache
on the first call of a run and read on the rest — the ~3.5 KB criteria+rubric
block is amortized across every company. `Result` aggregates
`cache_creation_input_tokens` and `cache_read_input_tokens` across both passes.

## The criteria version (cache key)

`verdicts.taste_version` is the cache key — `taste.hash`, the first 12 hex chars
of sha256:

```
# playbook present (the shipped default):
taste.hash(playbook + "\n---taste---\n" + criteria)
# no playbook.md:
taste.hash(criteria)
```

It deliberately covers **both** the playbook and the criteria, so editing the
playbook *or* the brain learning something changes the version. Short for three
reasons: unique enough across realistic edits, readable in logs and DB
inspections, stable across leading/trailing whitespace. Not content-addressable
— don't depend on it for anything but cache invalidation.

## Idempotency

A scored company is **sticky**: a default (or `--only-blanks`) bulk run skips any
company that already has a verdict, before the API call:

```python
if not self.company_ids and (self.only_blanks or not self.force):
    existing = get_verdict(self.con, c.company_id)
    if existing is not None:
        return None  # already scored — leave it untouched
```

The skip is by **existence**, not version — editing the playbook or the brain
learning something does NOT auto-rescore prior verdicts. Re-scoring is always
explicit: a `--force` run (re-scores everything) or a targeted per-company run
(the `company_ids` path above always re-scores, since you pointed at it on
purpose). `verdicts.taste_version` is still recorded on each verdict (the cache
key above) for provenance — which criteria/playbook version produced it — but it
does not gate the default run.

## Parsing

Models occasionally wrap JSON in prose. `parse_verdict` is tolerant:

1. `json.loads` the whole response.
2. If that fails, extract the first `{…}` substring (regex `\{[^{}]*\}`) and
   retry.
3. Validate `verdict ∈ {yes, maybe, no}` (lowercased).

Both attempts failing counts the row as `failed`, left unscored; the next run
retries it. The regex is non-greedy and doesn't handle nested braces — the
target is a flat two-field object, so that's fine. If we ever ask for nested
JSON, switch to a real bracket-matching parser.

## Model choice

Default: `claude-haiku-4-5` (`anthropic.DEFAULT_MODEL`). Override with
`scout verdict --model <id>`. The mechanical pre-filter (the `taste_filter` DB
singleton, edited in the dashboard) already culls obvious mismatches on a bulk
run, so survivors are plausible candidates and the model is
making fine-grained yes/maybe/no calls — a job Haiku is fast, cheap, and good
enough at. Switch `--model` to Sonnet only when real data shows quality is bad.

Cost back-of-envelope (verify against current pricing):

- Input: ~3500 tokens/call (criteria block + 3000-rune summary), mostly
  cache-read after the first call.
- Output: ~50 tokens.
- 500 companies → roughly $0.50–1.50 a run.

## Where verdicts go

Verdicts are written to scout's local `verdicts` table and nowhere else. Scout
**does not** write them back to the brain — the brain is read-only for scout
(criteria via `profile`, cached locally). Verdict data is scout-local working
state; rebuild it from a CSV anytime.

## Concurrency

`--workers` (default 4) survives as a flag, but this Python port scores
**sequentially** over the single per-run `sqlite3` connection — one shared
connection isn't thread-safe, so the Go goroutine worker pool isn't reproduced.
DB upserts go through that one connection. A failure logs to stderr and bumps a
counter but doesn't stop the run. The observable contract — `Result` accounting,
the verdict + trace writes, and the progress lines (the header still prints the
worker count) — is identical to Go; only wall-clock parallelism differs.

## Failure modes

| Symptom | Cause | What to do |
|---|---|---|
| `anthropic: no API key` | env unset | `export ANTHROPIC_API_KEY=…` |
| `anthropic HTTP 401` | bad key | check the key |
| `anthropic HTTP 429` | rate limited | lower `--workers` or wait |
| `anthropic HTTP 5xx` | API down | retry; next run picks up failed rows |
| `parse: no valid verdict JSON` | model returned prose | rerun; if persistent, tighten the prompt |
| `criteria: brain unavailable …` (stderr) | brain unreachable at resolve time | harmless — resolver serves a stale cached profile, else `taste.md`; scoring continues |
| `considered=0`, work expected | survivors lack `ok` enrichment, or all are scored at the current version | run `scout enrich`, check `scout stats`, or `--force` |

## What this stage deliberately doesn't do

- **No tool use.** One shot with the data we hand it. If the data isn't enough,
  that's an enrichment problem.
- **No multi-turn.** One JSON object out, no "are you sure?".
- **No web search.** That's enrichment's job.
- **No structured outputs / function calling.** JSON-in-text with tolerant
  parsing is fine at this scale and keeps the request shape trivial.
