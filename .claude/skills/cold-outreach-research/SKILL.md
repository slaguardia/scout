---
name: cold-outreach-research
description: Research evidence and best practices on cold outreach (reply rates, warmth/tone, personalization depth, AI-tells, brevity) to validate or evolve scout's outreach writing pipeline. Use when a writing-pipeline decision is contested and should be settled with data instead of instinct — e.g. "should the email keep genuine warmth or strip it?", "does the hook need to be clever?", "how long should it be?", "are em dashes / 'passionate about' really tells recruiters react to?".
---

# Cold-outreach research

Scout's outreach writing lives in the **editable stage prompts** in
`internal/outreach` (researcher / writer-fill / humanizer / honesty) and the
**email template's holes** — a stack of opinionated decisions, with no separate
"doctrine" doc anymore. When one of those decisions is in doubt, don't argue it
from taste — research it and let the evidence settle it. This skill is the
disciplined way to do that and feed the answer back into the pipeline.

## When to use

- A pipeline writing rule is contested ("keep genuine warmth vs. strip it",
  "lead with a clever hook vs. a plain intro", "how long is too long").
- Before baking a register/tone change into the doctrine or a stage prompt.
- Periodically, to re-check the doctrine against current cold-outreach data.

## How to run it

1. **Frame the exact decision.** State the specific pipeline question and the
   competing options — e.g. "the humanizer should KEEP genuine warmth ('I'd love
   to help…') while cutting hollow enthusiasm ('passionate about')" vs. "strip all
   enthusiasm." A vague question yields a vague answer.

2. **Run the `deep-research` skill** with these angles (adapt to the question):
   - reply/response-rate data on cold-email tone and warmth (A/B tests, large
     datasets) — and control for brevity, the most common confound
   - genuine/specific personalization & enthusiasm vs. generic clichéd enthusiasm
   - AI-sounding / formulaic language and its effect on replies, plus the specific
     tells readers flag (em dashes, "passionate about", "thrilled", "delve",
     "I hope this finds you well")
   - personalization depth vs. reply rate
   - job-seeker cold outreach to founders / hiring managers vs. sales cold email —
     does the guidance differ?

3. **Weight hard evidence over blog opinion**, roughly in this order:
   - large datasets / A/B from outreach tools (Lavender, Gong, Outreach.io,
     HubSpot, Mailshake, Belkins, Woodpecker, Backlinko's cold-email study)
   - academic studies on email persuasion / warmth / response
   - recruiter & founder surveys and first-person hiring-manager accounts
   - generic SEO listicles last, and only when they cite data.
   Note sample sizes, and flag when a finding is sales-context (it may not
   transfer to job-seeking, which is the actual use case here).

4. **Translate findings into concrete pipeline edits**, mapped to where they live:
   - the editable stage prompts (`internal/outreach`: researcher / fill / humanizer)
   - the email-template holes (the localized DB singleton, or the `template.go`
     compiled default)
   Say which finding drives which edit, and flag where evidence is thin so we
   don't over-fit to a single blog post.

## Honest verdict

Always close with a clear **yes / no / it-depends-and-here's-the-call** on the
decision that prompted the research, the confidence level, and the strongest
counter-evidence. The whole point is to stop instinct-driven thrashing — a
wishy-washy "it depends" with no recommendation is a failure of this skill.
