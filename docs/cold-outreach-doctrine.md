# Cold Outreach Doctrine

A working specification for writing — and building tooling around — high-signal cold
outreach to startups. Written to be used two ways: as a human reference, and as a
context document you can hand to Claude Code when evolving a cold-outreach tool.

> **How scout uses this document.** This is the *source* doctrine. Its operative
> writing rules (§2, §4, §5, §6, §9) are distilled into the editable doctrine doc
> the engine actually splices into its prompts (compiled-in default:
> `internal/outreach/doctrine_default.md`, edited from the Criteria panel). §3 and
> §6's specifics live in the email template's hole instructions. §8 is implemented
> by the engine itself — see [outreach-agent.md](./outreach-agent.md). The worked
> example below uses a fictionalized company ("Acme").

---

## 0. The one-line thesis

**Personalization depth comes from interpretation, not information.** Anyone can find
facts about a company. Almost nobody connects those facts to what the company is
actually feeling right now. The entire edge is in that gap.

Every rule below is downstream of this.

---

## 1. Why cold outreach over cold applying

Context that justifies the effort:

- Cold online applications convert at roughly **0.1–2%**.
- Referrals / warm or sourced paths raise interview likelihood by **4–10x**.
- A large majority of roles are filled through connection rather than job boards.
- Therefore: a *small number of genuinely personalized* outreaches beats a *large
  number of generic applications*. Optimize for depth per target, not volume.

For someone with **no existing connections**, cold outreach that reads like a peer —
not an applicant — is the way to manufacture a warm intro from a cold start.

---

## 2. The depth ladder

The word "personalization" hides four very different levels. A tool should be able to
classify a draft into one of these and refuse to ship anything below "Deep."

| Level | What it looks like | Signal it sends |
|-------|--------------------|-----------------|
| **Shallow** | "Congrats on the raise!" | You read a headline. |
| **Medium** | "You hired two AEs — looks like you're moving to a real sales motion." | You can interpret a signal. |
| **Deep** | Engages the substance: their bet, their trajectory, their problem. | You think like an insider. |

### The three Deep angles

1. **Thesis angle** — Engage the *bet* the company is making. State their worldview
   back to them in one sentence, then state what it *implies*.
2. **Connect-the-dots angle** — Infer their current internal reality from external
   signals (funding stage, hiring pattern, customer logos, integrations).
