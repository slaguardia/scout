# React migration — spec

Migrate scout's web UI from the vanilla-TS monolith to **Vite + React + TypeScript**,
while keeping scout a **standalone app**, reusing the **`@brainbot/web-toolkit`**
for everything that isn't rendering, and leaving the **brain stack-agnostic**.
This is a **frontend-only** rebuild: the FastAPI backend, the `/api/*` surface,
SQLite, and the brain contract are untouched.

## Why (context)

`web/src/app.ts` is ~5,700 lines of `@ts-nocheck` imperative DOM (`getElementById().onclick`,
one hand-rolled `state` object, manual re-render) plus `web/src/markup.ts` (~900
lines of HTML-as-string). That's the pile React exists to replace. The API is
stable and the design system is CSS-based, so each view is a self-contained
rebuild against unchanged endpoints.

## Goals

- Replace the vanilla UI with React components, **behavior-for-behavior**.
- Extract **maximum value from the toolkit**: consume its agnostic parts as-is;
  reimplement only its two framework-bound parts (`shell`, `components`) locally
  in React, reusing the toolkit's CSS verbatim.
- Keep React **entirely inside `web/`** — the toolkit gains **no** `react`
  dependency and no JSX. That's what keeps it stack-agnostic.

## Non-goals (explicit — do not scope-creep)

- **No backend changes.** `scout/web/*.py`, `/api/*`, SQLite, brain proxy: untouched.
- **No brain changes.** It speaks HTTP/JSON (`recall`/`doc`/`map`); React vs.
  vanilla is invisible across scout's `/api/brain/*` proxy.
- **No new UX.** No URL-addressable views/deep-linkable panes, no redesign, no new
  features. Same tabs, same panes, same flows, same look. (URL routing is a
  *possible future*, not this migration.)
- **No toolkit rewrite.** Do not add React to `@brainbot/web-toolkit`, do not
  extract a shared `@brainbot/web-react` package. If a second React app appears
  later, extract then — not now.

## Target stack & decisions

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 18 + TypeScript + `@vitejs/plugin-react` | The one change; Vite stays. |
| Routing | **None** — a single `<App>` with view state (`companies`\|`jobs`\|`inbox`\|`settings`) + pane state | Matches current behavior (app is not URL-routed today). Adding a router is new UX = out of scope. |
| Store | `useReducer` + Context, mirroring the current single `state` object | Zero new deps. Reach for Zustand only if prop-drilling actually hurts. |
| Server state / polling | **TanStack Query** | Earns its place: the app has ≥4 hand-rolled `setInterval` polls (pursuit drafts, answers, jobs draft-status, notifications) + "refetch on return" semantics. Query replaces all of it. If the executor wants zero new deps, `useEffect` polling is the fallback. |
| Data layer | Typed `fetch("/api/…")` wrappers in `web/src/api/*.ts` | Keep the existing endpoints; just type them. |
| Styling | **Reuse `base.css` + `components.css` + tokens verbatim** | The big win — React components use the same classNames and render pixel-identical. **Never restyle in React.** |

## Toolkit: consume vs. reimplement

**Consume as-is (no toolkit change):**
- `@brainbot/web-toolkit/base.css`, `.../components.css` — import once in the entry.
- `.../pwa` — `registerSW`, `manifest`, `swSource` (the `gen-pwa.ts` prebuild is unchanged).
- `.../session` — `currentUser()` at boot (identity hook; resolves null in local dev).
- `.../vite-preset` — `toolkitVite({ apiProxyTarget })` stays in `vite.config.ts`.
- `.../tokens` — import token values where needed.

**Reimplement locally in `web/src/` (React over the same CSS):**
- `shell` (`mountApp`): scout already mounts a single `chrome:false` full-bleed
  route — it owns its layout. So `mountApp` **goes away**; React mounts directly
  on `#root`. The sidebar/nav becomes `<Sidebar>`.
- `components` (button/badge/card/table/modal/SSE-drawer/toast factories): become
  React components in `web/src/components/`, wrapping the same `components.css`.

## Build & serve changes

- `web/package.json`: add deps `react`, `react-dom`, `@tanstack/react-query`; dev
  deps `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`. Keep `tsx`,
  `typescript`, `vite`, and the `@brainbot/web-toolkit` file dep.
- `web/vite.config.ts`: add `react()` to the merged config; keep `toolkitVite`
  (proxy + `swSource`) and `outDir: "dist"`.
- `web/index.html`: add `<div id="root"></div>`; entry becomes `/src/main.tsx`.
- `web/scripts/gen-pwa.ts`: **unchanged** (still emits manifest + copies the SW).
- `scout/web/app.py`: **unchanged** — `_mount_spa` already serves `dist/` with an
  index.html fallback for non-`/api` GETs (`scout/web/app.py:97`). React output
  drops straight in.
