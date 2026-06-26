# scout — HTTP API contract

The stable surface a client (the UI today, a PWA next) builds against. Scout's
backend is a Python FastAPI (uvicorn) server that serves the built PWA plus a
JSON API on localhost (`scout serve`, default `:8765`).

**Source of truth: the FastAPI routers in [`scout/web/`](../scout/web/)** —
`app.py::create_app` auto-includes one `APIRouter` per module under `routes/`,
and the route table is the `@router` declarations across those files (`core.py`,
`run.py`, `capture.py`, `outreach.py`, `editor.py`, `profile.py`, …). If this doc
and the code disagree, the code wins; fix this doc. For *what scout is* and the
brain/scout split see [`./north-star.md`](./north-star.md); for *how to run it*
(flags, env, the `ANTHROPIC_API_KEY` requirement) see
[`./operations.md`](./operations.md).

All JSON responses are `Content-Type: application/json`. Errors are `{"error":
msg}` JSON bodies (capture and outreach add a structured field on a couple of
error paths). IDs are UUID strings for companies/postings; outreach draft ids are
integers.

## Capability gating (read this before building a client)

Some routes only work when an optional dependency is wired at startup. A client
should call `GET /api/meta` once on load and gate its controls on the flags it
returns. The gates, and the status code each absent capability returns:

| Capability | Wired when | Routes affected | Code when absent |
|---|---|---|---|
| **Control surface** (`Runner`) | `scout serve` always wires it; nil only in tests | `/api/run/`, `/api/jobs/`, `/api/ingest` | `503` "control surface disabled" |
| **Scoring / capture LLM** (`ANTHROPIC_API_KEY`) | key present in the server env | `POST /api/run/verdict`, LLM path of `POST /api/capture` | `412` "needs ANTHROPIC_API_KEY…" |
| **Editor paths** | `--taste-md` / `--playbook` configured | `/api/taste`, `/api/playbook` | `503` "&lt;kind&gt; path not configured" |
| **Outreach engine** | engine wired (set when `ANTHROPIC_API_KEY` is present) | `POST /api/postings/{id}/outreach` | `503` "outreach pipeline not wired…" |
| **Brain** (`--brainbot`, reachable) | brain configured and healthy | `POST /api/profile/refresh`, `POST /api/outreach/sync` | `404`/`412` "brain not configured" |

Note the split: scoring/capture (the LLM stages) return **412 Precondition
Failed** when the API key is missing; the control surface, editor, and outreach
engine return **503 Service Unavailable** when their capability is absent. A
client should treat 412 as "the server is up but this action needs a key" and
503 as "this build doesn't have this capability."

---

## Page + health

| Method | Path | Purpose | Notes |
|---|---|---|---|
| `GET` | `/` | Serves the built PWA. | The PWA shell the backend serves — static files from `web/dist/` (SPA fallback to `dist/index.html` for unknown non-`/api/` paths). |
| `GET` | `/api/me` | Signed-in identity. | Reads the edge's `X-Auth-Request-Email` header; returns `{"email":"…"}` when present, else `{}` (HTTP 200 either way). Never trusts a client value. |
| `GET` | `/healthz` | Liveness probe. | Prints `ok` (plain text). Used by the platform edge / launcher to show connected/offline. |

## Read / triage

The data the UI reads, plus the capture/manual write paths. None of these need
the control surface — they are direct SQLite reads/writes and work whenever the
server is up (one LLM-gated exception: `/api/capture`).

