# scout UI v3 — control surface

> Status: **built.** The triage UI now drives the pipeline; the terminal is
> optional. The CLI remains a secondary entrypoint (cron, scripting, debug).
>
> Decisions taken at build time: in-UI taste/playbook editing **yes** (local
> files only, brain-isolated); ingest via **CSV upload**; no export — durable
> run history in the `runs` table is the "what did this run identify" record;
> progress via **structured callbacks**. The optional V4 in-UI editor was
> pulled forward into this build.

## 1. Goal

Run the whole loop — ingest → enrich → verdict → episodes — from the browser,
with live progress, without touching the terminal. The UI becomes the home
base; the CLI is the escape hatch.

## 2. What's changing (and what isn't)

**Changing:** the UI gains the ability to *trigger* the long-running stages and
watch them run. New backend job-runner subsystem. CSV upload.

**Not changing:**
- The stage logic. `ingest.CSV.Run`, `enrich.Enricher.Run`, `verdict.Scorer.Run`,
  the episode shipper — all stay exactly as they are. The UI calls the same
  functions the CLI does.
- The CLI. It stays as a thin secondary entrypoint. "Abandon the CLI" means
  *you never have to use it*, not *delete it*. ~200 lines, free to keep,
  useful for cron/scripting/debug-when-the-UI-is-broken.
- The three/four-store split. Notion handoff stays manual (clipboard).
- Taste / playbook remain file edits (or a future in-UI editor — separate
  decision, see §8).

## 3. The core problem: stages are long-running

Enrich hits ~100 URLs (seconds to minutes). Verdict makes hundreds of API
calls (minutes). An HTTP handler can't block that long — the browser would
time out and you'd have no progress feedback. So we need a **job runner**:
a stage kicks off in a background goroutine, the HTTP layer returns
immediately with a job id, and the UI streams progress.

## 4. Architecture

### `internal/jobs` — a tiny in-process job runner

```go
type Job struct {
    ID        string
    Stage     string     // "ingest" | "enrich" | "verdict" | "episodes"
    Status    string     // "running" | "done" | "failed"
    Started   time.Time
    Finished  time.Time
    Lines     []string   // ring buffer of progress/log lines
    Err       string
    Summary   map[string]any // structured result (counts, by-verdict, etc.)
}

type Runner struct {
    mu   sync.Mutex
    jobs map[string]*Job
    // one running job per stage at a time (don't run two enrichers)
    active map[string]string // stage -> jobID
}
```

- `Runner.Start(stage, fn)` — refuses if that stage already has an active job,
  else spawns a goroutine running `fn`, which writes progress lines to the
  job via a callback.
- Jobs are **in-memory**. Process restart loses history — fine; the DB has the
  actual results. Keep the last ~20 jobs for the UI's "recent runs" list.
- Cancellation: each job holds a `context.CancelFunc`; `Runner.Cancel(id)`
  cancels it. The stages already respect `ctx` cancellation.

### Progress plumbing

The stage `Run` functions currently print to stdout and return a struct. Two
options for getting progress to the UI:

- **(a) Capture structured progress.** Add an optional `progress func(string)`
  callback to each stage's options. Minimal-noise, typed. Requires touching
  each stage signature.
- **(b) Capture stdout.** Redirect the stage's `fmt.Printf` output into the
  job's line buffer. Zero changes to stage code, but hacky (global stdout
  capture under a mutex).

**Recommendation: (a)** for enrich/verdict (they already have natural
per-item progress points), accept it's a small signature change. It's cleaner
and the stages are ours.

### HTTP endpoints (additive to the existing web server)

| Route | Verb | Purpose |
|---|---|---|
| `/api/run/{stage}` | POST | start a stage job; body carries options (e.g. `{force:true, escalateModel:"…"}`); returns `{job_id}` |
| `/api/run/{id}/stream` | GET | SSE: streams log lines, then a final `{status, summary}` event |
| `/api/jobs` | GET | recent jobs (for a "history" view) |
| `/api/run/{id}/cancel` | POST | cancel a running job |
| `/api/ingest` | POST | multipart CSV upload → temp file → `ingest.CSV.Run` → returns counts |

All localhost, no auth (unchanged posture).

### UI changes

- A **"Run" panel** in the sidebar (or a top-bar action group): buttons for
  Enrich, Verdict (with an "escalate to Sonnet" checkbox), Episodes, plus an
  **Ingest** button that opens a file picker.
- Clicking a button POSTs to `/api/run/{stage}`, then opens a small **progress
  drawer** (bottom or right) that subscribes to the SSE stream and prints
  lines live. On completion it shows the summary and a "refresh" affordance.
- The list + stats auto-refresh when a job finishes.
- A disabled state while a stage is mid-run (no double-fire).

## 5. Safety / concurrency

- **One job per stage.** The runner refuses a second enrich while one runs.
- **SQLite single-writer.** Stages already serialize writes through one
  connection; the job runner doesn't change that. Don't run verdict and
  enrich simultaneously against rows they'd both touch — simplest guard is
  "one job at a time, period" (global lock) for v3, relax later if needed.
- **API key.** `verdict` needs `ANTHROPIC_API_KEY` in the server process env
  at launch. If unset, the Verdict button is disabled with a tooltip.
- **Cancellation leaves partial state.** That's fine — every stage is
  idempotent and resumable; a cancelled enrich just means some rows aren't
  fetched yet, and re-running picks them up.

## 6. What this explicitly is NOT

- Not a multi-user job queue. One person, one machine, in-memory jobs.
- Not durable jobs. Restart = lose job history (not results).
- Not real-time collaboration / websockets. SSE one-way is enough.
- Not auth. Localhost only.

## 7. Effort

Rough, honest:
- `internal/jobs` runner: ~120 lines.
- Stage progress callbacks: ~40 lines across 3 stages.
- HTTP endpoints (5) + SSE: ~150 lines.
- CSV upload handling: ~40 lines.
- UI run panel + progress drawer + SSE client: ~200 lines.

≈ **550 lines, half a day.** No new external deps (SSE is plain
`http.Flusher`; multipart is stdlib).

## 8. Open decisions (need your call before building)

1. **In-UI taste / playbook editing?** Right now they're file edits. If the UI
   is home base, a read+edit textarea for `taste.md` / `playbook.md` that
   writes the file and shows the new version hash is a natural add (~60 lines).
   Footgun risk is low (it's your own machine). **Include or defer?**
2. **Ingest source.** CSV upload via file picker, or point at a path on disk,
   or both? Upload is friendlier; path is simpler. **Lean: upload.**
3. **Promote-to-Notion.** Today "Mark tracked" copies a `tracker.py add`
   command. With a control surface we *could* actually shell out to
   `tracker.py`. That crosses the deliberate "manual handoff" friction
   (PRD §3 non-goal). **Lean: keep clipboard, don't auto-run.**
4. **Progress mechanism.** Recommendation is structured callbacks (4a) over
   stdout capture (4b). **Confirm.**

## 9. Milestones

1. **V1 — job runner + enrich/verdict buttons.** The 80% case: the two stages
   you re-run as taste/playbook change, triggerable with live progress.
2. **V2 — ingest upload.** CSV drop from the browser.
3. **V3 — episodes button + job history view.**
4. **V4 (optional) — in-UI taste/playbook editor** (pending §8.1).

V1 alone makes the terminal optional for the daily loop. V2–V4 close the
remaining gaps.
