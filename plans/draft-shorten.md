# Plan: "Too long → Tighten" on an outreach draft

A one-click button that shortens a finished outreach draft toward the ~120-word
target, reversibly. Status: **proposed** (not built).

## Motivation

Drafts routinely come in long (e.g. 188 words against a ~120 target — the hook
carries most of the weight). The doctrine wants three short paragraphs readable
on a phone. Rather than make the writer obsess over length up front (which trades
against the warm, specific register), give the reviewer a cheap post-hoc control:
tighten on demand, undo if it cut something you wanted.

## UX

- The draft card already has a word count available (the pipeline lints the
  ~120-word body). Surface it: show the count, and when the body is over a
  threshold (~140 words), render a button at the bottom of the card:
  **"Too long · tighten to ~120"**.
- Click → spinner on the button → the editor textarea is replaced with the
  shortened email, the word-count badge re-renders, and the button flips to
  **"Revert"**.
- Click **Revert** → the pre-shorten text is restored exactly, button flips back.
- It operates on the **current** text (the reviewer's edits included), not by
  re-filling the template holes — it tightens what's actually on screen.

## Backend

New endpoint, mirroring the existing per-draft routes (`…/drafts/{id}/sent`,
`PUT …/drafts/{id}`):

`POST /api/outreach/drafts/{id}/shorten` → runs one **Haiku** pass and returns
the shortened email (and re-lints). It does not destructively overwrite history;
the caller swaps the result into the draft edit (`PUT …/drafts/{id}`), same as a
manual edit.

System prompt (mechanical, fact-preserving — same integrity contract as the
humanizer, which may only change wording):

> Tighten this cold email to about 120 words. Keep the Subject line, the greeting,
> and the sign-off exactly as they are. Preserve every factual claim — only cut
> redundancy, filler, and over-long sentences; never add, change, or invent
> anything. Return the full email, nothing else.

- **Model: Haiku.** It's mechanical tightening — cheap and instant; Sonnet is
  overkill.
- **Integrity:** the pass can only *cut*, never add or alter a claim, so
  shortening cannot introduce a fabrication. (Dropping a true line is fine; the
  reviewer reverts if they wanted it.)
- Gated on `ANTHROPIC_API_KEY` like the rest of the engine; `503` when absent.

## Revert

Two options, ship the first:

1. **v1 — client-side.** The frontend stashes the pre-shorten text in memory and
   Revert restores it. Covers the real use case (tighten, glance, undo). Lost on
   panel close / refresh. No schema change.
2. **Persistent — `pre_shorten` column** on `outreach_drafts`, written before the
   shorten, cleared on the next manual edit. Revert survives refresh/navigation.
   One small migration. Add only if reviewers want durable undo.

## Implementation sketch

- `scout/outreach`: a `Shorten(ctx, email)` engine method (one `callJSON` to
  Haiku with the prompt above) — reuses the existing Anthropic client + JSON-free
  text path.
- `scout/web/routes/outreach.py`: the `POST …/shorten` handler; load the draft, take
  the current text (edited ?? draft), call `Shorten`, return `{text, lint}`.
- `web/src/app.ts`: word count + the conditional button in the draft card; on
  click, POST, swap the textarea, save via the existing edit PUT, stash for
  Revert; Revert restores the stash.

## Effort

Small and contained — one endpoint, one Haiku prompt, a button + revert, reusing
the existing word-count lint and edit PUT. Roughly an hour for v1; the
`pre_shorten` column is an easy follow-on.

## Open questions

- Threshold to show the button (~140?) and the target (~120) — tunable.
- Should it bias toward tightening the hook (usually the longest paragraph) vs.
  trimming evenly? Start even; revisit if it over-cuts the proof.
