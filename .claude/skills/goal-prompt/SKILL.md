---
name: goal-prompt
description: "Turn a checklist/feature spec into a self-contained GOAL PROMPT to hand to a separate orchestrator agent — focused on completing the whole checklist with explicit subagent-delegation guidance. Does NOT implement; it emits a prompt the user copies elsewhere. Triggers on: /goal-prompt, goal prompt, orchestrator prompt, make a prompt for another agent, hand-off prompt."
---

# Goal Prompt

Produce **one self-contained goal prompt** that the user copies and gives to a
*different* agent (an orchestrator) to drive an entire body of work to done,
delegating to subagents where it pays off.

**This skill does not implement anything.** Its only output is the prompt,
emitted in a single fenced block the user can copy verbatim. No edits, no
commits, no running the work.

**Companion to** `interactive-planning` (writes `.tasks/`) and `execute`
(implements in *this* conversation). Reach for `goal-prompt` when the work
should be handed off to a separate orchestrating agent — typically because it's
large, parallelizable, or the user wants it run elsewhere.

---

## Inputs — where the checklist comes from

Resolve the source in this order:

1. **Explicit arg** — a path (`.tasks/FEAT-.../`, a `docs/*.md` spec) or a task ID.
2. **The conversation** — a checklist/build-sequence already worked out here.
3. **Ask** — if none of the above yields a concrete checklist, ask the user for
   the spec or the `.tasks` ID. Don't invent scope.

Read the source fully before writing the prompt. For `.tasks/` features, read
`feature.json` + every `stories/US-*.json`. For a docs spec, read the whole
file.

**Reference the checklist; don't duplicate it.** When the source is a durable,
committed artifact the orchestrator can open itself (a `docs/*.md` spec, a
`.tasks/` feature), the goal prompt must **point to that file as the source of
record** and tell the orchestrator to read it — never copy the full checklist
inline. A second copy in the prompt immediately drifts from the doc. Inline only
the **orchestration layer** the doc doesn't carry: the delegation plan,
sequencing/dependencies, constraints, and the definition of done. Keep the
checklist itself as a thin list of deliverable *headlines* that map onto the
doc's sections (e.g. "the storage layer — see the doc's Storage section"), not
the full done-criteria and file lists.

"Self-contained" therefore means the orchestrator needs nothing from *this
conversation* — not that it needs nothing from the repo. Pointing it at a
committed doc it can read is fine and preferred. Only when there is **no durable
source** (the checklist exists solely in this chat) do you inline the full
checklist, because there's nothing stable to reference.

---

## Process

1. **Extract the deliverables** as a concrete, ordered checklist — each item
   phrased as an observable outcome with its own done-criteria.
2. **Map dependencies** — what blocks what. This drives sequencing in the prompt.
3. **Decide the delegation plan** — for each item (or group), classify it using
   the heuristics below: parallelizable fan-out, research, review, or
   main-thread serial work. This is the part that makes the prompt valuable —
   don't skip it.
4. **Pull in project constraints** — bake the repo's real rules into the prompt
   (see *Scout conventions* below) so the orchestrator doesn't have to rediscover
   them. Verify any file/command you cite still exists before including it.
5. **Emit the prompt** using the template. Then stop — tell the user it's ready
   to copy.

---

## Delegation heuristics (encode these into the prompt)

| Delegate to subagents | Keep on the main thread |
|---|---|
| Independent files/modules that don't touch each other → fan out in one batch | Cross-cutting architecture & integration decisions |
| Read-heavy exploration/research → return findings, not file dumps | Anything needing the full task's context to get right |
| Adversarial review / verification of a completed change | Sequential edits to the *same* file (subagents would conflict) |
| Repetitive transforms across many call sites | The final integration + end-to-end smoke test |

Rules to state explicitly in the prompt:
- **Parallel only when independent.** If two items edit the same file or one
  depends on the other's output, serialize them.
- **Use worktree isolation** when subagents mutate files concurrently, so they
  don't clobber each other.
- **Don't over-delegate.** A trivial one-file edit is faster done directly than
  farmed out. Delegation has overhead; spend it where the parallelism or the
  independent-context is real.
- **Verify before marking done.** Every checklist item needs observable
  evidence (a passing test, a curl-smoke, a successful build) — not "I touched
  the code."

---

## Scout conventions to bake in (verify each is still true before citing)

- **Stack:** Go · SQLite (`modernc.org/sqlite`, pure-Go, no CGO) · direct
  Anthropic HTTP (no SDK) · brain over HTTP/JSON. Models: Haiku verdicts,
  Sonnet distill/outreach.
- **Build & verify loop:** build → curl-smoke on a throwaway DB → ff-merge to
  master (master is the running app). Run `go test ./...` and `go vet`.
- **The brain is read-only for scout** — recall reads only, never write-back.
- **Web UI is a Vite PWA in `web/`** — changing it means `cd web && npm run
  build` to refresh `internal/web/dist/` (committed + `go:embed`'d). The Go
  binary embeds dist; a UI change isn't live until dist is rebuilt.
- **Migrations** live in `internal/store/migrations/NNNN_*.sql`, apply in
  filename order on `Open()`. New schema = next-numbered migration.
- **Prefer inline auto-save editing** in the UI (save on blur/Enter, revert on
  Esc; reuse `wireInlineField()`).
- **`north-star.md` is canonical** for architecture.

Include only the conventions relevant to the work at hand; drop the rest.

---

## Output template

Emit exactly this shape, filled in, inside one fenced block:

````
# Goal: <one-line outcome>

## Source of record — READ THIS FIRST   (include only when a durable doc/.tasks exists)
The full spec and checklist live in **<path to doc / .tasks dir>**. Read it in
full before doing anything; it is authoritative. This prompt only adds the
orchestration layer (sequencing, delegation, verification) on top of it. If
anything here conflicts with the doc, the doc wins.

## Context
<2-4 sentences: what's being built, why, and the key architecture facts the
orchestrator needs. Needs nothing from prior chat — a committed doc it can read
is fine to reference.>

## Definition of done
The work is complete when every deliverable below is done AND verified, the
full test suite passes (`go test ./...`, `go vet`), and <end-to-end smoke check>.

## Deliverables (headlines — full done-criteria in the source doc)
<When a source doc exists, list thin headlines that map onto its sections; do
NOT restate the done-criteria/file lists — they live in the doc.>
1. [ ] <deliverable headline> — see doc: <section>. Depends on: <#>.
2. [ ] <deliverable headline> — see doc: <section>. Depends on: #1.
<Only when there is NO durable source, inline full items instead:
1. [ ] <deliverable> — done when: <observable evidence>. Files: <paths>.>
...

## Delegation plan
- **Serial / main thread:** <items that need full context or share files>.
- **Parallel fan-out:** <independent items to batch as subagents>; isolate with
  worktrees since they touch <area> concurrently.
- **Research subagents:** <exploration to delegate; return findings only>.
- **Review subagents:** after <item>, spawn an adversarial reviewer to verify
  <what>.
- Do NOT parallelize <X and Y> — <reason (shared file / dependency)>.

## Constraints
<the relevant Scout conventions, verbatim and specific>

## Reporting
Work in dependency order. After each item: state what changed and the evidence
it's done. If blocked, say exactly what's needed. Don't mark an item done
without observable verification.
````

After emitting, say one line: "Copy the block above into the orchestrator
agent." Do not start implementing.