| Method | Path | Purpose | Gating / Notes |
|---|---|---|---|
| `GET` | `/api/companies` | List triage rows (`{rows, count}`). | — |
| `POST` | `/api/companies` | Manual add one company (website required). | `409` when the company already exists (body names the collision); `400` on a missing/unusable website. |
| `GET` | `/api/companies/{id}` | Company detail. | `404` on unknown id. |
| `PUT` | `/api/companies/{id}` | Edit the hand-editable fields (name required; website is identity, not editable). | `400` on blank name. |
| `GET` | `/api/companies/{id}/trace` | Decision trail — every verdict scoring pass. | — |
| `GET` | `/api/companies/{id}/postings` *(read via detail)* / `POST` `/api/companies/{id}/postings` | Add a posting link to a company. | The list ships inside the company detail; this route only **POSTs** a new posting. `400` on a bad url. |
| `PUT`·`POST` | `/api/companies/{id}/verdict` | Set a verdict by hand (`{verdict: yes\|maybe\|no, reason}`); stamped `model=manual` (sticky). | `400` on an invalid verdict value; `404` on unknown id. |
| `PUT`·`POST` | `/api/companies/{id}/flagged` | Set the hand-set bookmark (`{flagged: bool}`). | `404` on unknown id. |
| `PUT`·`POST` | `/api/companies/{id}/reviewed` | Stamp `reviewed_at = now` (no body). | `404` on unknown id. |
| `GET` | `/api/postings` | All postings across companies — the jobs view (`{rows, count}`). | — |
| `POST` | `/api/postings` | Manual add one posting from a link (no fetch, no LLM). | Company resolved from the typed name and/or the link host; `400` if neither identifies a company or the url is bad. |
| `PUT`·`POST` | `/api/postings/{id}` | Application-lifecycle update (full tracking state). | `400` on a bad field; `404` on unknown id. |
| `GET` | `/api/postings/{id}/outreach` | The posting's draft queue, newest first (`{drafts}`). | See **Outreach**. |
| `POST` | `/api/postings/{id}/outreach` | Start an outreach draft (`202` + the new row). | Needs the **outreach engine** (`503` when absent); `412` w/ `missing_blocks` when context blocks aren't healthy; `409` if a draft is already active. |
| `PUT`·`POST` | `/api/postings/{id}/next-up` | Toggle the "next up for outreach" queue mark (`{next_up: bool}`). | `404` on unknown id. |
| `PUT`·`POST` | `/api/postings/{id}/company` | Re-link the posting to a different **existing** company (`{company_id}`); returns `{posting, company_id, company_name}`. Fixes a wrong-twin capture — drafts/answers/tracking travel with the row. | `400` on unknown/blank company (never a silent create); `404` on unknown posting. |
| `POST` | `/api/capture` | Link-capture agent pass on one pasted URL (`{url, kind?, fields?}`). | ATS posting links resolve via public JSON, **no LLM, no key**. Any other link needs `ANTHROPIC_API_KEY` → `412`. Unfetchable page → `422` with `{error, fetch_status}` (JSON). `400` on a bad url/kind. |
| `GET` | `/api/stats` | Aggregate stats (counts, verdict histogram, criteria version/source). | — |
| `GET` | `/api/facets` | Distinct funding stages + verticals for the Add-company form. | — |

## Control surface (run the pipeline from the browser)

All gated on the **Runner** — `503` "control surface disabled" when nil.

| Method | Path | Purpose | Gating / Notes |
|---|---|---|---|
| `POST` | `/api/run/{stage}` | Start a pipeline stage as a background job. Stages: `enrich`, `verdict`. Optional JSON body `{force, only_blanks, company_ids, workers}`. Returns `202 {job_id, stage}`. | `503` if no Runner. `verdict` needs `ANTHROPIC_API_KEY` → `412`. `enrich` runs keyless (mechanical) and richer with a key. `400` unknown stage; `409` if a stage is already running. |
| `GET` | `/api/jobs/{id}/stream` | **Server-Sent Events** live progress for a running job. | See **Special transports**. `503` if no Runner; `404` unknown job. |
| `POST` | `/api/jobs/{id}/cancel` | Cancel a running job (`{canceled: bool}`). | `503` if no Runner. |
| `GET` | `/api/runs` | Which stage (if any) is currently running (`{busy_stage}`). | `busy_stage` is `""` when idle / no Runner. |
| `GET` | `/api/meta` | Capabilities for client gating: `{control, brain, verdict, capture, source}`. | `control` = Runner present; `verdict`/`capture` = API key present; `brain` = brain configured & reachable. |
| `POST` | `/api/ingest` | Upload a CSV (**multipart/form-data**, field `csv`) and run ingest as a job. Returns `202 {job_id, stage:"ingest"}`. | See **Special transports**. `503` if no Runner; `400` on a bad form / missing field. |

## Brain profile (read-only distilled company-fit brief)

The locally-cached company-fit brief the verdict stage feeds the LLM. The brain
is **read-only** for scout — refresh only re-reads the brain and updates the
local cache; it never writes the brain.

| Method | Path | Purpose | Gating / Notes |
|---|---|---|---|
| `GET` | `/api/profile` | The cached brief + freshness metadata (configured/reachable, age, stale, active criteria version/source). | Read-only; always answers. |
| `POST` | `/api/profile/refresh` | Force a re-distill from the brain, update the cache, rebuild active criteria. | `404` "brain not configured" when the brain is unset; `502` when the brain is unreachable or has no criteria yet. |

## Outreach

The draft queue lives per-posting under `/api/postings/{id}/outreach` (above);
`/api/outreach/*` is the shared block + draft surface. The draft-start path needs
the outreach engine; block sync needs the brain.

| Method | Path | Purpose | Gating / Notes |
|---|---|---|---|
| `GET` | `/api/outreach/blocks` | Cached context-block statuses (no brain call) (`{blocks}`). | — |
| `POST` | `/api/outreach/sync` | Refresh the context blocks from the brain (`{blocks}`). | `412` "brain not configured"; `502` on a brain error. |
| `GET` | `/api/outreach/drafts/{id}` | One draft. | `404` unknown id. |
| `PUT` | `/api/outreach/drafts/{id}` | Save the user's edit (re-lints) (`{edited}`). | `409` if the draft isn't `awaiting_review`/`no_hook` (only those are editable). |
| `POST` | `/api/outreach/drafts/{id}/sent` | Mark the draft sent (bumps posting tracking). | `404` unknown id. |

