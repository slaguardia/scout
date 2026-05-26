# scout UI v2 — PRD

> Status: **trimmed draft, ready to scaffold.** Companion to the top-level
> `PRD.md`. The top-level PRD locks v1 (M1–M6); this doc specs the next
> layer of UI work on top of the M4 triage UI. Half the scope of the
> earlier draft — keyboard shortcuts, taste preview, and UI-driven
> stage re-runs are cut.

## 1. Problem with v1 UI

The M4 UI works but it's a glorified spreadsheet: a dark-mode HTML table
that filters and sorts on the client. It does not:

- Let me change `status` (`new → reviewed/tracked/dismissed`) from the UI.
- Surface *why* a verdict came out the way it did beyond the one-line reason.
- Help me hand off to the Notion tracker — I copy the company name into a terminal manually.
- Show what's already in brainbot for a company, even though scout has a live brain client.
- Show pipeline health at a glance.

The result: I'm still doing most of the triage work in iTerm and SQLite,
with the web UI as a viewer. v2 closes that gap.

## 2. Goal

End-to-end triage and handoff for one CSV's worth of survivors in **under
10 minutes** without leaving the browser. The CLI stays the canonical
control surface for batch runs; the UI is the review surface. They don't
overlap.

## 3. Non-goals

Inherited from top-level PRD §3, plus explicit cuts from the earlier draft:

- **Not a system of record.** Notion stays canonical. The UI emits a
  `tracker.py add ...` command to clipboard; it does not call Notion.
- **Not multi-user.** Localhost only.
- **No UI-driven stage re-runs.** `scout enrich` / `scout verdict` stay
  CLI commands. The UI never spawns subprocesses, no SSE progress
  streaming, no in-process job lifecycle.
- **No taste editing or preview in the browser.** `taste.md` stays a
  file edit; tasting changes is a CLI re-run.
- **No keyboard shortcuts beyond `esc` to close modals.** I'm reviewing
  20–50 rows per session, not 500. Click works.
- **No light mode.** Dark is the only mode.
- **No mobile layout.** Reviewing on a laptop. Punt.
- **No SPA build pipeline.** Vanilla JS, vanilla CSS, single embedded HTML.

## 4. Users

One. Me.

## 5. Surfaces

Three surfaces. One always-visible sidebar.

### 5.1 Triage list (the home view)

The v1 table, with three additions:

- **Status pill** alongside the verdict pill on every row (`new` /
  `reviewed` / `tracked` / `dismissed`).
