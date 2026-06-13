# Cold Outreach Doctrine

A working specification for writing — and building tooling around — high-signal cold
outreach to startups. Written to be used two ways: as a human reference, and as a
context document you can hand to Claude Code when evolving a cold-outreach tool.

> **How scout uses this document.** This is the *method* — the writing
> philosophy. scout embodies it in **editable prompts**, not a separate doctrine:
> the operative rules (§2–§6, §9) live in the **Writer** stage's default prompt
> and the **Judge** stage, both editable per-stage from the dashboard (Settings →
> *Outreach pipeline*); §3/§6 specifics also live in the **email template**'s hole
> instructions; §8 is the engine itself — see [pipeline.md](./pipeline.md)
> (`scout outreach`). There is no longer a standalone "doctrine" file — it was
> removed and folded into the Writer prompt. The worked example uses a
> fictionalized company ("Acme").

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
   back in one sentence, then where that bet makes the *work* hard to execute — the
   operational problem the role exists to close, not an abstract industry consequence.
2. **Connect-the-dots angle** — Infer their current internal reality from external
   signals (funding stage, hiring pattern, customer logos, integrations).
3. **Product-use angle** — A specific reaction from actually using the product.
   *(Often unavailable for B2B / infra companies — don't force it.)*

For B2B and infrastructure companies, **Thesis + Connect-the-dots** is the reliable
pairing. Product-use is a bonus when you can get it, not a requirement.

---

## 3. The structure

Three short paragraphs, **one through-line**. Under ~120 words total. Readable on
a phone without scrolling. The whole email is one arc that never resets: *their
problem → the relevant thing you've done → an offer to do that work.*

1. **The hook** — an observation about *them*. It may open with one short, factual
   lead-in that grounds the observation in something real (an article, a post, a
   launch, a founder quote) so it doesn't drop out of nowhere — but no capability
   claim about yourself yet. Name where the *work* gets hard (the operational
   problem the role exists to close), not an abstract industry consequence.
2. **The proof** — the relevant *shape* of your experience, answering the exact
   difficulty the hook named, at the strongest honest tier. Plain words a stranger
   can follow; the shape of the work, **not** a specific-project case study. Frame
   an adjacent fit openly as adjacent.
3. **The ask** — direct and specific (§6): you want to talk about how you can help
   solve *that* problem as their next hire. Carry the proof's thread forward; do
   not reset to a fresh observation about the company.

The reader should meet an *idea about their company* before they meet *you* — but
a brief factual lead-in ("I read that…") is human, not warm-up.

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

### Written for a stranger (legibility)

"Show, don't tell" governs your *reactions*, not your *facts*. It never licenses being
terse or allusive about your own experience. The reader has zero context on you — they
don't know your employer's internal projects, the vendors you integrated, or your
acronyms:

- Never name an internal project or vendor as if the reader knows it ("the Chainguard
  integration I led"). Say what it was in plain words, or cut it.
- State your experience; don't allude to it. "A decent proxy" or "the same shape of
  work" gesture at a claim instead of making it.
- Depth is not density: a hard idea still has to be a plain sentence. An email a
  stranger can't follow has failed, however sharp its insight.

And the self-pointed version of the reaction-word problem: **interest declarations**
("the problem I'd want to be working on", "the work I want to do") are presumptuous
(they assume the job) and hollow (the email already shows interest by existing). Cut
them — at most one grounded, present-tense note of the *kind* of work you like.

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
- AI-tell vocabulary: "bespoke", "leverage", "delve", "robust", "seamless",
  "landscape", "navigate", "spearhead" — swap for a plain word a person would say
- Insider shorthand a stranger can't decode (an internal project, vendor, or acronym
  named as if known) — see §4 legibility
- Interest declarations ("the problem I'd want to be working on") — presumptuous (§4)
- "Worth a conversation?" and other curiosity-call asks that don't ask to do the work (§6)
- A dangling sentence fragment bolted onto the hook

**First-five-words rule:** the specific, company-true observation should arrive almost
immediately. A brief factual lead-in ("I read that…") is fine, but the real observation
lands by the second sentence — readers disengage if you're still warming up.

---

## 6. The ask — direct and specific

The ask is **specific and direct about intent**: you want to talk about how you can
help solve the problem the hook named — as their next hire for the role — not have a
vaguely curious call about their business.

- Name the problem and the role: *"I'd like to talk about how I could help <that
  problem> as your next <role> — any chance you'd have 15 minutes?"*
- Keep the friction low: 15 minutes, not 30.
- **Never** soften it into info-gathering (*"I'd love to hear how you're approaching
  X"*) — that reads as a networking chat, not a candidate offering to help.
- **Never** appraise whether the company or role is "worth a conversation" — you're
  asking for *their* time, not granting them yours; the inverted status reads wrong
  from a stranger.
- Fold the ask into the final paragraph; never a lonely tacked-on line, and carry the
  proof's thread forward rather than resetting to a fresh company observation.

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
> it right now. I'd like to talk about how I could help close that verification gap as
> your next infra hire — any chance you'd have 15 minutes?
>
> [You]

Note how paragraph 1 leads with a category-lens observation, ends on a consequence (not
a reaction), and never grades the founder; the proof is openly adjacent ("I've lived on
the wrong side of it"); and the ask is a direct offer to do the work, not a curious
call. (An equally valid hook could open with a one-clause factual lead-in — "I read
Acme's launch post, and…" — before the observation.)

---

## 8. Spec for a cold-outreach tool

scout implements this as **five editable LLM stages** (each prompt tunable from the
dashboard — see [pipeline.md](./pipeline.md)): **researcher → writer → humanizer →
honesty check → judge**.

### Inputs required
- **Company research** — gathered by the *researcher* stage over the web: true facts
  plus *ranked, referenceable* hooks (eng/blog posts, founder theses, real launches —
  never funding announcements or marketing taglines), and an interpretation (the bet,
  what it makes hard to execute, signals read).
- **Candidate background** — concrete experiences, owned problems, employers. Deep and
  specific about *them*; **high-altitude about you** (the shape of the work, not a
  case study). Without it, the writer must leave the proof as an explicit slot rather
  than invent it — the *honesty check* stage rejects any sender claim beyond the docs.

### Generation steps
1. **Research** the company; surface the strongest *referenceable* thing to open with
   and read where the bet makes the *work* hard to execute (the operational problem the
   role exists to close — not an industry consequence).
2. **Write** the §3 structure: a hook that may ground itself in a real lead-in then
   names that problem; a proof at the strongest *honest* tier answering it; a direct
   ask (§6). One mapping, not a résumé; adjacency framed openly.
3. **Humanize** — strip AI tells (§5) without changing a fact.
4. **Honesty-check** every sender claim against the experience docs; a false claim to a
   recruiter is worse than a thin one.
5. **Judge** depth (§2) and gate: only Deep ships.

### Validation gates (reject / rewrite if any fail)
- [ ] The hook states at least one **consequence/implication**, not just facts, and no
      first-person reaction or interest declaration (§4, §5).
- [ ] The hook and the proof argue the **same problem** (one through-line); the closer
      carries that thread forward rather than resetting.
- [ ] The proof is **legible to a stranger** — plain words, no insider jargon, the
      *shape* of the experience rather than a specific-project case study (§4).
- [ ] Every claim about *you* is supported by the experience docs; an adjacent fit is
      framed openly as adjacent, never inflated.
- [ ] The ask is **direct and specific** — to help solve the named problem as their
      next hire — not a curious call or a "worth a conversation" (§6).
- [ ] No phrase from the kill list (§5); total length under ~120 words; three paragraphs.
- [ ] Depth classified as **Deep** (§2) — not Shallow/Medium.
- [ ] No sentence merely recites public facts or role duties back to them (§4 recitation
      test); the company read is hedged as the sender's.

### Anti-goals
- Don't optimize for volume. One Deep email beats fifty Medium ones.
- Don't fabricate or inflate the candidate's experience to tighten the fit.
- Don't let the model grade the founder's strategy or gush.
- Don't mistake *information* (facts) for *interpretation* (the actual edge), and don't
  mistake *interpretation* for a license to be abstract or illegible.

---

## 9. The test that overrides every rule

> Could the first two sentences have been written by someone who didn't actually
> understand the company?

If yes, it's not done. Every rule above is just a way of guaranteeing the answer is no.
