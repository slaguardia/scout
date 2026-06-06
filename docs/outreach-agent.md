# Outreach Agent — system design (for Scout)

Status: design only (2026-06-04). Harness-agnostic — to be built into the Scout app.
Systematizes the manual pipeline (research → hook → assemble → style → humanize →
verify) from the 2026-06-03 12-company batch.

## Goal

Input: company name + job URL.
Output: a ready-to-review cold email in Alex's voice.
**Never auto-sends.** The system's job is ~2 minutes per company instead of ~2 hours,
without faking personalization.

## Shared context blocks (static, cacheable, versioned)

Every agent gets only the blocks listed in its spec. Notion stays where the content
is *authored*, but **Scout never talks to Notion** — blocks arrive via the brain
(see "Retrieval — the brain, not Notion" below).

| Block | Contents | Authored in |
|---|---|---|
| `EXPERIENCE_CARD` | ~150-word compact fact sheet: 5y Globex (FDE-like, embedded with customer teams, enterprise deployments into operational environments, feedback to engineering, ~2y leading an infra team, Secret-level), side projects one-liners (a handheld console 2k+ users, Taskly, Devbot agent bot). Facts only, no narrative. | derived from Past Experience |
| `P2_LOCKED` | The frozen credential paragraph + signature (Usul version, template v7.1) | Cold Outreach Templates |
| `HOOK_RULES` | Effort ladder, earned-vs-performed examples, gating test, "drop 'I applied'" rule | Cold Outreach Templates |
| `CLOSER_RULES` | The 3 closer patterns (role posted / none / not sure which) + Usul closer example | Cold Outreach Templates |
| `VOICE_RULES` | Voice & style rules + voice anchors + hard-no language list | Notion Voice & style page |
| `BANK_ROWS` | 2–3 Writing Bank rows selected per draft, matched by move (not static) | Writing Bank — outreach DB |
| `PAST_EXPERIENCE_FULL` | Full structured experience doc — honesty checker only | Notion Past Experience |
| `HUMANIZER` | The humanizer skill prompt, verbatim | the user's personal skill repo — file-pinned (`file:/path`), re-read each sync |

Context-minimization principle: each agent sees the smallest set that lets it do its
one job. Notably, the Researcher knows almost nothing about Alex, and only the
honesty checker sees the full experience doc.

---

## Retrieval — the brain, not Notion

Scout connecting to Notion directly would create a second knowledge substrate and a
second sync problem. The brain stays the **single knowledge gateway**:
Notion → brain sync → scout pins/fetches/caches → pipeline reads cache.

The brain stays a dumb librarian — no LLM calls at serve time. All intelligence
(extraction, distillation, drafting) lives in scout. `/recall` remains for
*questions* (company fit; later, hook-thread checks against experience) — never for
fetching documents. Top-k similarity gives no completeness or exactness guarantee,
and the failure mode is silent: a missing rule or a stale template version degrades
the email without erroring.

### Brain surface (prerequisites — brainbot work, blocks everything below)

1. `GET /doc?id=<stable-page-id>` — one page's **full text verbatim** + title +
   version stamp. The new primitive; `P2_LOCKED` must round-trip byte-exact.
2. Consumer `GET /map` — document hierarchy: stable page ids, titles, parent/child,
   version stamps. Deliberately amends the owner-only rule in
   `brainbot/plans/scout-migration.md`. No chunk contents, no owner metadata.
3. **Stable IDs** — Notion's immutable page ids are the canonical keys; titles are
   display-only. A rename changes the title, never the id, so pins don't dangle.
4. **Sync coverage** — the outreach pages (Cold Outreach Templates, Voice & Style,
   Past Experience, Writing Bank DB) must be in the synced set, synced regularly.

### Pins

