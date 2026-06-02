# Verdict — the LLM call

The only stage that talks to an LLM. Everything else is plumbing. For the
architecture (brain owns knowledge, scout owns intelligence; the four inputs to
a verdict), see [`north-star.md`](./north-star.md) — this doc is the mechanics.

## TL;DR

For each survivor with `ok` enrichment, build one Messages API request, parse
the JSON out of the response, write to `verdicts`. No tool use, no multi-turn,
no retries beyond `net/http`. One call, one verdict.

```
candidate ──▶ buildSystemPrompt(playbook, criteria)  (cached system block)
          ──▶ buildUserPrompt(company)                (per-company)
          ──▶ Haiku  ──▶ parseVerdict  ──▶  {verdict, reason}  ──▶ verdicts
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

Per-call timeout: 45s, separate from the global ctx. No streaming. Workers
default to 4 — Anthropic rate limits matter more than local CPU.

## System prompt — three layers

`buildSystemPrompt(playbook, criteria string)` concatenates, in order:

| # | Layer | Header string | Source | Editable? |
|---|---|---|---|---|
| 1 | **Hard contract** | *(none — leads the prompt)* | `hardContract` Go const | No — a broken contract breaks the parser |
| 2 | **Playbook** (how to decide) | `--- PLAYBOOK (how to decide) ---` | `playbook.md`, else `builtinRubric` | Yes — operator-editable in the UI |
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
short gate rubric (`hardGateRubric`): the brief states dealbreakers, requirements,
and preferences in prose, and the rubric tells the LLM to gate on dealbreakers/
requirements and weigh preferences. (The header text reads `CRITERIA`; the
concept is the user's criteria, from the brain. See
[`north-star.md` Terminology](./north-star.md#terminology-retired-vs-canonical).)

### Where the criteria come from (distilled brief, cached, file-fallback)

Resolved once per run, before scoring, by the shared `internal/criteria`
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

The criteria are the **distiller's** output (`internal/distill`): a few
company-fit `GET /recall` calls return prose chunks `{heading, text, score,
path}`, scout dedups them and makes one grounded LLM call to synthesize a brief
with sections it writes itself — *Hard dealbreakers*, *Strong preferences*,
*Context*. There are no polarity/strength tags; the stance is in the prose, and
the brief states acceptable alternatives explicitly ("any one of: X, Y, Z"). The
brief is cached in `brain_profile_cache` and reused within `--brain-cache-ttl`
(default 6h); when the brain is unreachable or distillation fails the resolver
serves a *stale* cached brief before dropping to `taste.md`. A healthy-but-empty
brain falls back to `taste.md` too. Default brain URL: `http://127.0.0.1:8100`.

### The distiller prompt (recall → brief)

This is the prompt that reviews the brain's chunks and writes the brief — the
one place to tune *how* the raw notes become criteria. It is
`synthesisSystemPrompt` in `internal/distill/distill.go` (shown verbatim here;
keep this block in sync when you edit the const). Sent as the **system** prompt,
`temperature: 0`, prompt-cached:

