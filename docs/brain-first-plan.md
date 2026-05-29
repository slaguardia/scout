# Brain-first plan — execution-ready

> **How to use this document.** Point a fresh Claude at this file and let it
> run. Work the phases **in order** (A → B → C → D); A is a hard prerequisite
> for B. For every phase: make the change, `go build ./... && go vet ./... &&
> go test ./...` clean, verify the stated acceptance, then commit with a
> one-line message naming the phase. Stay inside each phase's scope; flag
> adjacent issues rather than expanding. No new external Go deps. The embedded
> `internal/web/index.html` stays a single file.
>
> Status of inputs: **Phase C is blocked on a real Crunchbase CSV** (Alex is
> downloading it). Phases A, B, D can proceed without it. When the CSV lands,
> fill in the "Real CSV" section of Phase C before running it.

---

## Why this plan exists (the finding)

Scout's brain integration is built against a **retired** API. The brain
(`~/Repositories/brainbot`) narrowed its contract to **three operations** and
no longer exposes the Graphiti MCP surface scout calls. Per
`brainbot/docs/consumer-api.md`:

> "The rich graph-introspection surface of the old standalone Graphiti MCP
> server (`add_memory`, `search_nodes`, `delete_*`, `clear_graph`, …) is **not**
> exposed — the brain narrowed the contract to capture/recall/profile."

Scout currently calls `search_memory_facts`, `add_memory`, and `search_nodes`
over an MCP handshake. **All three tools are gone.** Every brain call silently
fails and falls back to `taste.md`. That is the root cause of "we're leaning on
the local file instead of the brain."

The brain now exposes (prefer **plain HTTP/JSON** for typed consumers like
scout; MCP is reserved for Claude Code):

| Op | HTTP | Returns | Use in scout |
|---|---|---|---|
| Profile | `GET /profile` | all currently-true facts about Alex (unscored) | the taste block (WHAT Alex wants) |
| Recall | `GET /recall?q=&limit=` | scored facts for a query | per-company memory (WHAT the brain knows about this company) |
| Capture | `POST /capture` `{text}` | `{mode,episodes,topic,facts}` | write a verdict back as natural language |
| Health | `GET /health` | `{ok:true}` | startup probe to decide brain-vs-fallback |

Reference client to mirror: `brainbot/migrate/graphiti_clients.py` (class
`BrainClient`). Spec: `brainbot/docs/consumer-api.md`.

## The intended architecture (from brainbot's own docs)

Brainbot's `value-prop.md` names its #1 roadmap item as the "**job-fit
scorer**" example consumer — **that is scout**. The division of labor is
explicit: *"The intelligence belongs to each consumer (each consumer brings its
own LLM and reasons over the brain's outputs)."*

```
brain service ──(profile / recall)──▶ scout: reasons with its own LLM (Haiku)
      ▲                                         │
      └──────────── capture(verdict) ───────────┘   (loop closes: verdicts become memory)
```

- **Brain** = substrate of facts. Reports, never decides.
- **Scout** = the intelligence. Pulls facts, reasons, verdicts, captures back.
- **playbook.md** = *how scout decides* (procedure). Stays local — not brain territory.
- **taste.toml** = cheap SQL pre-filter. Stays local — not "intelligence."
- **taste.md** = offline fallback for the narrative taste block. Kept, but no
  further investment; the brain is the path.

## Locked decisions

1. **Taste block = `GET /profile`** (full picture; brainbot recommends reasoning
   over the whole profile at current scale). Join the fact strings into the
   narrative block.
2. **Per-company context = `recall(companyName, limit=5)`**, with a **score
   threshold ~0.4** so fresh companies (all-low scores) inject nothing. This is
   the loop-closer with `capture`.
3. **`taste.md` stays as fallback only.** Brain is primary. No new UI work for
   the taste editor (already built; leave as-is).
4. **Plain HTTP/JSON.** Delete scout's MCP handshake/SSE machinery entirely.
5. **Web-first.** The browser is the interface; the CLI is demoted to
   secondary (automation/cron/debug), not deleted.
6. **Brain isolation invariant (unchanged):** the taste/playbook *editor*
   (`internal/web/editor.go`) writes local files only and must never reference
   the brain client. Only verdict (profile/recall) and episode write-back
   (capture) touch the brain.

---

## Phase A — Re-point the brain client to the live contract

**Goal:** scout speaks the brain's real API. Net code *removed*, not added.

**Files:**
- `internal/brainbot/client.go` — **rewrite**.

**Changes:**
- Delete: `mcpCall`, `ensureSession`, `postJSON`, `parseMCPResponse`,
  `extractSSEFinalMessage`, the session-id field, the MCP constants
  (`mcpProtocolVer`, `groupID`, etc.), `FetchTaste`, `SendEpisode`,
  `ShipEpisodes`, `SearchNodes`, `Node`, `Episode`, `Company`,
  `formatEpisodeBody`, `EpisodeFromVerdict`. The `google/uuid` import goes too.
