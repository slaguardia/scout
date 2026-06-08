# Chat feature

A Claude-powered chat with tool integrations, on `claude-sonnet-4-6`. Two
surfaces share one engine. This doc is the **source of record** for the build —
the checklist below (done-criteria + file lists) is authoritative. See
[north-star.md](./north-star.md) for the canonical architecture and
[data-model.md](./data-model.md) for the existing schema.

## What it is

1. **Global agent chat** — the user says "I applied to X, here's the link" and
   the agent captures/tracks the job (creating the company/posting if missing).
   An agentic tool-use loop.
2. **Per-entity chat** — a Chat button on the company panel and on each posting
   card opens a thread *seeded* with that entity's full context (detail,
   enrichment text, verdict, postings) for Q&A and research. Same engine, a
   different system prompt plus the seeded context block.

Chat is **scout-local and disposable** — like the rest of `scout.db`. It is
**never** written to the brain (the brain stays read-only for scout).

## The one piece of new machinery — the tool loop

`internal/anthropic` does single-shot `Send` today, plus a `pause_turn`
continuation for the hosted `web_search` *server* tool. There is **no
client-side loop** that executes model-requested *custom* tools and feeds
`tool_result` back. That loop is the core new build; everything else wraps code
that already works (`internal/capture`, `internal/store`). `ContentBlock.Raw`
already preserves blocks verbatim, so replaying assistant turns is
straightforward.

Streaming **and** tool use together means: parse `content_block_*` /
`message_delta` SSE events, detect the `tool_use` stop, execute the tool(s),
append the `tool_use` + `tool_result` blocks, then open a *fresh* streamed
request for the continuation — loop until `end_turn`. Cap iterations so a
runaway model can't loop forever.

## Tool surface

Each tool is a Go func + a JSON input schema, a thin wrapper over existing code.
Writes are dedicated tools (not a bash-style escape hatch) so the harness can
gate/render them.

| Tool | Backed by | Purpose |
|---|---|---|
| `capture_link` | `internal/capture` | "I applied here: <url>" → upsert company/posting |
| `track_application` | `store.UpdatePostingTracking` | set applied_at / response / outreach / contacts |
| `search` | `store.TriageRows` / `store.ListJobRows` | "did I already add Ramp?" |
| `get_company` | `store.GetCompanyDetail` | pull company detail into context |
| `get_posting` | `store.ListPostings` | pull posting detail into context |
| `set_notes` | `store.UpdateCompanyNotes` | record a human note |
| `set_verdict` | `store.UpsertVerdict` | hand-set a verdict |
| `web_search` | hosted server tool (already wired in `internal/anthropic`) | research a company/role |

## Storage

Two tables, scout-local, disposable. Content is stored as the **raw
content-block JSON array**, not plain text, so `tool_use`/`tool_result` blocks
round-trip verbatim into the next API turn (the reason `ContentBlock.Raw`
exists). A plain-text column would force reconstructing tool calls.

```sql
chat_threads (
  id          TEXT PK,             -- uuid
  scope       TEXT NOT NULL,       -- 'global' | 'company' | 'posting'
  scope_id    TEXT,                -- company/posting id; NULL for global
  title       TEXT,                -- first user line, or model-generated
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME
)

chat_messages (
  id          TEXT PK,             -- uuid
  thread_id   TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,       -- 'user' | 'assistant'
  content     TEXT NOT NULL,       -- JSON: the full content-block array
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)
-- index on chat_messages(thread_id)
```

Design notes:
- An entity panel **reuses the one thread** for its `(scope, scope_id)` — so the
  company chat accumulates across visits.
- The **seeded entity context goes in the per-request system prompt**,
  regenerated each turn — *not* persisted as a message. Keeps it fresh and keeps
  the prompt-cache prefix stable.
- No FK to the brain, no write-back. Deleting a thread cascades its messages.

## Checklist (in dependency order)