```
You are Scout's criteria distiller. The user is evaluating COMPANIES as
potential job opportunities. Below are excerpts retrieved from the user's own
notes about what they want. Synthesize them into a concise company-fit brief
that another agent will use to decide whether a given company is worth the
user's time.

Rules:
- Ground EVERY statement in the provided excerpts, in the user's own words where
  you can. Invent nothing — if the notes don't say it, leave it out.
- Preserve each rule's DIRECTION exactly. When the notes mark something as a skip
  / avoid / exclude / "no", it stays on the exclude side — never flip it to
  allowed, and never infer the allowed set by taking the complement of a
  skip-list (or vice-versa). A list of examples after "everything else … is a
  skip" is a list of things to SKIP, not to allow. For hard gates (location,
  stage, funding), mirror the note's own wording — quote it rather than
  paraphrase, since paraphrase is where inversions creep in.
- COMPANIES ONLY, in every section including Context. KEEP only attributes of the
  company itself: domain/vertical, what the product does, the industry it changes,
  mission, business model, funding stage, size/headcount. DROP anything about the
  job: titles, seniority, and the day-to-day shape of the work (coding vs.
  architecture vs. integration vs. customer-facing). Do NOT re-admit a role
  preference by rephrasing it as a company trait — e.g. "a company where engineers
  do architecture/integration, not just coding" is still a role preference; drop
  it. Roles are judged elsewhere.
- The retrieval is broad and returns unrelated material — discard excerpts that
  aren't about what kind of company the user wants.
- When the user lists acceptable alternatives (e.g. several okay verticals),
  state them explicitly as alternatives: "any one of: X, Y, Z qualifies."
- Be specific and compact. Name the verticals, stages, traits — don't generalize
  them away.
- Format: under each section use "- " bullets only — no numbered lists, no extra
  sub-headers, one criterion per bullet. Emit only the three section headers
  below (an optional one-line title above them is fine).

Output these sections in this order (omit a section only if the notes genuinely
say nothing for it):

## Hard dealbreakers
Things that make a company an automatic "no".

## Strong preferences
What the user is drawn to or leans away from — strong signals, but not absolute.

## Context
Background that colors judgment but isn't itself a rule.
```

The chunks are the **user** message (`formatChunks`): each excerpt is labeled
`[Source: <path> — <heading>]` so the model can weigh provenance and drop the
off-topic ones, closing with `Write the company-fit brief now.`

Inspect a live run with `scout distill` (prints the recalled chunks + the brief);
the brief is also viewable, and re-distillable, in the UI's Criteria panel.

## User prompt

`buildUserPrompt(c)`:

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

`verdicts.taste_version` is the cache key — `taste.Hash`, the first 12 hex chars
of sha256:

```go
// playbook present (the shipped default):
Hash(playbook + "\n---taste---\n" + criteria)
// no playbook.md:
Hash(criteria)
```

It deliberately covers **both** the playbook and the criteria, so editing the
playbook *or* the brain learning something changes the version. Short for three
reasons: unique enough across realistic edits, readable in logs and DB
inspections, stable across leading/trailing whitespace. Not content-addressable
— don't depend on it for anything but cache invalidation.

## Idempotency

`scoreOne` checks before the API call:

```go
existing, _ := db.GetVerdict(c.CompanyID)
if existing != nil && existing.TasteVersion == s.Taste.Version {
    return nil // up to date, skip
}
```

The version is global to the run, so any change to the playbook or the brain's
criteria changes it for **every** company, and the next run re-scores all of
them. That is intended: when the brain learns something new about what the user
wants, every prior verdict is stale. `--force` re-scores regardless of version.

## Parsing

Models occasionally wrap JSON in prose. `parseVerdict` is tolerant:

1. `json.Unmarshal` the whole response.
2. If that fails, extract the first `{…}` substring (regex `\{[^{}]*\}`) and
   retry.
3. Validate `verdict ∈ {yes, maybe, no}` (lowercased).

Both attempts failing counts the row as `failed`, left unscored; the next run
retries it. The regex is non-greedy and doesn't handle nested braces — the
target is a flat two-field object, so that's fine. If we ever ask for nested
JSON, switch to a real bracket-matching parser.

## Model choice

Default: `claude-haiku-4-5` (`anthropic.DefaultModel`). Override with
`scout verdict --model <id>`. The mechanical pre-filter (`taste.toml`) already
culls obvious mismatches, so survivors are plausible candidates and the model is
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

`Workers` (default 4) goroutines consume a channel of candidates; DB upserts
serialize through SQLite's per-connection lock. A failure logs to stderr and
bumps a counter but doesn't kill other workers. Why 4: Anthropic's standard-tier
rate limits sit well above this; the real point is not hammering someone else's
account if scout grows. Higher tier → bump `--workers`.

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