### Editable outreach config (scout-local, no brain)

The email *format* and the five pipeline-stage *prompts* are scout-local DB rows,
edited from the dashboard. The engine re-reads them at draft time — no restart.

| Method | Path | Purpose | Gating / Notes |
|---|---|---|---|
| `GET`·`PUT` | `/api/outreach-template` | The email template (verbatim prose + `{{var}}` / `{{name: instructions}}` holes). `PUT {content}`. | — |
| `GET` | `/api/outreach-prompts` | List the editable pipeline stages (`{prompts:[{stage,title,description,enabled,skippable,is_overridden}]}`). | — |
| `GET`·`PUT` | `/api/outreach-prompts/{stage}` | One stage's system prompt + on/off. `PUT {content}` saves an override; `{enabled}` toggles the stage (the `fill`/Writer stage can't be disabled); `{reset:true}` reverts to the compiled default. Stages: `researcher`·`fill`·`humanizer`·`honesty`·`judge`. | `404` unknown stage. |

## Editor (taste / playbook — brain-isolated, local files only)

These read and write **only** the local instruction files; nothing here touches
the brain (enforced by construction — the editor handler imports no brain
client). Gated on the path being configured.

| Method | Path | Purpose | Gating / Notes |
|---|---|---|---|
| `GET`·`PUT` | `/api/taste` | Read / write `taste.md` (the offline criteria fallback) + report the folded criteria version. | `503` "taste path not configured" when `--taste-md` is unset. |
| `GET`·`PUT` | `/api/playbook` | Read / write `playbook.md` (scout's how-to-decide manual). | `503` "playbook path not configured" when `--playbook` is unset. |

---

## Special transports

Most routes are plain request/response JSON. Three are not:

- **`GET /`** serves HTML (`text/html`), not JSON — the built PWA shell
  (`web/dist/index.html`). It is the PWA shell the backend serves; unknown
  non-`/api/` paths fall back to it (SPA routing), while real assets under `/assets`,
  `/manifest.webmanifest`, `/sw.js`, and the icons are served from `web/dist/`.
- **`GET /api/jobs/{id}/stream`** is **Server-Sent Events** (`text/event-stream`,
  `Cache-Control: no-cache`, keep-alive). It replays the job's backlog, then
  streams `event: line` messages, and closes with `event: end` carrying the final
  status. A client reads it with `EventSource`, not `fetch().json()`.
- **`POST /api/ingest`** is **`multipart/form-data`** with a single file field
  named `csv` (32 MB in-memory cap). It is not a JSON body.

---

## Notes for the PWA re-home

This section tracks moving scout's UI onto the shared web platform (see the
platform plan in `brainbot/docs/app-platform.md`). The frontend re-home itself is
**done** — `GET /` now serves the toolkit-built PWA from `web/dist/` as static
files, and `GET /api/me` exists. What is still **target direction**
is putting scout behind the shared edge (HTTPS + SSO). Items below are marked
accordingly.

- **The backend renders no app HTML except `GET /`.** Everything a client needs
  is the JSON API above plus the SSE/multipart transports. The re-home pulled
  scout's frontend out of the single embedded `index.html` and rebuilt it as a
  toolkit-built PWA (`web/`, emitted to `web/dist/`, served as static files);
  the server keeps serving this `/api/*` surface **unchanged**. It was a frontend
  re-home, not a backend rewrite — which is exactly why this contract exists.
- **Identity comes from the edge, via `X-Auth-Request-Email`.** `GET /api/me`
  **exists**: it reads that header and returns `{"email":"…"}` when present, else
  `{}` (HTTP 200 either way), trusting only the header — never a client value. In
  the platform an oauth2-proxy at the Caddy edge authenticates the user (Google
  SSO + email whitelist) and injects the header on every request scout receives;
  putting scout behind that edge is the remaining *(target)* step. In local dev
  (no edge) `/api/me` returns `{}` and the PWA shows an anonymous/dev state.
- **The brain reads go through scout's proxy** *(target)*. Today the only brain
  exposure to the client is the distilled-brief view (`/api/profile`) and the
  outreach block sync — scout calls the brain server-side; the client never talks
  to the brain directly. The platform's toolkit `recall()`/`doc()`/`map()` client
  reaches the brain through a per-app **proxy** on the app's own backend (so the
  edge auth header rides along and the brain never publishes a public port). For
  scout that means a future `/api/brain/*` proxy — it **does not exist yet**;
  there is currently no `/api/brain/*` route. Until then the brain stays
  server-side behind `/api/profile` and `/api/outreach/sync`.
- **Data stays local.** Scout's working set (companies, enrichment, verdicts,
  runs, drafts) lives in local SQLite and stays there through the re-home — the
  brain is read-only and is not a data store for scout.
