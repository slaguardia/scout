# Outreach Agent — system design (for Scout)

Status: redesign (2026-06-08), amended 2026-06-11 with the cold-outreach
doctrine — interpretation-led research, a depth-gating judge, the proof
gradient, and a scout-local editable doctrine doc. The method's source
document is [cold-outreach-doctrine.md](./cold-outreach-doctrine.md).
Supersedes the original block/pin/sync design.

Input: a saved posting (company + job URL, already on the tracker).
Output: a ready-to-review cold email. **Never auto-sends.** ~2 minutes per
company instead of ~2 hours, without faking personalization.

## The model — four artifacts, cleanly separated

The old design encoded one person's manual cold-email method as a fixed schema
of named blocks (`P2_LOCKED`, `HOOK_RULES`, `EXPERIENCE_CARD`, …) that the user
had to pin to brain pages by hand. That was backwards: scout shipped opinions
and made the user map their knowledge onto them. This design follows the
north-star — **the brain owns the knowledge; scout owns the method and the
intelligence.** Four inputs, three sources:

| Input | What it is | Where it lives |
|---|---|---|
| **Template** | the email's *format* — greeting, sign-off, any verbatim prose, and the holes the LLM fills | scout-local, stored in SQLite (a singleton row), edited from the dashboard; a compiled-in default seeds it |
| **Doctrine** | the email's *method* — what makes a draft good: the depth bar, show-don't-tell, the kill list | scout-local, stored in SQLite (a singleton row), edited from the dashboard; a compiled-in default seeds it |
| **Knowledge** | the user's *experience* and *voice* | the **brain** — discovered, fetched, cached (never hand-maintained, never an opinionated block) |
| **Research** | facts about — and an *interpretation* of — the target company | the web (ATS JSON APIs + hosted `web_search`) |

A template and a doctrine are *style and method decisions* (legitimately
scout-local). Experience and voice are *knowledge* (the brain's job). Company
facts are *external research*. Nothing is an opinionated block, and the user
never pins anything by hand.

## The template

One scout-local template, stored in SQLite. Fixed prose is the user's own words,
copied verbatim into every email — that is where the old "locked credential
paragraph" guarantee now comes from, for free. Two kinds of syntax punctuate the
prose:

- `{{var}}` — a simple substitution resolved in code from the posting (no LLM):
  `{{role}}`, `{{company}}`.
- `{{name: instructions}}` — a **hole** the LLM fills from research + the
  knowledge bundle.

The compiled-in default (`outreach.DefaultTemplate`) now carries the doctrine's
three-paragraph structure as three holes:

```
Subject: [Recipient] | Your Name — intro re {{role}}

Hi [Recipient],

{{hook: a specific, true observation about {{company}} — the bet they're
making and what it implies — hedged as your own read. A consequence, not a
reaction. Zero words about the sender. No Deep observation → don't send.}}

{{proof: my background tied to the problem above, at the strongest HONEST
tier (direct / openly-adjacent / standing credentials). One mapping, not a
résumé.}}

{{closer: a concrete reason this company is worth a conversation, folded
into one low-friction ask.}}

Thanks,
Your Name
```

The reader meets an idea about their company (hook), then the sender (proof),
then a small ask (closer) — §3 of the doctrine. A user who wants their
credentials verbatim in every email keeps them as fixed prose (the LLM never
touches fixed prose); the proof hole is for the per-company mapping. The
template *is* the structure, the voice of the fixed parts, the locked text,
and the subject format — all in one artifact the user controls, edited in the
UI via the editor modal, **stored in the DB** so a dashboard save can't be
clobbered by git and the user's real name/credentials never get committed.

## The doctrine

One scout-local markdown doc — the **writing method**, distilled from
[cold-outreach-doctrine.md](./cold-outreach-doctrine.md): the depth ladder
(Shallow / Medium / Deep, and the three Deep angles), show-don't-tell
(consequences, never reactions), don't-explain-them-to-themselves (hedged
interpretation, the category lens, the recitation test), the judgment-call
kill list (founder-grading, congrats-without-interpretation, warm-up
openings), ask calibration, and the ~120-word budget.

