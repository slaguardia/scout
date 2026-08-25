# QA review — proposed new functionality (awaiting approval)

From an adversarial UI/UX/QA pass on 2026-08-25 (six parallel reviewers across
the jobs tracker, pursuit pane, companies/verdict surface, settings, modals and
inbox, and the CSS/a11y layer — plus a headless-browser run against a seeded
database).

**Everything in this file is deliberately NOT built.** The UI/UX fixes and bugs
found in the same pass were implemented and verified separately; this document
holds only the items that add a new capability, endpoint, column, table, or
user-facing concept, and therefore want your call first.

Ordered by my estimate of value to you as the daily user. Each entry says what
breaks today, what to build, and what it costs to reverse.

---

## 1. Re-score everything from the UI after a criteria change

**Today.** A bulk verdict run is sticky: already-scored companies are skipped.
So editing your criteria doc changes nothing about the verdicts you already
have. The only in-app path to re-judge is the per-company `↻ re-score` button,
one company at a time. `docs/` concedes this and points at
`scout verdict --force`. For the product's central promise — *change what you
want, re-judge the list* — that is a CLI dependency in what CLAUDE.md calls the
primary interface.

The backend already supports it: `POST /api/run/verdict` accepts `force`, and
`Scorer` implements it. No web caller ever sends it.