- **Status filter** in the header alongside the existing verdict filter
  (the v1 HTML has it but it doesn't drive any state — wire it up).
- **Visual treatment for status:**
  - `dismissed` rows: half opacity, sort to the bottom of their verdict bucket.
  - `tracked` rows: subtle left-border accent.
  - `new` / `reviewed`: unchanged.

Click on a company name opens the detail pane (§5.2). The existing
click-to-expand summary moves into the detail pane and goes away from
the row itself.

### 5.2 Detail pane (slide-over from the right)

Opens on company-name click. Closes on `esc` or background click. Does
NOT replace the list — overlays it.

Sections, top to bottom:

1. **Header.** Name, verdict pill, status pill, domain link.
2. **Status controls.** Three buttons: Mark Reviewed, Mark Tracked, Mark
   Dismissed. Active state on the current one. "Mark Tracked" also
   copies `tracker.py add "<name>"` to clipboard and shows a 2-second
   toast confirming.
3. **Crunchbase facts.** Vertical, location, headcount, stage. Plus a
   collapsed "Raw row" disclosure that shows the rest of `raw_json` —
   useful when the LLM verdicts feel off and I want to see what other
   signal was in the row.
4. **Verdict reasoning.** Full reason string, model used, `taste_version`
   (tooltip shows first ~200 chars of the taste block that produced it),
   `scored_at` timestamp.
5. **Enrichment.** Cached about-page summary (the full 3000-rune text),
   the URL that was fetched, the `fetch_status`, `fetched_at`.
6. **Brain context.** Lazy-loaded on detail open: GET `/api/companies/:id/brain`
   calls `search_nodes(query=name)` on the brain. If brainbot isn't
   configured, the section is hidden. If it returns no nodes, shows
   "Nothing in the brain about this company." Otherwise lists matched
   entities with name + summary + labels.
7. **Episode history.** "Verdict shipped to brain on YYYY-MM-DD for
   taste_version XYZ" if a row exists in `episodes_sent`, else "Not yet
   shipped to brain."

### 5.3 Stats sidebar (always visible, left)

Read-only. No buttons. Just numbers:

- **Pipeline counts:** total companies, survivors (matching the current
  filter), enriched OK, scored, unscored.
- **By verdict:** count of `yes` / `maybe` / `no` / unscored.
- **By status:** count of `new` / `reviewed` / `tracked` / `dismissed`.
- **Enrichment failures:** count by `fetch_status` (e.g. `dns: 4`,
  `http_403: 2`). Useful for spotting "is my fetch broken or is the
  data bad."
- **Current taste:** `taste_version` short hash + source label
  (`file:taste.md` or `brainbot:<url>`). No edit button. If the version
  in the DB's verdicts doesn't match the current taste, show a small
  "N verdicts stale" hint.

Sidebar filters: verdict, status, free-text search. Same controls that
live in the header today, moved into the sidebar so the table gets its
full width back.

## 6. New backend surface

Additive to the M4 web server. Localhost only. No auth.

| Route | Verb | Purpose |
|---|---|---|
| `/api/companies` | GET | (existing) list view payload |
| `/api/companies/:id` | GET | detail payload: company + enrichment + verdict + episode-sent flag + parsed `raw_json` |
| `/api/companies/:id/status` | POST | `{state: "reviewed" \| "tracked" \| "dismissed" \| "new"}` → update `status` table, return updated row |
| `/api/companies/:id/brain` | GET | proxy `search_nodes(query=name)` to the brain; 404 if brainbot not configured |
| `/api/stats` | GET | sidebar payload |

Five routes total. Four new. No SSE, no subprocess spawning, no auth.

The brain proxy reuses `internal/brainbot.Client`. To use it, `scout serve`
gains a `--brainbot URL` flag (matching `scout verdict --brainbot`). If
unset, `/api/companies/:id/brain` returns 404 and the detail pane hides
section 6.

## 7. Data model changes

Minimal:

- **`status.updated_at` actually gets used.** Today it's set on insert
  but never updated. The status POST handler sets it.
- **No new tables.**

## 8. Visual design notes

- **Dark mode only.** Use existing CSS variables.
- **Inline SVG for icons.** No font deps.
- **Vanilla JS, vanilla CSS.** Current `index.html` is ~200 lines of
  script; v2 will be ~400. Still one embedded file.
- **One web font max** — match the v1 system stack (`-apple-system`,
  `BlinkMacSystemFont`, etc.). No external font fetches.

## 9. Out of scope (might be v3, might be never)

- Inline taste editing.
- Multi-CSV / multi-source views.
- Diff across runs ("what's new since last time" — needs a CLI `scout diff` first).
- Direct Notion integration.
- Auth / multi-user.
- Bulk status actions.
- UI-driven stage re-runs.
- Keyboard navigation.
- Light mode.
- Mobile layout.

## 10. Open questions

- **Brain section caching.** If the user opens detail panes for 50
  companies in a session, that's 50 `search_nodes` calls. Cheap, but
  worth a small client-side cache so re-opens are instant. Probably not
  in U1; add if it bites.
- **`raw_json` rendering.** `<pre>` block? Pretty-printed? Keyed table?
  Pick during U2 implementation — easy to swap.

## 11. Milestones

1. **U1 — Backend.** Add the four new API routes. `scout serve --brainbot`
   flag. Test by curl.
2. **U2 — Detail pane.** Slide-over UI, all seven sections wired against
   the new endpoints. Brain section conditional on brainbot configured.
3. **U3 — Status write-back.** Status controls in the detail pane, status
   pills in the list, status filter in the sidebar, dismissed/tracked
   visual treatments. "Mark Tracked" copies the promote command.
4. **U4 — Stats sidebar.** Move filters out of the header, add the
   sidebar with all the counts and the taste-source line.

U1 has to land before U2. U2 has to land before U3 (status controls live
in the detail pane). U4 is parallel to U2 and U3 — purely additive.

## 12. What this PRD does NOT change

- Pipeline stages stay CLI-driven. The UI never spawns them.
- The three-store split is unchanged.
- The brainbot integration stays one-directional from the UI's
  perspective: the UI *reads* brain context for display. Episode
  write-back stays a `scout episodes` CLI operation.
- `taste.md` (or the brain) remains the source of truth for taste. The
  UI never writes to either.
