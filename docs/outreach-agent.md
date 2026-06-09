# Outreach Agent — system design (for Scout)

Status: redesign (2026-06-08). Supersedes the original block/pin/sync design.

Input: a saved posting (company + job URL, already on the tracker).
Output: a ready-to-review cold email. **Never auto-sends.** ~2 minutes per
company instead of ~2 hours, without faking personalization.

## The model — three things, cleanly separated

The old design encoded one person's manual cold-email method as a fixed schema
of named blocks (`P2_LOCKED`, `HOOK_RULES`, `EXPERIENCE_CARD`, …) that the user
had to pin to brain pages by hand. That was backwards: scout shipped opinions
and made the user map their knowledge onto them. This redesign follows the
north-star — **the brain owns the knowledge; scout owns the method and the
intelligence.** Three inputs, three sources:

| Input | What it is | Where it lives |
|---|---|---|
| **Template** | the email's *format* — greeting, sign-off, any verbatim prose, and the holes the LLM fills | scout-local file (`outreach-template.md`), authored by the user, like `playbook.md` |
| **Knowledge** | the user's *experience* and *voice* | the **brain** — discovered, fetched, cached (never hand-maintained, never an opinionated block) |
| **Research** | facts about the target *company* | the web (ATS JSON APIs + hosted `web_search`) |

