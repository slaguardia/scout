---
name: goal-prompt
description: "Emit a SHORT hand-off prompt that STARTS WITH the `/goal` built-in command — a couple of sentences naming the outcome and pointing at the spec doc/.tasks — to paste into a separate Claude window. Does NOT implement, and does NOT reproduce the checklist, build order, or a delegation plan. Triggers on: /goal-prompt, goal prompt, hand-off prompt, make a prompt for another agent, orchestrator prompt."
---

# Goal Prompt

Emit **one short goal prompt** — a couple of sentences — that the user copies
into a *separate* Claude window to drive a body of work. The block **always
starts with the `/goal` built-in Claude Code command**, then names the outcome
and **points at the spec doc** (or `.tasks/` feature) that holds all the detail.

**This skill does not implement anything,** and it does **not** reproduce the
checklist, build order, delegation plan, or constraints — those live in the doc.
Its only output is a short prompt in one fenced block the user copies verbatim.

**Companion to** `interactive-planning` (writes the `.tasks/` or doc that this
prompt points at) and `execute` (implements in *this* conversation). Reach for
`goal-prompt` when the work should be handed to a separate Claude window.

## How it works

1. **Find the source.** Resolve in order: an explicit arg (a `docs/*.md` spec, a
   `.tasks/` dir, or a task ID), the doc/spec worked out in this conversation,
   or — if none exists — ask the user which doc/feature they mean. Don't invent
   scope.
2. **Point, don't restate.** When a durable committed doc exists, the goal
   prompt's whole job is to name the outcome in a sentence or two and tell the
   other agent to read that doc and implement it. Do **not** copy the checklist,
   the file list, the delegation plan, or the constraints — a second copy just
   drifts from the doc.
3. **Emit + stop.** One fenced block, a couple of sentences. Then tell the user
   to copy it. Don't start implementing.

## Output shape

A short paragraph in a fenced block that **begins with the `/goal` command** —
name the outcome, point at the doc, and add at most one must-know guardrail if
it's genuinely essential:

````
/goal <one-line outcome — what to build/do>. The full spec, build order, and
constraints are in <path to doc / .tasks> — read it and implement it end to end.
<Optional: one sentence of a hard guardrail or the build/verify loop, only if
essential.>
````

Keep it tight. If there is **no** durable doc to point at, write a slightly
fuller self-contained goal — still just a short paragraph — that describes the
outcome and where to look. But prefer pointing at a doc; if the work is worth
handing off, it's usually worth having a doc first.

After emitting, say one line: "Copy the block above into the other Claude
window." Do not start implementing.
