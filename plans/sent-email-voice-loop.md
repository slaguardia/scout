# Plan: sent emails as a voice signal (self-improvement loop)

Feed the user's own **sent and edited** outreach emails back into the writer, so
each new draft references how they actually open, phrase, and close. Status:
**proposed** (not built). Sibling to [`draft-shorten.md`](./draft-shorten.md).

## Motivation

The richest signal for the user's voice isn't a brain "voice doc" — it's the
emails they've actually sent. Those carry their real wording, openings, and
closings. The capture half already exists and is lossless: every edit lands in
`outreach_drafts.edited` (`SetOutreachDraftEdited`), and marking sent stamps
`sent_at` while **keeping the row** — both the LLM `draft` and the user's
`edited` text persist. The corpus of "what I really sent, in my words" is already
in the DB; nothing reads it back into generation. This closes that loop:
send → saved → next draft references it. It **augments** the existing voice +
experience bundles, it does not replace them — those docs stay relevant.

## How it feeds the writer

The `fill` stage already stitches experience + voice into the writer's user
message (`internal/outreach/engine.go:404-417`, the `MY EXPERIENCE` / `MY VOICE`
blocks). Add one more block right after voice:

```
MY ACTUAL SENT EMAILS (how I really open, phrase, and close —
match this voice, do NOT reuse the content; every email stays bespoke):
<email 1>
---
<email 2>
...
```

One line in the writer system prompt (`internal/outreach/prompts.go`) frames them
as **voice exemplars, not content to lift** — the draft stays specific to its own
company and hooks.

### Honesty boundary (important)

The honesty checker still anchors to the **experience** bundle, so the writer
cannot lift a *claim* from an old email that isn't documented — only tone,
rhythm, openings, closings transfer. That's exactly the desired boundary. (A
claim the user actually sent is arguably true-by-having-sent-it, but we do **not**
treat sent emails as new ground truth — keeps fabrication risk at zero.)

## Backend

- **Query** — `ListSentExemplars(limit)` in `internal/store/outreach_drafts.go`:
  select `status='sent'` rows ordered by `sent_at DESC`, take `edited` when
  non-empty else `draft`, cap at the last ~8–10. Strip the `Subject:` line,
  greeting, and sign-off so only the user's prose remains (reuse the same
  boilerplate-stripping the lint path already does on edited text).
- **Wiring** — an `e.sentExemplars()` helper mirroring `e.knowledge(need)`
  (`engine.go:96-105`); pass its output into `fill` and append the block when
  non-empty. No new endpoint required for v1 — it reads existing rows.
- Degrades cleanly: zero sent emails → no block, behaves exactly as today (the
  cold-start case while the corpus is still small).

## How to feed them — the one real fork

1. **v1 — verbatim few-shot (recommended).** Inject the last N sent emails raw.
   No extra LLM pass; few-shot is the most effective way to transfer voice, and
   it's ideal precisely while the corpus is small and every example counts.
   Downside: token cost grows with N; gets noisy past ~30 emails.
2. **Distilled voice profile (later).** Periodically run a pass (like the brain
   distiller) that extracts patterns — "opens with a direct observation, never
   'I hope this finds you well,' closes with a low-pressure ask" — and inject the
   summary instead. Cheaper at scale, but a lossy abstraction of the exact thing
   that's most valuable. Overkill until volume justifies it.

Ship v1; they're not mutually exclusive — distillation can sit on top later, with
a few recent verbatim exemplars alongside the summary.

## v2 — the edit-diff signal

The single richest signal is the **diff** between what the LLM wrote (`draft`)
and what the user changed it to (`edited`): a direct "I'd never say it that way →
here's how I'd say it" correction. Both columns are already retained, so the data
is there whenever we want it. Inject as before/after pairs (only for rows where
`edited` materially differs from `draft`). Left out of v1 to keep the first cut
tight and the token budget sane.

## UI surface (optional)

- Criteria → outreach knowledge: show the exemplar count feeding the writer
  ("learning from your last 8 sent emails").
- A per-draft **exclude from voice pool** checkbox so a rushed/off-voice email
  can be kept out of the corpus — a flag column (`exclude_from_voice`), not a
  deletion. Nice-to-have, not required for v1.

## Implementation sketch

- `internal/store/outreach_drafts.go`: `ListSentExemplars(limit)` + the
  boilerplate strip.
- `internal/outreach/engine.go`: `sentExemplars()` helper; thread it into
  `fill` and append the `MY ACTUAL SENT EMAILS` block after `MY VOICE`
  (`engine.go:412-414`).
- `internal/outreach/prompts.go`: one framing line in the fill system prompt.
- (optional) `web/`: exemplar count in Criteria; exclude checkbox + flag column.

## Effort

Small for v1 — one store query, a helper, ~10 lines into `fill`, one prompt line;
no migration, no new endpoint. The edit-diff (v2), distillation, and the UI
surfaces are independent follow-ons.

## Open questions

- N for the exemplar window (~8?) and ordering — most recent vs. a sampled mix
  so the voice doesn't overfit to the latest few.
- Token budget: at ~120 words each, 8 emails is ~1k words — fine; revisit if N
  grows or if combined with the edit-diff pairs.
- Do we ever want sent emails to enrich *experience* ground truth, or keep them
  strictly voice-only? (Default: voice-only — zero fabrication risk.)