A **pin** is a scout-side binding: block slot → list of page ids, stored in scout's
SQLite. The brain doesn't know pins exist. The GUI renders the map tree; a
**pin-proposal agent** (map-driven: read hierarchy → fetch candidates via `/doc` →
judge content against a per-block spec) proposes bindings with confidence + excerpt
evidence; the user confirms or overrides. Renames self-heal (stable ids). A `404`
on a pinned id is a **loud failure** (per the migration spec): the sync marks the
block broken and outreach drafting is blocked until it's re-pinned — never draft
against a vanished source, never fuzzy-match to the closest surviving page.
Caveat from the spec: Notion *deletions* don't 404 — a deleted/unshared page just
stops re-syncing and keeps serving its last content ("version unchanged" ≠ "still
exists upstream"). Fine for frozen blocks; accepted silent-staleness risk for
rules docs in v1.

**v1 pinning is manual** (browse the map tree in the GUI, click). The pin-proposal
agent is a later layer on the same surface — you pin ~8 things once.

**Exception: the email template is never discovered.** `P2_LOCKED` is a decision,
not a fact lying in a doc — the user declares it directly (`scout outreach set
--block P2_LOCKED`), once per template version; the declaration is the approval
(content-hash version, sync never touches it). No Notion subpage needed even
though the paragraph lives inline on the Cold email template page. Automate
*derivation*, never *authorship*.

### Block tiers and stale policy

| Tier | Blocks | On upstream version change |
|---|---|---|
| **User-declared** | `P2_LOCKED` (via `scout outreach set`) | Content-hash versioned; sync leaves it alone. A new template version is a new declaration. |
| **Pointed-at** | `HOOK_RULES`, `CLOSER_RULES`, `VOICE_RULES`, `PAST_EXPERIENCE_FULL` (brain pins); `HUMANIZER` (file pin) | Silent refetch into the cache; file pins re-read every sync. |
| **Derived** | `EXPERIENCE_CARD` (distilled from Past Experience at sync time), `BANK_ROWS` (synced wholesale; selected by move at draft time, in code) | Re-derive at sync when inputs change. |

### Sync time vs draft time

All brain access happens at **sync time**: walk the pins, `GET /doc` each, assemble
blocks (concat for multi-page pins; extraction agent for messy ones), cache
versioned in SQLite (same pattern as `brain_profile_cache`). Drafting reads **only
the cache** — no map, no recall, no agent rummaging while an email waits. Plus a
deterministic lint: assert `P2_LOCKED` appears verbatim in every assembled email
(catches the humanizer mangling it — the one model that sees the full text).

---

## Agent 1 — Researcher

**Job:** gather hook candidates. Tools: HTTP fetch, web search. ATS JSON APIs before
scraping (Ashby `api.ashbyhq.com/posting-api/job-board/<org>` + non-user-graphql;
Greenhouse `boards-api.greenhouse.io/v1/boards/<org>/jobs`; Lever
`api.lever.co/v0/postings/<org>`). Browser-UA fallback for 403ing sites.

**Context:** company name, job URL, a ONE-line summary of Alex ("backend/platform
engineer, 5y defense, forward-deployed style, builds agent tooling on the side") so
it knows what's hook-relevant. NOT the experience card — it should report facts, not
pre-thread them.

**Prompt (system):**
```
You research companies for job-search outreach. Given a company name and job URL,
produce structured facts. You do not write emails and you do not flatter.

Gather:
1. What the company does and who pays them, one line.
2. Stage, funding, rough headcount.
3. The posted role: exact title, and 2-3 distinctive lines from the job
   description (quote exactly — skip boilerplate like "fast-paced environment").
4. 3-5 candidate hooks, each one of:
   - a distinctive positioning phrase from their site (exact quote)
   - a recent (≤3 months) launch/news item, one line
   - a founder/exec public statement (podcast, blog, interview) with the quote
   - a distinctive line in the job posting itself
   For each: the exact quote, source URL, and one neutral sentence of context.
5. Disambiguation: if the company name could be multiple entities, say which one
   you chose and why.

Rules: exact quotes only, never paraphrase into marketing speak. If you can't
find something after a reasonable look, return it as null — do not pad.
The relevance lens: the sender is a backend/platform engineer, 5 years in
defense in a forward-deployed-style role, builds agent tooling on the side.
Prefer hooks about: deployment/reliability/infrastructure, customer-embedded
work, government/defense adjacency, agent systems, or unusual engineering claims.
```

**Output schema:** `{company, what_they_do, customer, stage, headcount_est, role:
{title, jd_quotes[]}, hooks: [{type, quote, source_url, context}], disambiguation,
confidence}`

---

## Agent 2 — Hook selector

**Job:** pick one honest hook, or refuse. No tools.

**Context:** Researcher JSON + `HOOK_RULES` + `EXPERIENCE_CARD` (it must judge
whether a genuine half-clause thread to Alex's actual work exists).

**Prompt (system):**
```
You select the hook for a cold email, or decide there isn't one. You are the
integrity gate: a faked hook is worse than no hook.

Given researched hook candidates and the sender's experience card, pick the ONE
hook where both are true:
1. It is specific to this company (only this company could receive it).
2. There is an honest half-clause connecting it to something in the experience
   card. The connection must already exist — never invent or stretch experience.

Prefer cheaper rungs of the ladder when equally honest: job-posting shape >
site positioning line > recent news > podcast/talk.

Return: {decision: "hook" | "no_honest_hook", hook: {quote, source_url, thread:
"<the half-clause connecting it to the sender's work>"}, closer_mode:
"role_posted" | "no_role" | "unsure_which_role", reasoning: <2 sentences>}

If every candidate requires stretching the truth or could be sent to any
company, return no_honest_hook. That means "don't email them (yet)" — the
correct outcome, not a failure.
```

---

## Agent 3 — Drafter

**Job:** write P1 (1-2 sentences) and P3 (1-2 sentences) ONLY. P2/signature/subject
are assembled in code around its output.

**Context:** Hook selector output + role title + `CLOSER_RULES` + `VOICE_RULES` +
`BANK_ROWS` (retrieved by move: e.g. selector chose a podcast hook → pull the
"podcast hook" bank row as exemplar).

**Prompt (system):**
```
You write two short paragraphs of a cold email for Alex, a backend/platform
engineer moving from defense to startups. A locked middle paragraph carrying his
credentials already exists — you never write credentials.

P1 (1-2 sentences): open with the chosen hook using its exact quote or specific
fact, then the provided thread connecting it to Alex's work. Plain spoken
English. No greeting (added in code).

P3 (1-2 sentences): one sentence of why this company, specific, desire-framed
("the work I want to be doing", never "where I excel"). Then the ask per
closer_mode — for role_posted: "Open to a quick call in the next week or two
about the [role] role?"

Style: write like the bank examples provided. Tight sentences. No em dashes.
Never: "resonates", "huge fan", "passionate about", "pick your brain", "excited
to" as an opener, or any superlative not earned by a specific fact. Never
mention having applied.

Return: {p1, p3}
```

---

## Agent 4 — Humanizer (cleanup pass)

**Job:** final de-AI pass over the assembled email.

**Context:** `HUMANIZER` prompt verbatim + the assembled full email + 1-2 `BANK_ROWS`
bodies as the voice-matching sample (the skill supports voice calibration from a
sample — use it).

Runs AFTER deterministic lint (below), because lint output tells it what to fix;
its output goes through lint again (models reintroduce patterns — observed twice
on 2026-06-03).

---

## Agent 5 — Honesty checker

**Job:** veto power. Single purpose.

**Context:** `PAST_EXPERIENCE_FULL` + the final email. Nothing else — it should not
know what the hook was supposed to be, only whether claims are true.

**Prompt (system):**
```
You verify that a job-search email makes no claim beyond the sender's documented
experience. Compare every factual claim in the email (roles, durations, skills,
domains, projects, achievements) against the experience document.

Flag: invented experience, inflated scope (e.g. "led the program" when the doc
says "led a team"), implied domain expertise the doc doesn't support (e.g.
healthcare claims when the doc shows only defense), and durations that don't
match.

Do not flag: desire statements ("the work I want to do"), opinions about the
company, or the hook's observation about THEM.

Return: {verdict: "pass" | "fail", violations: [{claim, why}]}. Be strict;
a false pass costs more than a false fail.
```

---

## Deterministic code (not agents)

- **Assembly:** greeting + P1 + P2_LOCKED + P3 + signature; subject
  `[Name] | Alex intro — [role]`. Name left as placeholder — contact-finding is
  out of scope (Alex finds the person).
- **Lint (regex/rules):** em dashes; banned-phrase list; word count 75–125;
  doubled-word check ("has has"); P2_LOCKED verbatim-presence assertion. Rules
  run against the BODY — the subject line (whose canonical format contains an
  em dash), greeting, and sign-off are stripped first. The old applied-mention
  detector is gone: the refactored template sanctions "saw your post, applied
  today" as the light hook. Runs before AND after the humanizer pass.
- **No-email route:** on no_honest_hook there is NO draft — "if you can't write
  even one true sentence for a company, don't email them" (Cold email template
  page). Scout's job is making sure there IS something true to say; when there
  isn't, the honest output is a recommendation not to email. Writing one anyway
  in the panel is a manual override.
- **Logging:** on Alex's confirmed send ("mark sent" in the job panel), bump the
  outreach count AND stamp the send date via `PUT /api/postings/{id}`. Send dates
  are what make Touch 2 follow-ups cheap later.

## Pipeline order

```
Researcher → Hook selector ─┬─ hook ──→ Drafter → assemble → lint → Humanizer → lint → Honesty → review queue
                            └─ no hook → no draft (recommend not emailing) → review queue
```

Honesty fail → back to Drafter once with violations attached; second fail → human.

## Scope & UI

**v1 is single-job drafting**: trigger one company/posting, review the result.
Batch ("feed it 12, review tomorrow") is a later mode — the pipeline supports it,
but it upgrades the review queue from a panel section to a required UI surface.

**The review queue lives in the jobs-page side panel**, which gets redesigned
around the pursuit, not the company. Wider panel, role-centric:

- **Role header** — title, posting link, location. Lean; we don't store much
  about the role itself.
- **Pipeline** — applied date, response stage, existing tracking controls.
- **Outreach** — outreach count + last date + contacts (existing), then:
  "Draft outreach" action, draft status (researching / awaiting review /
  no-honest-hook), the draft itself for review/edit, "mark sent".
- **Footer** — "View company" button pops the original company sidebar; the
  company is secondary context here.

**no_honest_hook renders as a neutral result, not an error** — "no honest hook
found — nothing true to say yet; scout recommends not emailing." The integrity
gate working must not look like a failure; writing an email anyway in the panel
is a deliberate manual override.

The trigger integration is nearly free: company, URL, and title already sit on the
posting row (Add-by-link capture). Outreach becomes a verb on the tracker, and
"sent" lands on the same posting.

## Implementation decisions (2026-06-04 hash-out)

- **Researcher tooling:** scout pre-fetches the JD in Go code (Ashby/Greenhouse/
  Lever JSON APIs are deterministic HTTP — no model needed) and hands it to the
  Researcher as context; the agent itself uses the Anthropic hosted `web_search`
  tool for news/site/podcast hooks. No custom tool-use loop in v1; sites that
  403 the JD fetch just yield fewer hook candidates.
- **Models:** Sonnet for all five agents — including the honesty checker
  ("a false pass costs more than a false fail" rules out cheaping out). ~5 calls
  per email.
- **Data model:** `outreach_pins` (block → page ids), `outreach_blocks` (name,
  content, version, fetched_at — the cache), `outreach_drafts` (posting_id FK,
  status: researching / awaiting_review / no_hook / sent / failed, research JSON,
  hook JSON, draft text, violations, edited text, sent_at). Draft history kept
  per posting — Touch 2 needs it.
- **Sync trigger:** manual refresh button + a cheap `/map` version check at draft
  start (re-fetch only changed blocks per tier rules). No background cron.
- **Draft UX is fire-and-forget:** click "Draft outreach", keep browsing; the job
  row shows a draft-ready badge when the pipeline finishes (~1–2 min).
- **EXPERIENCE_CARD is reviewable:** shown in the UI with an edit override
  (Criteria-panel style); re-derivation flags a diff instead of silently swapping —
  an error in the card propagates into hook threads.
- **Post-edit lint:** editing a draft in the panel re-runs lint on save (regex,
  instant). The honesty checker does not re-run on the user's own edits.

## Design decisions

1. **Lock what's lockable.** Models touch ~4 sentences per email.
2. **The Hook selector can refuse**, and refusal is a success path: the
   recommendation is "don't email this company (yet)" — never a fallback blast.
3. **Lint is code and runs twice.** LLM cleanup passes reintroduce the patterns
   they're meant to remove.
4. **Honesty checker is isolated** — full experience doc, no knowledge of intent,
   strict-fail bias. "Never invent experience" is the system's hard rule.
5. **The brain is the only knowledge gateway.** Scout never talks to Notion.
   Blocks are pinned by stable page id, fetched whole via `/doc` at sync time,
   cached versioned in SQLite. `/recall` is for questions, never documents.
6. **Automate derivation, never authorship.** The pin-proposal agent suggests,
   the extraction agent distills — but the template is user-declared, and locked
   blocks never auto-adopt upstream changes.
7. **All brain access at sync time.** Drafting reads only the cache; an email
   never waits on retrieval.

## Generality (if others use this)

The pipeline, refusal path, lint-twice, locked-credentials pattern, and honesty
checker are the product; the blocks are a **profile pack** another user fills via
their own brain + pins — the map-pinning GUI adapts to any hierarchy, no hardcoded
page ids. Known gaps: the Researcher's relevance lens and the Drafter's sender
line must derive from the user's one-line summary (currently Alex-hardcoded);
lint constants (word count, subject format) become config with these as defaults;
an empty Writing Bank degrades gracefully (skip voice calibration, rules only).
Non-configurable on purpose: never auto-send, never invent experience,
refusal-as-success.

## Open questions

- Researcher proposing the target person too (it did this well in the 2026-06-03
  batch) — Alex currently wants contact-finding manual. Revisit.
- Follow-up generation (Touch 2 "news not nudge" needs a fresh mini-research pass
  at +7 days; Touch 3 is pure template). Natural v2 once send dates are logged —
  which v1 does from day one ("mark sent" stamps the date).
- ~~Where Scout's review queue lives~~ — resolved: the jobs-page side panel
  (see Scope & UI). Still open: whether batch mode needs a dedicated queue view.