- The `@ts-nocheck` disappears — typing the logic is part of the work (expect it
  to surface a few latent bugs; port faithfully, don't redesign).

> **Sandbox build caveat:** `npm run build` is broken in this environment. Use
> the tsx workaround + the worktree `node_modules` symlink documented in the
> project memory (`scout-web-build-and-redeploy` / `scout-python-test-env`).
> Validate the React build the same way.

## Migration strategy: clean rebuild, phased, cut over at the end

The monolithic `initScout` shares one `state` object, so a "React island inside
vanilla" strangler is high-friction (two state systems bridged by events). Instead:
**rebuild the whole UI in React in the same `web/` app**, view by view, with
`main.tsx` as the React entry from Phase 0. The old `app.ts`/`markup.ts` stay in
the tree **unreferenced** as a porting reference and parity oracle until Phase 8
deletes them.

**Verification is behavior parity.** For each phase, run the React app against a
seeded DB on a **non-default** `--addr`/`--db` (never the canonical `:8765`/`:5173`)
and compare to the current UI: same rows, same filters, same API calls, same pane
actions. Use `/run` and `/verify`.

### Phase 0 — Scaffolding
Add React deps + `@vitejs/plugin-react`; `#root`; `main.tsx` boots a React `<App>`
shell (sidebar + empty content); keep `registerSW`/`currentUser`/CSS imports.
**Verify:** app serves, nav renders with toolkit CSS, build green (tsx workaround).

### Phase 1 — Primitives, shell, store, API layer
Port the toolkit component factories to React (`<Button> <Badge> <Card> <Table>
<Modal> <ProgressDrawer> <Toast>`); build `<Sidebar>` (tabs + actions + filter
blocks + footer); the typed API client (`web/src/api/*.ts`); the store
(`useReducer` + Context for view/meta/vocab/notifications); TanStack Query setup.
**Verify:** shell renders, tab switching works (empty views), toast/drawer render.

### Phase 2 — Companies view
Table + sort + filters + columns menu + search + skeleton + empty state; then the
company **detail pane** (`#pane`): `renderDetail`, verdict edit, mark-reviewed,
toggle-flag, postings list, add-posting, delete-company, relink modal.
**Verify:** parity of rows/filters/pane actions + identical API calls.

### Phase 3 — Jobs view (application tracker)
Jobs table + jobs filters + queue nav (the "N follow-ups due" banner + "★ Next up"
button) + stage/status pills + row tracking.
**Verify:** parity with the current jobs tab, including the follow-ups-due filter.

### Phase 4 — Pursuit pane (largest; split into sub-phases)
The slide-in (`#pursuit-pane`) has four sub-systems — do them in order:
- **4a Posting card** — stage controls, notes, relink, delete, `PUT /api/postings/{id}`.
- **4b Contacts manager** — contact CRUD, cards, follow-up group, outreach log
  entries, send-followup modal, follow-up-template render.
- **4c Outreach drafts** — drafts region, draft cards, start/regenerate/cancel/
  delete/edit, send-via-Gmail, mark-sent, **SSE progress** (`EventSource`), trace,
  lint chips, violations.
- **4d Application answers** — answer cards, generate/regenerate/redetect/remove,
  input gate.
**Verify:** each sub-panel against the current pursuit pane; drive a real draft +
a real answer generation end-to-end.

### Phase 5 — Settings view
Criteria stats + taste-filter editor + playbook editor + per-stage outreach
pipeline prompt editors + email template + follow-up template + follow-up interval
+ Gmail config + Anthropic key + outreach-knowledge peek + re-distill trigger.
**Verify:** each editor round-trips to its endpoint.

### Phase 6 — Add dialog + pipeline runs
The **Add…** dialog (company\|job toggle, capture "fill in the blanks", CSV upload);
the pipeline run triggers (Enrich/Verdict) + the **SSE progress drawer**
(`EventSource /api/jobs/{id}/stream`) + run history.
**Verify:** capture add, plain add, CSV import, and a run all work.

### Phase 7 — Inbox + Chat
Notifications inbox tab; chat FAB + threads panel.
**Verify:** notifications render/mark-read; chat threads load and send.

### Phase 8 — Cutover & cleanup
Confirm `main.tsx` is the only entry; **delete `web/src/app.ts` + `web/src/markup.ts`**
and any now-dead imports; remove `mountApp` usage. Run the full build (tsx
workaround) + `tsc --noEmit` (now meaningful) + a manual smoke of **every** view
against a seeded DB.
**Verify:** build green, typecheck green, all flows parity-checked, `dist/` serves.

## Risks / watch-items

- **Sandbox build breakage** — always validate via the tsx workaround (memory).
- **Typing the monolith** — removing `@ts-nocheck` surfaces latent bugs; port
  faithfully, note anything you fix, don't redesign behavior.
- **SSE + polling** — port `EventSource` faithfully as effects; TanStack Query
  owns the interval polling.
- **Browser APIs** — Gmail send, clipboard, file upload: keep the cross-browser
  progressive-enhancement posture (scout is open source; user is on Brave but the
  UI targets Safari/Firefox fallbacks — memory `scout-frontend-browser-target`).
- **Agnostic discipline** — every React line stays in `web/`; the toolkit gets no
  `react` dep. If you feel the urge to add React to the toolkit, stop.

## Success criteria

1. Every current view/flow works identically in React, verified against a seeded DB.
2. `web/src/app.ts` + `web/src/markup.ts` deleted; no `@ts-nocheck`; `tsc --noEmit` clean.
3. `@brainbot/web-toolkit` has **no** React dependency; scout reuses its CSS/tokens/
   pwa/session/brain-client unchanged.
4. Backend, `/api/*`, SQLite, and brain contract unchanged; `dist/` serves from
   the existing `_mount_spa` fallback.
5. Build validates via the documented tsx workaround.
