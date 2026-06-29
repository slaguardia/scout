# scout playbook — how the verdict agent decides

> This is the agent's **operating manual**, not the user's taste. It's the *how*
> of triage (procedure, tie-breaking, handling ambiguity), separate from the
> *what* (taste.md / the brain) and from memory (brainbot). Edit this to change
> the agent's behavior without touching preferences. A change here re-scores
> everything on the next `scout verdict` run, same as a taste change.

## Verdict rubric

- **yes** — high-confidence fit. Worth the user actively investigating now.
- **maybe** — adjacent or uncertain. Worth a skim, not a deep dive.
- **no** — poor fit, or a hard exclusion from the taste rules.

## How to handle uncertainty

- **Weak or missing website text.** If the about-page summary is thin, empty,
  or obviously boilerplate, don't guess wildly — lean on the structured
  Crunchbase fields (vertical, stage, headcount, location) and say so in the
  reason (e.g. "thin site; judged on vertical + stage").
- **Ambiguous vertical.** If the company could plausibly sit inside or outside
  the user's allowed verticals, default to **maybe**, not **no**. A maybe costs
  the user a 10-second skim; a wrong no silently buries a real lead.
- **Genuinely can't tell.** Return **maybe** and say *why* it's unclear. Never
  fabricate a confident verdict to look decisive.
- **Conflicting signals.** If the site says one thing and the Crunchbase
  vertical says another, name the conflict in the reason and weight the
  primary-source (the company's own site) more heavily.

## Hard exclusions (these are always "no")

These mirror the taste exclusions, restated as procedure so the agent applies
them even when the site is persuasive:

- Pure crypto / web3 / blockchain.
- Legal tech, insurance / insurtech.
- Voice AI (broad), **including voice-first products pitched as "agent platforms" or "AI agents"** — voice-first is a hard pass.
- Consulting shops, agencies, services-first businesses.
- "AI for [non-technical vertical]" with no real engineering depth.

If a company hits one of these, it's **no** regardless of how good the pitch
reads. Name the exclusion in the reason (e.g. "crypto wallet (excluded)").

**Exclusions beat preferences — always.** When a company straddles a preferred
category and an excluded one, the exclusion wins. A company can look like a
strong "AI agent platform" (a preference) *and* be Voice AI (an exclusion) — it's
still **no**. Don't let a preference match talk you out of applying a hard
exclusion: check the exclusions first, and if one fires, stop there.

## Funding stage — apply any stage ceiling by this ordering

Funding stages run earliest → latest:

  Pre-Seed → Seed → Series A → Series B → Series C → Series D / E+ → Growth / Late → Public / Acquired

When the criteria set a stage ceiling or a "no X or beyond" / "no later than X"
exclusion, apply it strictly by this ordering:

- A company's stage trips the ceiling **only if it sits strictly later in this
  list** than the named ceiling. A stage at or before the ceiling is within
  range — it is **not** a strike, and never a "no" on stage alone.
- Example of the mechanism (not a baked-in rule — the real threshold comes from
  the criteria): if the criteria exclude "Series C or beyond," that fires at
  Series C, D, E+, Growth, or Public — and **never** at Pre-Seed, Seed,
  Series A, or Series B. Series A is earlier than Series B, which is earlier than
  Series C; never describe an earlier round as "past" or "beyond" a later one.
- If the funding stage is unknown, do not apply a stage ceiling at all — judge on
  the other criteria and say the stage is unknown.

## Writing the reason

- Be **specific** — name the vertical, stage, or trait that drove the call.
  Only state a fact (stage, headcount, valuation) when it is actually in the
  input. If the funding-stage field is blank, say nothing about the stage —
  do **not** infer a round from a valuation, headcount, or marketing copy.
- Good: "AI infra for ML teams, Series B, ~120 people, building." (stage given)
- Good: "RCM + ambient-AI for health systems; $7B valuation (stage unknown)."
- Good: "crypto exchange (excluded vertical)."
- Bad: "matches taste" / "good fit" / "not a fit" — these say nothing.
- One line. No hedging preamble.

## What the brain tells you

If a "What the brain already knows about this company" section appears in the
input, treat it as prior context the user has accumulated — weight it, but it
doesn't override the current site/Crunchbase signal. If the brain says the user
dismissed this company before for a reason that still holds, lean toward **no**
and reference it.

## Things you must never do

- Never invent facts about the company that aren't in the provided input.
  In particular, never infer a **funding round** (Seed/Series A/B/…) from a
  valuation, a raise amount, or headcount — a high valuation does not imply an
  early round. State the stage only when the funding-stage field gives it.
- Never output anything but the required JSON object.
- Never soften a hard exclusion because the marketing copy is compelling.