A template is a *style decision* (legitimately scout-local). Experience and
voice are *knowledge* (the brain's job). Company facts are *external research*.
Nothing is an opinionated block, and the user never pins anything by hand.

## The template

One scout-local file. Fixed prose is the user's own words, copied verbatim into
every email — that is where the old "locked credential paragraph" guarantee now
comes from, for free. Two kinds of syntax punctuate the prose:

- `{{var}}` — a simple substitution resolved in code from the posting (no LLM):
  `{{role}}`, `{{company}}`.
- `{{name: instructions}}` — a **hole** the LLM fills from research + the
  knowledge bundle, e.g.
  `{{hook: 1–2 true sentences about {{company}} tied to my actual work; if there is no honest hook, don't send}}`.

Example:

```
Subject: [Name] | Alex intro — {{role}}

Hi [Name],

{{hook: one specific, true observation about {{company}} threaded to my work}}

I spent five years at Globex in a forward-deployed role… [verbatim — the LLM
never touches this; the user typed it]

{{closer: ask for a quick call about the {{role}} role}}

Thanks,
Alex
```

The template *is* the structure, the voice of the fixed parts, the locked text,
and the subject format — all in one artifact the user controls. Edited in the UI
exactly like `taste.md` / `playbook.md` (reuses the editor modal), and like them
it is **committed** — a sanitized example (placeholder name, a bracketed
credential paragraph to replace, the hole syntax demonstrated). The user
localizes it; their real name/credentials are a local edit, and the personal
*facts* live in the brain, not here.

## Knowledge retrieval — discover, store, fetch

The user's experience and voice live in the brain. Scout finds the right pages
**intelligently**, once, and remembers them — it does not hardcode page ids and
does not make the user pin them.

### Discovery (the pin-proposal agent, generalized)

A discovery pass, run on demand and re-runnable:

1. `GET /map` — the brain's document hierarchy (stable page ids, titles, paths).
   Titles only, no content.
2. A cheap **Haiku** call selects, for each general **knowledge-need**, the page
   ids whose titles/paths match. The needs are a small, fixed, *method-level*
   list (not opinions about the user):
   - **experience** — roles, projects, scope, skills, achievements, credentials
   - **voice** — the user's writing tone and style
3. Scout fetches each selected page **whole** via `GET /doc?id=` and **caches**
   the text + version stamp locally (`outreach_sources`).

**Fail loud on an empty brain.** The discovery agent's instructions explicitly
require it to *walk the returned map and report a not-found signal per need when
nothing is genuinely relevant* — it must never pick an off-topic page just to
avoid returning empty (a wrong "experience" page silently corrupts every hook and
defeats the honesty check). If the brain returns nothing relevant to
**experience**, that is a hard error: discovery surfaces it, and outreach
drafting (and answer generation) are blocked until the brain has experience
content and is re-discovered — the same loud-gate posture the old
`PAST_EXPERIENCE_FULL` requirement had. A missing **voice** page degrades
gracefully (the email is less voiced, not dishonest) and only warns.

The resolved selection is shown in the UI (which pages map to which need) with an
**add/remove** override and a **Refresh** button. `/map` is title-only, so the
LLM can miss or over-pick; the user stays in control, and Refresh re-runs
discovery against a fresh map when new pages appear upstream.

### Why whole-fetch, not per-company recall

One person's experience is a few pages, not a corpus — so scout fetches it
*whole* and feeds the full bundle to both the fill step and the honesty check.
The fill LLM does relevance selection in-context (it has the company research +
the full experience). This matters for integrity: **verification needs
completeness.** Top-k `/recall` gives no completeness guarantee, so verifying an
email against a partial view can pass a fabrication. Whole-fetch of the
discovered pages is the complete ground truth the honesty checker requires.

### Caching

Discovery/refresh fetches and caches the page **content** (not just pointers), so
drafting reads the cache — fast, and resilient if the brain is down at draft
time. Refresh re-fetches and surfaces what changed.

## Pipeline

```
research the company ─▶ load template + knowledge bundle ─▶ ONE fill call
   (ATS + web_search)      (cache; vars resolved in code)    (holes filled)
        │                                                          │
        │                                            ┌─────────────┴──────────────┐
        │                                       honest hook?                  no honest hook
        ▼                                            │                            │
   research JSON                              honesty check the                don't send
   on the draft row                           FILLED HOLES vs the              (DraftNoHook —
                                              complete experience               a success path,
                                              (one retry)                       no draft)
                                                   │
                                          pass ─▶ review queue (DraftAwaitingReview)
                                          fail twice ─▶ DraftFailed
```

- **Research** — ATS JSON pre-fetch (Ashby/Greenhouse/Lever) + hosted
  `web_search`. Gathers true, specific company facts. No identity framing.
- **Fill** — one LLM call (Sonnet). It is told: the fixed prose is the user's and
  must not change; fill each labeled hole using ONLY the research facts and the
  knowledge bundle; never invent; if a hole says don't-send and you can't fill it
  honestly, signal no-send. Output is `{holeName: text}` (or a no-send signal);
  code re-assembles verbatim prose + resolved vars + filled holes into the email.
- **Honesty** — checks the *filled holes* (the LLM-generated spans; the fixed
  prose is true by construction) against the **complete** experience bundle. One
  retry feeds violations back into the fill call. A false claim to a recruiter is
  worse than a thin one.
- **Refusal-as-success** — no honest hook ⇒ no draft, no fallback template. "If
  you can't write even one true sentence for a company, don't email them."

## Application answers — same knowledge, same check

Application-answer generation runs the identical flow: the essay question is the
context, the same brain knowledge bundle is the experience source, and the same
honesty checker vets the answer against the complete experience. There is no
separate experience block — outreach and answers share one retrieval path.

## Non-negotiable (method, not opinion)

These are scout's, fixed, and *not* derived from any one person's style:

- **Never auto-send.** Scout drafts; the user sends.
- **Never invent experience.** The honesty checker runs over every generated span
  against the *complete* experience bundle — always, regardless of template.
- **Refusal is a success path**, never a fallback blast.
- **Verbatim prose stays verbatim** — the user's own words are never paraphrased.

## Data model

- `outreach-template.md` — scout-local file, committed (sanitized example, like
  `taste.md`/`playbook.md`). The email format.
- `outreach_sources` — the discovered knowledge: one row per (need, page_id) with
  the cached page text, title, and version; populated by discovery/refresh.
  Replaces the deleted `outreach_pins` + `outreach_blocks`.
- `outreach_drafts` — unchanged. The review queue (research JSON, filled email,
  status, sent_at).
- **Dropped:** `outreach_pins`, `outreach_blocks`, `outreach_sender`,
  `outreach_config` (the old block schema, the identity, and the lint/structure
  knobs all go).

## Surfaces

- **Criteria panel** — an "email template" editor (reuses the editor modal) and a
  "knowledge sources" view: the resolved pages per need, add/remove override, and
  a Refresh button.
- **HTTP** — `GET/PUT /api/outreach-template`; `GET /api/outreach/sources`;
  `POST /api/outreach/sources/refresh`. The draft queue endpoints
  (`/api/postings/{id}/outreach`, `/api/outreach/drafts/{id}`, `…/sent`) are
  unchanged.
- **CLI** — `scout outreach sources [--refresh]`, `scout outreach draft
  --posting <id>`. (`map`/`pin`/`set`/`config`/`blocks` are gone.)
- **Review queue** — the jobs-page pursuit panel, unchanged: draft cards by
  status, edit, mark-sent bumps tracking. `no_honest_hook` renders as a neutral
  result ("nothing true to say yet — scout recommends not emailing").

## What changed from the original design

Deleted: the named-block taxonomy (`P2_LOCKED`, `HOOK_RULES`, `CLOSER_RULES`,
`VOICE_RULES`, `PAST_EXPERIENCE_FULL`, `EXPERIENCE_CARD`, `BANK_ROWS`,
`HUMANIZER`), manual pins + sync, the five named agents (researcher and a thin
honesty pass survive; hook-selector/drafter/humanizer collapse into the single
fill call), the Sender identity, and the lint/structure config knobs. The
genuinely-general parts — research, honesty, refusal-as-success, the review
queue — stay.