It is spliced verbatim into two prompts at draft time: the **fill** call
(as the writing method) and the **judge** (as its rubric). Editing it changes
how drafts sound and what the judge holds them to. It deliberately **cannot**
change the mechanics, which stay compiled in Go: the honesty check against
the experience bundle, the never-invent rule, the no-send path, self-reference
containment, and the JSON contracts.

Same pattern as the verdict playbook and the template: a DB singleton row,
seeded by the compiled-in default (`outreach.DefaultDoctrine`, embedded from
`internal/outreach/doctrine_default.md`), edited from the Criteria panel via
the editor modal (`GET/PUT /api/outreach-doctrine`). The deterministic kill
list (literal phrases, em dashes, the word count) stays compiled in
`internal/outreach/voice.go` as a backstop the editor can't delete.

## Knowledge retrieval — discover, store, fetch

The user's experience and voice live in the brain. Scout finds the right pages
**intelligently**, once, and remembers them — it does not hardcode page ids and
does not make the user pin them.

### Exactly what scout fetches from the brain, and when

Scout touches the brain at **exactly one point** in this feature — discovery /
refresh. Everything else reads the local cache.

1. **`GET /map`** (discovery time only) — the brain's document hierarchy:
   stable page ids, titles, paths. Titles only; no page content crosses.
2. **One Haiku call** (scout's own LLM, not the brain's) selects page ids per
   fixed knowledge-need from those titles: **experience** (hard-required) and
   **voice** (soft).
3. **`GET /doc?id=`** (discovery time only) — each selected page is fetched
   **whole**, verbatim, and cached locally: text + title + version stamp, one
   row per (need, page) in `outreach_sources`.
4. **Draft time: zero brain calls.** The engine reads `outreach_sources` plus
   the template and doctrine rows from SQLite only — drafting works with the
   brain down. **Refresh** (Criteria panel button, or `scout outreach sources
   --refresh`) re-runs 1–3 against a fresh map and surfaces what changed.

What never comes from the brain: the template, the doctrine, company research,
and the judge's critique. And nothing ever goes *to* the brain — scout is a
read-only consumer (`/map` + `/doc` here; `/recall` elsewhere in scout), and
verdicts/drafts stay scout-local.

### Discovery (the pin-proposal agent, generalized)

The needs are a small, fixed, *method-level* list (not opinions about the
user): **experience** — roles, projects, scope, skills, achievements,
credentials; **voice** — the user's writing tone and style.

**Fail loud on an empty brain.** The discovery agent's instructions explicitly
require it to *walk the returned map and report a not-found signal per need when
nothing is genuinely relevant* — it must never pick an off-topic page just to
avoid returning empty (a wrong "experience" page silently corrupts every hook and
defeats the honesty check). If the brain returns nothing relevant to
**experience**, that is a hard error: discovery surfaces it, and outreach
drafting (and answer generation) are blocked until the brain has experience
content and is re-discovered. A missing **voice** page degrades gracefully (the
email is less voiced, not dishonest) and only warns.

The resolved selection is shown in the UI (which pages map to which need) with an
**add/remove** override and a **Refresh** button. `/map` is title-only, so the
LLM can miss or over-pick; the user stays in control.

### Why whole-fetch, not per-company recall

One person's experience is a few pages, not a corpus — so scout fetches it
*whole* and feeds the full bundle to the fill step, the honesty check, and the
judge. The fill LLM does relevance selection in-context. This matters for
integrity: **verification needs completeness.** Top-k `/recall` gives no
completeness guarantee, so verifying an email against a partial view can pass a
fabrication. Whole-fetch of the discovered pages is the complete ground truth
the honesty checker requires — and the complete picture the judge needs to say
what experience is *missing*.

## Pipeline