**Build.** Make the run modal's scope a two-way choice: "new companies only"
(today's `only_blanks`) vs "everything" (`force: true`).

**Why it needs your approval.** One click would spend one LLM call per already
-scored company — real money, scaling with your list. The copy has to state the
count and the cost up front. Note also that `score_one` *replaces manual
verdicts* on a force run, so the confirmation must say that your hand-set
overrides will be overwritten.

**Reversibility.** The spend is not reversible. The verdicts are (they're
re-derivable), but hand-set manual overrides destroyed by a force run are not.

---

## 2. Show which verdicts are stale against your current criteria

**Today.** The company pane shows a bare 12-char `taste_version` hash. After you
rewrite your criteria there is no way — in the pane, the table, or the trail —
to see which verdicts were scored against the old text. Combined with #1, you
can neither see the stale ones nor refresh them.

**Build.** Two parts:

- *Cheap half (pane only).* `GET /api/stats` already returns `current_taste`,
  and `useStats()` is already used elsewhere. Render `taste_version` as
  "· current" or "· stale — criteria changed since this was scored". This is
  arguably a FIX; I've left it here because it introduces a user-facing concept
  ("stale verdict") that doesn't exist today, and it pairs with the next half.
- *Fuller half (table).* Add `taste_version` to `triage_rows` so the companies
  table can carry a stale marker and a "stale only" filter — which is what makes
  #1 targetable instead of all-or-nothing.

**Reversibility.** Fully reversible; display only.

---

## 3. Pre-filter preview — "N of M companies pass"

**Today.** The pre-filter decides which companies a paid bulk run ever scores,
and the settings form gives zero feedback on its blast radius. Tighten headcount
or add a vertical allowlist and you find out by launching a run and reading the
results. Worse, the drop breakdown is *already computed* and thrown away:
`Taste.apply()` builds a per-reason `dropped_by` histogram "for visibility", and
only the CLI ever prints it — the web path discards it.

**Build.** `POST /api/taste-filter/preview` taking the same `{rules}` body,
running the filter without persisting, returning `{total, kept, dropped_by}`.
Show "N of M companies pass" beside Save, debounced on rule change.

**Related, and cheaper — worth doing regardless.** During a bulk run, emit one
line when the filter gated anything: `pre-filter: 259 of 300 gated out
(location: 180, headcount_max: 79) — disable it in Settings → Job hunting to
score everything`. Today a 300-company run silently says "scoring 41" and never
uses the word "pre-filter". That one is a straight FIX and I can do it on your
word; I left it out because it changes what a run *says* it's doing.

**Reversibility.** Fully reversible; read-only endpoint.

---

## 4. History / undo for the four knowledge docs

**Today.** Criteria, experience, voice and logistics are the highest-value
hand-written content in the product — the scoring basis and the honesty
checker's ground truth. Both stores are destructive upserts with no prior
version retained. A clobber from any source (a bad paste, a CLI write, the
"Copy to editor" button) is unrecoverable short of a filesystem backup.

I have already added confirmations to the two destructive UI paths I found
(clearing a doc, and Copy-to-editor overwriting typed criteria). That reduces
accidents; it does not give you a way back from one.

**Build.** A `knowledge_doc_history(need, content, saved_at)` table written on
every non-identical save, capped at N per need, with a "previous versions"
collapsible under each editor offering restore.

**Why it needs your approval.** New table + migration.

**Reversibility.** The migration survives `git revert` — that's the reason this
is a decision rather than a fix.

---

## 5. "How long has this been sitting here?" on the tracker row

**Today.** The one question you ask scanning the board — *which of these has
gone quiet?* — can't be answered from the table. The stage cell shows only the
label, so "in screening since March" and "moved to screening yesterday" look
identical. `last outreach` prints a bare ISO date rather than elapsed time.

The data is already in the payload (`application_status_at`) and already shown
in the pane as "since 2026-08-14". The CSS was even written for it: `.jt-stage`
is a `flex-direction: column` container commented as "a compact stage select
with **its date stacked under**", currently holding one child.

**Build.** Under the stage select, a muted `12d` with the ISO date in the title;
same treatment for `last outreach`. Needs one shared `daysAgo` helper — there is
no relative-time util today.

**Why it needs your approval.** It adds information to every row of your densest
surface; whether it earns the space, and whether you want absolute or relative,
is a taste call. No API change.

**Reversibility.** Fully reversible.

---

## 6. Per-answer cancel for a stuck generation

**Today.** Click Generate on an application answer and the card collapses to a
bare spinner. There is no cancel (the outreach drafts region has one), no
elapsed time, and every control on the card is hidden while it runs. If the
background thread dies without writing, the row sits in `generating`
indefinitely, and that also disables "Draft all blank" for every other question
on the form. The only recovery is restarting scout, which reaps stuck rows at
startup — and nothing in the UI tells you that.

I have made the `×` remove button stay visible during generation as a cheap
escape hatch. A real cancel is a new endpoint.

**Build.** `POST /api/answers/{id}/cancel` mirroring
`/api/outreach/drafts/{id}/cancel`, plus the elapsed-time label.

**Reversibility.** Fully reversible.

---

## 7. A real mobile layout

**Today.** scout is an installable PWA with a manifest and an apple-touch-icon.
Before this pass, on a 390px phone the fixed sidebar ate 240px and the table was
clipped with no scrollbar — unusable.

**I have already shipped a working stacked layout** (nav becomes a band across
the top, content full-width, tables scroll horizontally, modals fit, safe-area
insets respected). It is genuinely usable now.

**What's still a decision.** Whether you want a *designed* mobile experience —
an off-canvas drawer with a hamburger, or a bottom nav — instead of the stacked
fallback. That's a new interaction pattern and new chrome, so it's your call. I
would not do it until you've actually used scout on a phone and found the stack
wanting.

**Reversibility.** Fully reversible.

---

## 8. Smaller items, same category

- **Show the enrichment summary in the company pane.** `website_summary` is the
  *entire* company-specific input to the verdict prompt, is returned by the
  detail endpoint, and is never rendered — so when a verdict looks wrong, the
  one thing that explains it ("the fetch grabbed a cookie banner") is invisible.
  A collapsed `<details>` under Enrichment. Small, and high explanatory value;
  it needs a `CompanyDetail` field added, which is why it's here.

- **Surface the honesty checker's specific violations on a flagged answer.** A
  `needs_review` answer says "confirm it doesn't overstate your experience" —
  for a 180-word answer that's an instruction to re-audit every sentence. The
  checker already identified the exact claims and stored them on the row; the
  card just never shows them. This is the highest-stakes review moment in the
  product and the least informative. (Bordering on a FIX — the reason is stored,
  the markup exists in the drafts region — but it changes what that card says.)

- **Show the email a failed draft actually wrote.** A draft that fails the
  honesty check twice shows the violations but not one word of the email, which
  is sitting in the database. Two full pipeline runs of spend produced text you
  can't read, and if the checker false-positived on one sentence you can't
  salvage the other 90%.

- **Confirm before a bulk stage move.** Ticking the header checkbox selects
  every row the filter shows (easily 100+), and one interaction with the
  "Set stage…" select fires immediately — no confirm, no undo, and the previous
  per-row stages are gone. A trackpad scroll over an open select is enough. The
  single-posting delete does get a confirm modal. I left this out because adding
  a confirmation step to a deliberate bulk gesture changes a workflow you may
  have tuned to be fast.

---

## Not proposed, but you should know

Two things I found and did not fix, because they're pre-existing and outside
what this pass touched:

- `needs_work` is in the drafts' active-status set and in the backend's editable
  set, but no engine path ever produces it. A `needs_work` draft would render
  mislabeled as "awaiting review". Dead status.

- Roughly 60 dead CSS selectors (~9% of the stylesheet), including whole removed
  components (`.crit-*`, `.settings-item*`, `.jt-stepper`/`.om-count` from the
  pre-M51 outreach counter, `.trail-*` sub-parts). They make the file hostile to
  edit and hide live regressions in the noise — that's how the `#editor-scrim`
  and `#add-scrim` rules sat broken. Worth a dedicated cleanup commit; I didn't
  fold it into a behavioral pass.
