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
          ──▶ buildUserPrompt(company, brainFacts)    (per-company)
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
    "messages": [{"role": "user", "content": "<company facts + site text + brain memory>"}]
  }
```

Per-call timeout: 45s, separate from the global ctx. No streaming. Workers
default to 4 — Anthropic rate limits matter more than local CPU.

## System prompt — three layers

`buildSystemPrompt(playbook, taste string)` concatenates, in order:

| # | Layer | Header string | Source | Editable? |
|---|---|---|---|---|
| 1 | **Hard contract** | *(none — leads the prompt)* | `hardContract` Go const | No — a broken contract breaks the parser |
| 2 | **Playbook** (how to decide) | `--- PLAYBOOK (how to decide) ---` | `playbook.md`, else `builtinRubric` | Yes — operator-editable in the UI |
| 3 | **Criteria** (what the user wants) | `--- TASTE (what the user wants) ---` | **the brain**, else `taste.md` | Brain-owned; local file is offline fallback |

The hard contract pins the output shape:

```
You are Scout's verdict engine. Given a company, decide if it's worth the user's
time to investigate further as a job opportunity. Reply ONLY with valid JSON,
no preamble, no markdown fences. The JSON must have exactly two fields:
  {"verdict": "yes"|"maybe"|"no", "reason": "one-line, specific"}
```

The criteria block is appended verbatim — not summarized, paraphrased, or
trimmed. (The header text still reads `TASTE`; the concept is "criteria," and
they come from the brain. See [`north-star.md` Terminology](./north-star.md#terminology-retired-vs-canonical).)

### Where the criteria come from (brain-primary, file-fallback)

Resolved once per run, before scoring, and health-gated:

```
brain reachable? ── no ──▶ taste.md          (offline fallback)
       │ yes
   GET /profile bodies ── empty ──▶ broad /recall bodies ── empty ──▶ taste.md
       │ non-empty                                                    (brain knows nothing yet)
   brain criteria  ──────────────────────────────────────────────▶ scoring
```

The brain's criteria are the concatenated **episode bodies** (`Criteria()` →
`/profile`, falling back to a broad `/recall`), because the gates and exclusions
live in the bodies, not the extracted facts. A healthy-but-empty brain falls
back to `taste.md` too. Default brain URL: `http://127.0.0.1:8100`.

## User prompt

`buildUserPrompt(c, brainFacts)`:

```
Company: <name>
Domain: <domain>
Vertical: <vertical>
Location: <location>
Headcount: <n>
Funding stage: <stage>

Website text (truncated):
<up to 3000 runes of stripped about-page text>

What the brain already knows about this company:
- <recall fact, score ≥ 0.4>
- <…>

Return the JSON verdict now.
```

Fields with no value are omitted (no `Headcount: 0` noise). The brain block is
the per-company memory: `lookupBrain` calls `Recall(name, 5)` and keeps only
facts scoring **≥ 0.4** (`brainScoreFloor`) — a fresh company scores all-low and
injects nothing, so the section is dropped entirely. Recall is per-run cached
(empty results cached too, so misses aren't re-queried); a brain error logs to
stderr and returns nil, so the verdict still runs without brain context.

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

- Input: ~3500 tokens/call (criteria block + facts + 3000-rune summary), mostly
  cache-read after the first call.
- Output: ~50 tokens.
- 500 companies → roughly $0.50–1.50 a run.

## Where verdicts go

Verdicts are written to scout's local `verdicts` table and nowhere else. Scout
**does not** write them back to the brain — the brain is read-only for scout
(criteria via `profile`, per-company memory via `recall`). Verdict data is
scout-local working state; rebuild it from a CSV anytime.

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
| `brain lookup for … failed` (stderr) | recall miss/timeout | harmless — scoring continues without brain context |
| `considered=0`, work expected | survivors lack `ok` enrichment, or all are scored at the current version | run `scout enrich`, check `scout stats`, or `--force` |

## What this stage deliberately doesn't do

- **No tool use.** One shot with the data we hand it. If the data isn't enough,
  that's an enrichment problem.
- **No multi-turn.** One JSON object out, no "are you sure?".
- **No web search.** That's enrichment's job.
- **No structured outputs / function calling.** JSON-in-text with tolerant
  parsing is fine at this scale and keeps the request shape trivial.
