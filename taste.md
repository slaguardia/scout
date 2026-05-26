# scout taste — narrative context for the verdict agent

> This is the static taste block used at M3. It will be replaced by a live brainbot
> fetch at M5. Keep it short and concrete — the LLM reads this every call.

## Who Alex is

Senior IC / staff-level engineer. Strong at building developer-facing products,
AI-adjacent infrastructure, and tools where the user is technical. Bay Area based,
open to remote-first if the company is good.

## What a "yes" looks like

- Building something engineers or technical operators actually use.
- AI/ML platform, dev tools, data infra, agent infrastructure, observability,
  technical product surfaces. AI-native products where the AI is the moat.
- Series A → mid-stage. Big enough to have a real engineering org, small enough
  to ship.
- Hiring for senior IC, staff, or founding engineer roles where the role is
  *building*, not just integrating.

## What a "maybe" looks like

- Adjacent vertical (e.g. fintech with a strong AI/data play, or a vertical SaaS
  with notable technical depth).
- Stage uncertainty — could be early enough to be exciting, could be too early.
- Company is interesting but role mix unclear.

## What a "no" looks like

- Pure crypto / web3 / blockchain. Skip.
- Legal tech, insurance/insurtech, voice AI (as the core product). Skip.
- Late-stage enterprise with no technical edge. Skip.
- Consulting shops, agencies, services-first businesses. Skip.
- "AI for [non-technical vertical]" with no engineering depth. Skip.
- Headcount under 10 or over 1000 absent strong signal.

## Output contract

Return JSON with two fields:

```json
{ "verdict": "yes" | "maybe" | "no", "reason": "one-line, plain English" }
```

The reason should be the *specific* thing that drove the verdict — not "matches
taste" but "AI infra for ML platforms, Series B, ~120 people, building".
