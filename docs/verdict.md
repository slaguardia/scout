# Verdict flow

The only stage that talks to an LLM. Everything else is plumbing.

## TL;DR

For each survivor that has `ok` enrichment, build one Messages API request,
parse JSON from the response, write to `verdicts`. No tool use, no
multi-turn, no retries beyond what `net/http` does. One call, one verdict.

## The call

```go
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: $ANTHROPIC_API_KEY
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
  {
    "model": "claude-haiku-4-5",
    "max_tokens": 256,
    "system": "<rubric + taste block>",
    "messages": [{"role": "user", "content": "<company facts + about-page text>"}]
  }
```

Per-call timeout: 45s (separate from the global ctx). No streaming.
Workers default to 4 — Anthropic rate limits matter more than local CPU.

## Prompt shape

### System prompt

Built in `buildSystemPrompt(taste string)`:

```
You are Scout's verdict engine. Given a company, decide if it's worth
Alex's time to investigate further as a job opportunity. Apply the taste
context below strictly. Reply ONLY with valid JSON, no preamble, no
markdown fences. The JSON must have exactly two fields:
  {"verdict": "yes"|"maybe"|"no", "reason": "one-line, specific"}

Verdict rubric:
  - "yes":   high-confidence fit. Worth Alex actively investigating.
  - "maybe": adjacent or uncertain. Worth a skim, not a deep dive.
  - "no":    poor fit or hard exclusion.

The reason must be specific — name the vertical, stage, or trait that drove
the call. Don't say "matches taste" or "good fit"; say "AI infra for ML
teams, Series B" or "crypto wallet (excluded)".

--- TASTE CONTEXT ---
<entire taste.md content here>
```

The taste block is appended verbatim. It's not summarized, paraphrased, or
trimmed — what's in `taste.md` is what the model sees.

### User prompt

Built in `buildUserPrompt(c VerdictCandidate)`:

```
Company: <name>
Domain: <domain>
Vertical: <vertical>
Location: <location>
Headcount: <n>
Funding stage: <stage>

Website text (truncated):
<3000 runes of stripped about-page text>

Return the JSON verdict now.
```

Fields with no value are omitted (no `Headcount: 0` noise).

## Why direct HTTP and not the SDK

The `anthropic` package is ~120 lines. The official Go SDK pulls in a wide
dep tree and lots of features we don't use. If usage broadens (tools,
streaming, batch, prompt caching, citations), swap it in — until then,
keep the dep surface minimal.

## Parsing

Models occasionally wrap JSON in prose despite the system prompt asking
otherwise. `parseVerdict()` is tolerant:

1. Try `json.Unmarshal` on the whole response.
2. If that fails, find the first `{...}` substring (regex `\{[^{}]*\}`) and try again.
3. Validate `verdict ∈ {yes, maybe, no}` (lowercased).

If both attempts fail, the call is counted as `failed` and the row is left
unscored. Next `scout verdict` run will retry it.

The regex is intentionally non-greedy and doesn't handle nested braces —
the response we want is a flat two-field object, so this is fine. If we
ever ask for nested JSON, switch to a real bracket-matching parser.

## Model choice

Default: `claude-haiku-4-5`. Set in `internal/anthropic/client.go` as
`DefaultModel`. Override with `scout verdict --model <id>`.

Rationale (PRD §10): the pre-filter (`taste.toml`) already culls obvious
mismatches. Survivors are reasonable candidates; the model is doing
fine-grained yes/maybe/no calls among plausible companies. Haiku is fast
and cheap and has been good enough at this kind of task. Escalate to
Sonnet only if quality is bad — and the escalation should be data-driven,
not vibes.

Cost back-of-envelope (real numbers will vary; check current pricing):
- Input: ~3500 tokens per call (taste block + facts + 3000-rune summary)
- Output: ~50 tokens
- 500 companies → ~$0.50–1.50 a run, depending on the price sheet

## taste_version

```go
sha256(strings.TrimSpace(taste.Text))[:12]  // first 12 hex chars
```

It's the cache key. Three reasons it's short:

1. Long enough to be effectively unique across realistic taste edits.
2. Short enough to be readable in DB inspections and logs.
3. Stable across whitespace edits at the start/end of `taste.md`.

It is NOT a content-addressable hash. Don't depend on it for anything
besides cache invalidation.

## Idempotency

In `scoreOne`, before the API call:

```go
existing, err := db.GetVerdict(c.CompanyID)
if existing != nil && existing.TasteVersion == taste.Version {
    return nil  // skip, already scored
}
```

So the protocol is: edit `taste.md`, run `scout verdict`, only changed
companies get re-scored... wait. That's not right. Editing `taste.md`
changes the version for ALL companies; everyone gets re-scored. That's
intentional — taste edits are global. If you want per-company re-score,
use `--force`.

## Concurrency

`Workers` (default 4) goroutines consume from a channel of candidates. The
DB upsert is serialized through SQLite's per-connection lock. Failures
log to stderr and increment counters but don't kill other workers.

Why 4? Anthropic rate limits on the standard tier are well above this; the
real constraint is that we don't want to hammer rate limits on someone
else's account if scout grows. If you have a higher tier, bump `--workers`.

## Failure modes

| Symptom | Cause | What to do |
|---|---|---|
| `anthropic: no API key` | env unset | `export ANTHROPIC_API_KEY=...` |
| `anthropic HTTP 401` | bad key | check the key |
| `anthropic HTTP 429` | rate limited | lower `--workers` or wait |
| `anthropic HTTP 5xx` | API down | retry; next run picks up failed rows |
| `parse: no valid verdict JSON` | model returned prose | rerun; if persistent, tighten the system prompt |
| `considered=0` but you expected work | survivors have no `ok` enrichment, or all are scored at current taste_version | check `scout stats`, run `scout enrich`, or use `--force` |

## What this stage deliberately doesn't do

- **No tool use.** The model gets one shot with the data we hand it. If
  the data isn't enough, that's an enrichment problem, not a model problem.
- **No multi-turn.** No "are you sure? explain more." One JSON object out.
- **No web search.** Same reason — that's enrichment's job.
- **No prompt caching.** Each call is independent. Worth adding when we
  re-score the same taste against many companies — that's a future
  optimization, not v1.
- **No structured outputs / function calling.** JSON-in-text with tolerant
  parsing is fine at this scale and keeps the request shape trivial.