```
research the company ──▶ load template + doctrine ──▶ ONE fill call ──▶ humanize
 (ATS + web_search:        + knowledge bundle          (holes filled,
  facts AND thesis /        (local SQLite only)         doctrine-guided)
  implication / signals)                                     │
                                              ┌──────────────┴──────────────┐
                                        honest hook?                  no honest hook
                                              │                             │
                                    honesty check the filled            don't send
                                    holes vs complete experience       (DraftNoHook —
                                              │                         a success path)
                                    doctrine judge: depth,
                                    proof tier, weaknesses,
                                    experience gaps
                                              │
                          ┌───────────────────┼──────────────────────┐
                    deep + honest        medium after the        shallow after the
                          │              shared retry            retry, or honesty
                    review queue              │                  fail twice
                 (DraftAwaitingReview)   DraftNeedsWork               │
                                        (flagged, reviewable)    DraftFailed
```

- **Research** — ATS JSON pre-fetch (Ashby/Greenhouse/Lever) + hosted
  `web_search`. Gathers true, specific company facts **and the researcher's own
  interpretation**: the *thesis* (the bet the company is making — what they're
  wagering will be true, not what they do), the *implication* (what that bet
  makes obsolete, urgent, or newly true), and *signals_read* (inferences about
  their internal reality: funding stage → team size and role breadth, hiring
  pattern → what's getting heavy, logos/integrations → who they serve and
  compete with). Interpretation is the edge; facts alone are what everyone has.
- **Fill** — one LLM call (Sonnet). The compiled prompt carries the mechanics
  (fixed prose is the user's and is never touched; fill each hole from ONLY the
  research and the knowledge bundle; never invent; no-send signal honored); the
  spliced doctrine carries the method (depth, show-don't-tell, hedging,
  recitation). Output is `{holeName: text}` or a no-send signal; code
  re-assembles verbatim prose + resolved vars + filled holes.
- **Honesty** — unchanged, and not doctrine-editable: checks the *filled holes*
  against the **complete** experience bundle. A false claim to a recruiter is
  worse than a thin one.
- **Judge** — new, and the doctrine's enforcement point. Sees the doctrine (its
  rubric), the research, the experience bundle, and the assembled email with the
  LLM-written spans identified. Returns: **depth** (deep / medium / shallow on
  the doctrine's ladder), **proof tier** (see below), **weaknesses** (short,
  concrete, span-quoting notes on what made a fill weak), **experience_gaps**
  (what experience, had the bundle contained it, would have made the email
  stronger), and retry **feedback**. One shared retry: honesty violations and
  judge feedback are fed back into a second fill together.
- **Critique surfacing** — every finished draft (awaiting_review, needs_work,
  failed) stores the judge's critique JSON, and the draft card renders it:
  depth, proof tier, the weaknesses, and the experience gap. The user always
  sees *why* a draft is weak and *what knowledge was missing* — thin Tier-3
  drafts in a row is a targeting signal, and an experience gap that keeps
  recurring is a brain-content signal.
- **Refusal-as-success** — no honest hook ⇒ no draft, no fallback template
  (`DraftNoHook`). Shallow-after-retry ⇒ `DraftFailed` ("below the depth bar"):
  one Deep email beats fifty Medium ones, so scout would rather hand back
  nothing than something generic. Medium-after-retry ⇒ `DraftNeedsWork`: the
  draft is real work and stays editable in the queue, but it is flagged below
  the bar, never presented as ready.

### The proof gradient

The doctrine's paragraph 2 is a *lived proof*: the single experience that puts
the sender on the wrong side of the gap the company is closing. The user won't
have that for every company, so the proof hole works a gradient — always the
strongest tier that is **honest**:

