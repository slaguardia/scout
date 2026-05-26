# Brainbot integration

Scout talks to the brain (brainbot's runtime service) over **MCP JSON-RPC
over HTTP**. The wire protocol, tool surface, and auth story are all
defined and maintained by brainbot — this doc describes the scout side of
that integration: which tools we call, with what arguments, how we shape
their results into scout's data model.

If you're touching this file or `internal/brainbot/client.go`, **read
brainbot's docs first** — they're authoritative.

## Canonical references (in brainbot)

- [`docs/consumer-integration.md`](../../brainbot/docs/consumer-integration.md) — the doorway. Quickstart, gotchas, language recipes.
- [`docs/consumer-api.md`](../../brainbot/docs/consumer-api.md) — exhaustive per-tool reference.
- [`migrate/graphiti_clients.py`](../../brainbot/migrate/graphiti_clients.py) — canonical Python client.
- [`scout/internal/brainbot/client.go`](../../scout/internal/brainbot/client.go) — canonical Go client. (This is ours; it mirrors the Python client's pattern.)

Scout's Go client is the reference for any future Go consumer of brainbot.

## What scout uses

Of the brain's tool surface, scout uses exactly two:

| Tool | Where | Purpose |
|---|---|---|
| `search_memory_facts` | `scout verdict --brainbot URL` | Pull the user's job-search taste as a set of natural-language facts. |
| `add_memory` | `scout episodes --brainbot URL` | Write each verdict back as an episode for async entity extraction. |

No `search_nodes`, no `get_episodes`, no batch tools. The integration
surface is intentionally minimal — taste in, verdicts out, that's it.

## Wire shape (covered by brainbot's docs, summarized here)

- **Endpoint:** `POST {base}/mcp`
- **Headers:** `Content-Type: application/json`, `Accept: application/json, text/event-stream`. Bearer auth (`Authorization: Bearer <token>`) on the VPS path; none locally.
- **Session handshake (lazy, once per `Client`):**
  1. POST `initialize` with `protocolVersion: "2025-03-26"`, empty capabilities, `clientInfo: {name: "scout", version: "0.1"}`.
  2. Server returns 2xx with `Mcp-Session-Id` header. Scout caches it.
  3. POST `notifications/initialized` to satisfy the spec.
- **Tool call:** POST `{"jsonrpc":"2.0", "id":<uuid>, "method":"tools/call", "params":{"name":<tool>, "arguments":{...}}}`.
- **Response:** either `application/json` or `text/event-stream`. Scout parses both — for SSE, the final `data:` line wins. Result content is unwrapped from `result.content[0].text` (which is itself JSON), then returned as a `map[string]any`.

All of that is implemented in `mcpCall`, `ensureSession`, `postJSON`,
`parseMCPResponse`, and `extractSSEFinalMessage` in `internal/brainbot/client.go`.

## How scout uses each tool

### Taste pull — `search_memory_facts`

`scout verdict --brainbot <url>` calls:

```json
{
  "name": "search_memory_facts",
  "arguments": {
    "query":     "job search taste preferences",
    "max_facts": 20,
    "group_ids": ["brain"]
  }
}
```

The brain's vector + graph search returns up to 20 facts. Scout reads
`facts[].fact` (the natural-language string on each fact) and joins them
with newlines to produce the narrative taste block.

```
<fact 1>
<fact 2>
<fact 3>
...
```

That string is hashed (sha256[:12]) to make `taste_version`, and fed into
the verdict prompt verbatim — same prompt assembly as the local-file
path. `taste.Block.Source` is set to `brainbot:<base>` so logs make it
clear which path was used.

**On failure** (network error, empty fact list, etc.): scout logs the
error and falls back to `taste.md`. Verdict still runs — the brain is an
enhancement, not a hard dep, per the brainbot integration guidance.

**Tradeoffs of this synthesis approach:**
- It's the simplest thing that works. The model is good at reading a
  loose pile of facts.
- The facts the brain returns are filtered by semantic relevance to the
  query — not a curated taste document. So the quality of the taste block
  depends on what's been seeded in the brain.
- We don't reorder, dedupe, or LLM-summarize the facts. If we ever need
  to, that's a pre-pass before the verdict call. Not built.

### Episode write-back — `add_memory`

`scout episodes --brainbot <url>` calls, once per pending verdict:

```json
{
  "name": "add_memory",
  "arguments": {
    "name":               "Scout verdict: <company name>",
    "episode_body":       "<natural-language sentence, see below>",
    "source":             "text",
    "source_description": "scout",
    "group_id":           "brain"
  }
}
```

The `episode_body` is built by `formatEpisodeBody`:

```
Scout verdicted <Company> (<domain>) as "<yes|maybe|no>" on <YYYY-MM-DD>.
Reason: <reason>. Taste version: <taste_version>.
```

`add_memory` is asynchronous on the brain side — the call returns under a
second, but extraction takes 2–10s. Scout doesn't poll. On 2xx, scout
inserts `(company_id, taste_version)` into `episodes_sent` and won't send
again.

**Why prose and not structured JSON for the body:** the brain's
extraction pipeline is built around natural-language episodes — that's
what its entity-extraction prompt expects. Structured JSON would
under-extract. The body reads like something a person might write into
their journal, which is the brain's sweet spot.

## Group namespace

Both calls use `group_id: "brain"` — the default global namespace
(`groupID` constant in `internal/brainbot/client.go`). Per the brainbot
integration guide:

- Cross-source dedup happens within a group_id.
- `"brain"` is the user-global default.
- Don't use `-` in group_ids (RediSearch treats as NOT).

If scout ever needs an isolated namespace (test runs, multi-user later),
expose `--group-id` as a flag and thread it through. Today both call
sites hardcode `"brain"`.

## Auth

`Client.Auth` is the bearer token. Scout doesn't currently expose this as
a flag — when the brain runs locally, no auth. When we point at a VPS
deployment, add an `--auth` flag (or `BRAIN_BEARER_TOKEN` env passthrough)
to `cmd/scout/main.go`. Not built yet because we haven't needed it.

## Failure handling

Per the brainbot consumer-integration guide ("the brain should never be a
single point of failure"):

- **Taste fetch fails** → scout logs and falls back to `taste.md`. Verdict
  run continues with degraded-but-working input.
- **Episode write fails** → scout logs the company and keeps going. The
  row stays out of `episodes_sent`, so the next run retries it.

No exponential backoff. No circuit breaker. The retry cadence is "next
time you run the command."

## Session lifecycle

The MCP session-id is cached on the `Client` struct for the life of the
process. Every scout subcommand creates a fresh `Client` and re-does the
handshake — which is fine because scout is a short-lived CLI. If we ever
build a long-running daemon, the session-id will need a refresh strategy
(the spec doesn't define an expiry, but the server is free to invalidate).

## What scout does NOT do

Worth being explicit about, because someone reading this will wonder:

- **No tool discovery.** Scout calls two hardcoded tools by name. The MCP
  runtime tool-discovery surface is for LLM-driven consumers (Claude Code).
  Scout is a typed Go consumer, so it uses the typed pattern.
- **No `search_nodes` calls.** The brain has rich entity search; scout
  doesn't use it. If we ever want to enrich a verdict prompt with "what
  did the brain know about this company already," `search_nodes(query=name)`
  is the call.
- **No `get_episodes`.** Scout doesn't read its own history back from the
  brain. If we want "have I verdicted this before?" that's a future
  feature.
- **No batch.** One episode per `add_memory` call. The brain has
  `add_memory_batch`; scout doesn't wrap it. At our scale (dozens of
  verdicts per run) per-call latency dominates, not throughput.
- **No reranking variants.** The brain offers `_reranked` versions of
  search calls; scout uses the plain ones.

Add any of the above by extending `internal/brainbot/client.go` — it's
~300 lines and the pattern is consistent.