- New thin HTTP client (mirror `brainbot/migrate/graphiti_clients.py`):

  ```go
  type Client struct {
      BaseURL string
      Auth    string // optional bearer (VPS)
      HTTP    *http.Client
  }
  func New(baseURL string) *Client            // trims trailing /, 60s timeout
  func (c *Client) Enabled() bool             // BaseURL != ""

  type Fact struct {
      Fact      string  `json:"fact"`
      Name      string  `json:"name"`
      Score     float64 `json:"score"`       // present on recall, 0 on profile
      ValidAt   string  `json:"valid_at"`
      InvalidAt string  `json:"invalid_at"`
  }

  func (c *Client) Health(ctx) error                              // GET  /health
  func (c *Client) Profile(ctx) ([]Fact, error)                   // GET  /profile  -> .facts
  func (c *Client) Recall(ctx, query string, limit int) ([]Fact, error) // GET /recall?q=&limit= -> .facts
  func (c *Client) Capture(ctx, text string) error                // POST /capture {text}
  ```
- Headers: `Accept: application/json`; `Authorization: Bearer <Auth>` when set.
- Errors: non-2xx → error carrying the body's `{"error":...}` if present.

**Acceptance:**
- `go build ./...` will FAIL until Phase B updates call sites — that's expected.
  To keep A independently compilable, update the call sites' *signatures* in the
  same phase (they're rewritten properly in B). Simplest: do A and B as one
  branch but two commits, with A's commit being "client rewrite + make it
  compile" and B being "wire brain-primary intelligence."
- A `go test`-able unit on the client against an `httptest.Server` returning the
  documented JSON shapes for profile/recall/capture (success + non-2xx).

**Verify:** unit test green.

---

## Phase B — Brain-primary intelligence

**Goal:** the brain supplies the taste; scout reasons; verdicts flow back.

**Files:**
- `internal/taste/taste.go` — add a way to build a `Block` from brain facts.
- `internal/verdict/verdict.go` — taste source + per-company recall + capture.
- `cmd/scout/main.go` — `cmdVerdict`, `cmdEpisodes`, `cmdServe` wiring + a
  default brain URL.
- `internal/web/server.go`, `internal/web/run.go` — brain context route +
  episodes job use the new client.

**Changes:**

1. **Default brain URL + health-gated selection.**
   - `--brainbot` defaults to `http://127.0.0.1:8000` (the brain's standard
     local address) on `verdict` and `serve`, instead of empty.
   - At startup, `Health(ctx)`; if healthy, brain is primary. If not, log once
     and fall back to `taste.md`. ("I only want the brain" → it's on by default;
     fallback only when the brain is genuinely down.)

2. **Taste block from profile.**
   - New: `taste.FromFacts(facts []string, source string) *Block` →
     `Text = join("\n", facts)`, `Version = Hash(text)`, `Source = "brain:profile@<url>"`.
   - `cmdVerdict`/`serve`: if brain healthy → `Profile(ctx)` → `FromFacts`. Else
     `taste.LoadFile`. The playbook still folds into the version exactly as today
     (`Version = Hash(playbook + "\n---taste---\n" + tasteText)`).
   - This means **when the brain learns something new, the profile changes →
     version changes → verdicts re-score next run.** That is the original PRD §6
     bet, finally wired correctly. Expected behavior, not a bug.

3. **Per-company context via recall.**
   - In `verdict.Scorer.lookupBrain(name)`: call `Recall(name, 5)`, **keep only
     facts with `score >= 0.4`**, return their `fact` strings. Cache per-run
     (the existing `brainCache` map). On error → nil (never fail the verdict).
   - `buildUserPrompt` already appends a "What the brain already knows about this
     company" section — feed it the recalled fact strings.

4. **Episode write-back via capture.**
   - Replace `ShipEpisodes`/`SendEpisode` with: for each pending verdict, build
     the same natural-language sentence (name the company + verdict + reason +
     date; third person, naming Alex so the brain attributes it, e.g.
     `"Alex's scout tool verdicted Acme (acme.com) as \"no\" on 2026-05-28. Reason: crypto wallet (excluded)."`),
     then `Capture(ctx, text)`. **Note:** capture is slow (decompose+extract,
     ~seconds, ~1¢ each) — ship sequentially, emit one progress line each.
   - **Dedup refinement:** `episodes_sent` is currently keyed by
     `(company_id, taste_version)`. Because the brain-derived `taste_version`
     now changes whenever the brain changes, that key would re-capture verdicts
     on every brain update. Change the dedup key to **`(company_id, verdict, reason)`**
     (a content hash) so scout only captures a verdict when the *decision itself*
     is new or changed. Migration: add a `content_key` column or repurpose the
     table; simplest is a new `0006_episode_dedup.sql` adding `verdict_hash TEXT`
     and keying on `(company_id, verdict_hash)`.

5. **Web wiring.**
   - `handleCompanyBrain` (`/api/companies/:id/brain`): `Recall(name, 5)` →
     return facts (UI already renders a brain section; adapt the shape from
     "nodes" to "facts": `{fact, score}`).
   - `episodesJob`: call the new capture-based shipping.
   - `/api/meta` `brain` flag = brain configured **and** healthy.

**Acceptance:**
- `scout verdict` with a running brain: log shows `taste source=brain:profile@... version=...`; verdicts persist; spot-check 2–3 reasons reference profile facts.
- With the brain stopped: logs the fallback, uses `taste.md`, still runs.
- Per-company: a company the brain has history on shows the recalled fact in the
  detail pane's brain section and in the verdict reasoning; a fresh company shows
  "nothing known" and injects nothing.
- Episodes: running it captures new verdicts; re-running with no verdict changes
  is a no-op (content dedup); changing a verdict re-captures only that one.

**Verify:** the above by hand against a local brain (Alex's). If no brain is
running at execution time, verify the fallback path + unit-test the
fact→block and score-threshold logic.

---

## Phase C — Successful Crunchbase CSV import + run  ⚠️ NEEDS REAL CSV

**Goal:** the whole loop works on a real Crunchbase export, end to end.

### Real CSV  *(fill this in when the file is downloaded)*
- Path: `__________________________`
- Exact header row (paste it): `__________________________`
- Row count: `_____`
- Notable quirks (encoding, quoting, range fields): `__________________________`

**Changes:**
- **Verify column aliases** in `internal/ingest/csv.go` against the *real*
  header row above. Crunchbase exports use specific names (commonly
  `Organization Name`, `Industries`, `Headquarters Location`,
  `Number of Employees`, `Last Funding Type`, `Website` / `Domain`,
  `Organization Name URL`). Add/fix aliases so `name`, `domain`, `headcount`,
  `funding_stage`, `location`, `vertical`, `source_id` all map. Do NOT guess —
  match the pasted header.
- Handle real-data quirks surfaced by the run: BOM/encoding, quoted commas
  (already `LazyQuotes`), headcount ranges like `"11-50"` (already handled —
  confirm), missing domains, `—`/unicode dashes.

**End-to-end run (the deliverable):**
1. Fill `taste.toml` `verticals.allowed`/`excluded` for Alex (or confirm the
   pre-filter is intentionally permissive).
2. Brain running + `ANTHROPIC_API_KEY` set.
3. From the **browser**: upload CSV → Enrich → Verdict → triage. Confirm:
   ingest counts sane, enrich fetches real domains, verdicts populate with
   profile-grounded reasons, runs history records each stage with summaries.
4. Capture verdicts back to the brain; confirm via the brain's `/profile` or
   `/recall` that scout's verdicts landed as facts.

**Acceptance:** a real dump goes in and a triage list of good-fit vs not comes
out, visible in the UI, with verdicts grounded in the brain profile and written
back to the brain. Fix whatever real data breaks.

---

## Phase D — Web-first, CLI demoted

**Goal:** the browser is *the* interface; the CLI is clearly secondary.

**Changes:**
- Audit: confirm the browser covers ingest, enrich, verdict, episodes, triage,
  status, taste/playbook view+edit, run history (post-V3 it does). Note any gap.
- Docs/mental-model: update `README.md`, `CLAUDE.md`, and `docs/architecture.md`
  so the web UI is presented as the primary interface and the CLI as
  secondary (automation/cron/debug/headless). Do **not** delete the CLI.
- `docs/brainbot-contract.md`: rewrite for the capture/recall/profile contract
  (the current doc still describes the retired MCP tools).

**Acceptance:** docs reflect web-first + the real brain contract; no functional
web gap remains.

---

## Cross-cutting rules

- Per phase: `go build ./... && go vet ./... && go test ./...` green; commit with
  a one-line message naming the phase; push.
- Brain isolation: editor stays file-only; brain touched only by verdict
  (profile/recall) and episodes (capture).
- No new external Go deps. Single embedded `index.html`.
- Keep the CLI working at every step (it's the fallback/automation surface).
- If a phase's verification needs a live brain or API key that isn't available
  at execution time, do the code + unit tests, run the fallback path, and leave
  a clearly-marked note for Alex to run the live verification.

## Sequencing

```
A (client rewrite) ──▶ B (brain-primary) ──▶ C (real CSV run)   ⚠ needs CSV
                                        └──▶ D (web-first/docs)  (parallel to C)
```

A and B are best done on one branch (A's commit makes it compile, B wires the
intelligence). C waits on the CSV. D can land any time after B.