1. **Streaming + custom-tool round-trip in `internal/anthropic`.** Add an SSE
   streaming path for `/v1/messages` (parse `content_block_start` /
   `content_block_delta` / `message_delta`; surface text deltas and
   `stop_reason`), and a custom-`tools` round-trip that exposes
   `stop_reason: "tool_use"` with the `tool_use` blocks intact (reuse
   `ContentBlock.Raw` for byte-exact replay). Keep `Send` + pause_turn working.
   **Done when:** unit tests drive a fake SSE byte stream and assert (a) text
   deltas accumulate and (b) a `tool_use` stop is parsed with its block.
   **Files:** `internal/anthropic/client.go`, `internal/anthropic/client_test.go`.

2. **Chat engine + tool registry — new package `internal/chat`.** The loop:
   build request (system prompt + thread history + tools, model
   `claude-sonnet-4-6`, `thinking:{type:"adaptive"}`) → stream → on `tool_use`,
   execute each tool against the store, append `tool_use` + `tool_result`,
   continue with a fresh streamed request → until `end_turn`. Cap iterations.
   Register the eight tools in the table above. **Done when:** a test exercises
   one full tool round-trip with a stubbed Anthropic client and asserts the tool
   ran and the loop terminated. **Depends on:** #1. **Files:** `internal/chat/*.go`
   (+ tests).

3. **Schema + store methods.** Migration
   `internal/store/migrations/0032_chat.sql` creating `chat_threads` +
   `chat_messages` (+ `chat_messages(thread_id)` index) as specified above.
   Store methods: open-or-create a thread by `(scope, scope_id)`, append a
   message, list a thread's messages oldest-first, list threads by scope.
   **Done when:** store tests round-trip a thread + messages including a
   `tool_use`/`tool_result` content array, and `Open()` applies 0032 cleanly.
   **Depends on:** nothing (schema is independent of the engine; can run
   concurrently with #2). **Files:** `internal/store/migrations/0032_chat.sql`,
   `internal/store/chat.go` (+ test).

4. **HTTP layer.** `POST /api/chat/{thread}/message` (kick a turn),
   `GET /api/chat/{thread}/stream` (SSE — mirror the existing
   `/api/jobs/{id}/stream` pattern), `GET /api/chat/threads?scope=&scope_id=`
   (open-or-create, returns the thread). Build the seeded entity context into the
   per-request system prompt — do not persist it as a message. **Done when:** the
   end-to-end smoke (Definition of done) passes. **Depends on:** #2, #3.
   **Files:** `internal/web/chat.go`, route wiring in `internal/web/server.go`.

5. **Web UI.** A global chat entry point, plus a Chat button on the company panel
   and each posting card that resolves its `(scope, scope_id)` thread and opens a
   streaming pane (consume the SSE endpoint). Follow scout's inline/auto-save
   idioms. **Done when:** `cd web && npm run build` succeeds, `internal/web/dist/`
   is refreshed, and both surfaces send + stream in the running binary.
   **Depends on:** #4. **Files:** `web/**` (+ rebuilt, committed
   `internal/web/dist/`).

## Definition of done

Every checklist item done **and** verified, `go test ./...` and `go vet ./...`
pass, and an end-to-end curl-smoke on a throwaway DB succeeds: create a global
thread, POST an "I applied to <ashby/greenhouse/lever posting URL>" message,
consume the SSE stream to `end_turn`, and confirm a `companies` row + a tracked
`job_postings` row (`applied_at` set) now exist. For the UI: `npm run build`
refreshes `internal/web/dist/` and both surfaces send + stream in the binary.

## Non-goals

- No write-back to the brain (chat stays scout-local).
- No outreach *message content* in chat — that lives in the outreach pipeline
  (see [outreach-agent.md](./outreach-agent.md)).
- No per-message token accounting or separate tool-call log table — the trace
  lives in the stored message JSON.