1. **direct** — the sender has lived the problem. Said plainly.
2. **adjacent** — related experience framed *openly* as adjacent ("I haven't
   run X, but Y put me on the consumer end of exactly this failure"). The
   frame admits the distance; adjacency disguised as direct is fabrication.
3. **standing** — the sender's strongest relevant background stated plainly,
   with **no manufactured thread** to the company.

No honest thread is **not** a no-send — no-send stays reserved for the hook
(nothing true to say about the company). The judge classifies the tier and the
card shows it; whether a standing-tier email is worth sending is the user's
call, made visible, not scout's.

## Application answers — same knowledge, same check

Application-answer generation runs the same retrieval and integrity flow: the
essay question is the context, the same brain knowledge bundle is the
experience source, and the same honesty checker vets the answer against the
complete experience. The doctrine judge is **email-specific** — answers keep
honesty-only gating (an application answer is not a cold email; depth rules
don't transfer).

## Non-negotiable (method mechanics, not editable opinion)

These are scout's, fixed in code, and untouched by template or doctrine edits:

- **Never auto-send.** Scout drafts; the user sends.
- **Never invent experience.** The honesty checker runs over every generated
  span against the *complete* experience bundle — always. The proof gradient's
  tier-honesty (adjacency framed as adjacency) is part of this.
- **Refusal is a success path**, never a fallback blast.
- **Verbatim prose stays verbatim** — the user's own words are never paraphrased.
- **The judge always runs and the critique is always surfaced** — the doctrine
  doc tunes the rubric, not the gate's existence.

## Data model

- `outreach_template` — scout-local, a singleton SQLite row (key `default`)
  holding the email format. Seeded from `outreach.DefaultTemplate`; edited from
  the dashboard, never committed.
- `outreach_doctrine` — scout-local, a singleton SQLite row (key `default`)
  holding the writing method. Seeded from `outreach.DefaultDoctrine`; edited
  from the dashboard, never committed.
- `outreach_sources` — the discovered knowledge: one row per (need, page_id)
  with the cached page text, title, and version; populated by discovery/refresh.
- `outreach_drafts` — the review queue. Carries the research JSON, the
  assembled email, lint findings, honesty violations, and now `critique` (the
  judge's verdict JSON: depth, proof_tier, weaknesses, experience_gaps).
  Statuses: `researching` → `awaiting_review` | `needs_work` | `no_hook` |
  `failed`, then `sent` / `superseded`. `needs_work` behaves like
  `awaiting_review` (active, editable, sendable, superseded on regenerate) but
  renders flagged as below the depth bar.

## Surfaces

- **Criteria panel** — three sibling editors (one modal): the verdict playbook,
  the **email template**, and the **outreach doctrine**; plus the knowledge
  sources view (resolved pages per need, add/remove, Refresh).
- **HTTP** — `GET/PUT /api/outreach-template`; `GET/PUT /api/outreach-doctrine`;
  `GET /api/outreach/sources`; `POST /api/outreach/sources/refresh`. The draft
  queue endpoints (`/api/postings/{id}/outreach`, `/api/outreach/drafts/{id}`,
  `…/sent`) are unchanged in shape; draft rows now include `critique` and may
  carry status `needs_work`.
- **CLI** — `scout outreach sources [--refresh]`, `scout outreach draft
  --posting <id>`.
- **Review queue** — the jobs-page pursuit panel: draft cards by status, edit,
  mark-sent bumps tracking. Cards for finished drafts show the judge's critique
  (depth badge, proof tier, weaknesses, experience gap). `no_honest_hook`
  renders as a neutral result ("nothing true to say yet — scout recommends not
  emailing"); `needs_work` renders editable with a "below the depth bar" flag.

## What changed from the original design

Deleted (2026-06-08): the named-block taxonomy (`P2_LOCKED`, `HOOK_RULES`,
`CLOSER_RULES`, `VOICE_RULES`, `PAST_EXPERIENCE_FULL`, `EXPERIENCE_CARD`,
`BANK_ROWS`, `HUMANIZER`), manual pins + sync, the five named agents
(researcher and a thin honesty pass survive; hook-selector/drafter/humanizer
collapse into the single fill call), the Sender identity, and the
lint/structure config knobs. The genuinely-general parts — research, honesty,
refusal-as-success, the review queue — stay.

Added (2026-06-11, the doctrine amendment): interpretation in the researcher
(thesis / implication / signals_read), the editable doctrine doc spliced into
fill + judge, the doctrine judge with the depth gate (`needs_work` /
"below the depth bar" dispositions), the proof gradient replacing the static
credentials paragraph in the default template, always-on critique surfacing
(weaknesses + experience gaps) on finished drafts, and the expanded
deterministic kill list + word-count lint. The doctrine doc is method-prose,
not knobs — the 2026-06-08 decision to delete `outreach_config` stands.