3. **Product-use angle** — A specific reaction from actually using the product.
   *(Often unavailable for B2B / infra companies — don't force it.)*

For B2B and infrastructure companies, **Thesis + Connect-the-dots** is the reliable
pairing. Product-use is a bonus when you can get it, not a requirement.

---

## 3. The structure

Three short paragraphs. Under ~120 words total. On a phone it should be readable
without scrolling.

1. **The idea** — An observation about *them*: their bet and its implication. No
   sentence about yourself yet.
2. **The lived proof** — One specific thing from your background, tied directly to the
   problem in paragraph 1. The only place you talk about yourself.
3. **The ask** — A low-friction invitation. Optional out built in. Small time cost.

The reader should meet an *idea about their company* before they meet *you*.

---

## 4. Show, don't tell (the core editing principle)

This is the rule that did the most work in refining our example.

**Never announce your reaction. State the consequence instead.** A reaction word tells
the reader how you feel, which they don't care about. A consequence demonstrates that
you understood the stakes — which is the actual signal of a sharp candidate.

- ❌ "That bet is the part I find interesting." *(announces a reaction)*
- ✅ "If that's right, a lot of what monitoring tools do today doesn't survive it."
  *(states the consequence — proves the interest without claiming it)*

"Interesting," "exciting," "stuck with me," "resonated," "I love that" — all telling.
Cut them and replace with the *implication* of the thing.

### Don't explain them to themselves

The thesis angle has a built-in hazard: **the person reading works there.** They know
their own bet better than you do. Restating it adds nothing *by itself* — the value is
the **layer you add on top** (a consequence, a tension, a non-obvious framing) plus the
**lived proof** that follows. The restatement is only runway; if the sentence never
takes off into an implication, you've explained their company back to them, which reads
as condescending.

Three things keep you on the right side of the line:

- **Own the interpretation.** "Acme *seems to be* betting…" / "the way I read it…"
  frames it as *your* read, not a verdict on their strategy. Hedged, not declared.
- **Compress the restatement to one sentence,** then put the weight on the implication
  and your experience. The longer you narrate what they do, the more it tips to lecture.
- **Point the lens at the category, not at them.** "Most observability tools assume a
  human reads the dashboard" is about the *market* — it positions them by contrast
  rather than reciting their homepage back at them.

The same applies to the **job**: never describe the role's responsibilities back to the
hiring manager. Infer the *unstated* reality instead — what's stretched thin, what's
about to get heavy (the connect-the-dots angle). "A seed team building something this
broad probably has more to do than people" is a guess about their interior; "you're
hiring a backend engineer to work on your API" is reading the job post aloud.

**The recitation test:** *Would the reader learn nothing from this sentence except that
I visited their website?* If so, it's recitation — cut it, or add the layer that makes
it yours.

---

## 5. The kill list (phrases a tool should flag or strip)

Backed by analysis across cold-outreach research — these set a low credibility bar and
read as automated:

- "I hope this email finds you well" / any greeting platitude
- "My name is…" (it's in the From field)
- "I'm writing to you today to…"
- "I just applied and wanted to…" (the cold-apply tell — this is the default failure)
- "Congrats on the funding!" with no interpretation attached
- "I noticed your company is a leader in [industry]"
- Reaction words used as a substitute for an actual point (§4)
- Evaluative grading of the founder's choices ("bold thing to be building") — reads as
  presumptuous from a stranger; it shifts focus onto your appraisal of them

**First-five-words rule:** the specific, company-true observation should arrive almost
immediately. Readers disengage by the second sentence if you're still warming up.

---

## 6. The ask — calibration

- Match friction to relationship temperature. Cold + busy founder = **low** ask.
- "Do you have 30 minutes Tuesday?" is too much from a stranger.
- Good: *"If you're open to it, I'd love 15 minutes to hear where things are stretched
  thin and whether someone like me could help."*
- Lower friction: *"Worth a conversation?"* (a cheap yes/no)
- No-meeting variant: *"Either way, would love to know if you're hiring for anything
  like this."*
- Fold the ask into the final paragraph so it doesn't tack on as a lonely line.

---

## 7. Worked example — "Acme" (seed-stage, B2B infra; fictionalized)

**Research extracted:**
- *Thesis:* As AI agents write more code nobody fully understands, the bottleneck moves
  from *writing* software to *operating/verifying* it. Observability shifts from
  humans-reading-dashboards to autonomous agents that verify deploys and triage issues.
- *Signals:* a small seed round (tiny team, generalist roles, everything still being
  built); AI-infra customer logos; integrates with the incumbents it's partly positioned
  against.

**Final email (brackets = the part only the candidate can write):**

> Hi [name],
>
> Most observability tools still assume someone's eventually going to sit down and read
> the dashboard. Acme seems to be betting that as agents write more of the code,
> nobody really will — so the checking has to happen on its own. If that's the right
> call, a lot of what monitoring tools do today doesn't survive it.
>
> I [your experience — e.g., "spent two years on incident response at X, where the
> dashboard was always the bottleneck: by the time someone read it, the damage was
> already done"]. So the gap you're closing isn't abstract to me — I've lived on the
> wrong side of it.
>
> A seed team building something this broad probably has more to do than people to do
> it right now. If you're open to it, I'd love 15 minutes to hear where things are
> stretched thin and whether someone like me could help.
>
> [You]

Note how paragraph 1 contains zero words about the sender, ends on a consequence (not a
reaction), and never grades the founder.

---

## 8. Spec for a cold-outreach tool

If a tool is generating these, this is the pipeline it should implement.

### Inputs required
- **Target company URL** (and ideally: blog/launch post, recent funding, jobs page,
  customer logos, integration list).
- **Candidate background** — concrete experiences, owned problems, employers. Without
  this, the tool can only produce the §7 first paragraph and must leave paragraph 2 as
  an explicit `[bracketed]` slot rather than inventing it.

### Generation steps
1. **Extract the thesis.** From the company's own framing, state in one sentence the
   *bet* they're making — not what they do, what they're wagering will be true.
2. **Derive the implication.** What does that bet make obsolete / urgent / true? This
   becomes the consequence line (§4).
3. **Read the signals.** Funding stage → team size & role breadth. Hiring pattern →
   what's getting heavy. Logos/integrations → who they serve and compete with.
4. **Map background to the problem.** Find the single experience that puts the candidate
   "on the wrong side" of the gap the company is closing. One mapping, not a résumé.
5. **Assemble** in the §3 structure, calibrate the ask (§6).

### Validation gates (reject / rewrite if any fail)
- [ ] Paragraph 1 contains **no** first-person reaction words (§4, §5).
- [ ] The first company-specific observation lands within the first sentence or two.
- [ ] The email states at least one **consequence/implication**, not just facts.
- [ ] Self-reference appears **only** in paragraph 2, tied to the stated problem.
- [ ] No phrase from the kill list (§5) is present.
- [ ] Total length under ~120 words; three paragraphs.
- [ ] An ask exists, calibrated to low friction (§6).
- [ ] Depth classified as **Deep** (§2) — not Shallow/Medium.
- [ ] No sentence merely recites public facts or role duties back to them; every claim
      about the company is hedged as the sender's read **and** carries an added layer —
      a consequence, tension, or inference about their interior (§4, recitation test).
- [ ] Nothing in paragraph 2 is fabricated; unknown background stays `[bracketed]`.

### Anti-goals
- Don't optimize for volume. One Deep email beats fifty Medium ones.
- Don't fabricate the candidate's experience to fill the template.
- Don't let the model grade the founder's strategy or gush.
- Don't mistake *information* (facts) for *interpretation* (the actual edge).

---

## 9. The test that overrides every rule

> Could the first two sentences have been written by someone who didn't actually
> understand the company?

If yes, it's not done. Every rule above is just a way of guaranteeing the answer is no.
