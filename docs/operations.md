# Operations

How to actually run scout. Flags, env, and what to do when something goes
sideways. For *what scout is* and the brain/scout split, see
[`north-star.md`](./north-star.md) — this doc is purely operational.

## Prerequisites

- Python 3.12+.
- `ANTHROPIC_API_KEY` for scoring (the `verdict` stage, including UI-triggered
  runs).
- The brain on `http://127.0.0.1:8100` if you want live criteria (read-only).
  **Optional** — scout caches the last profile it fetched and falls back to
  `taste.md` when the brain is unreachable and the cache is gone.

## First-run

```bash
cd ~/Repositories/scout
pip install -e .
```

The migrations ship inside the `scout` package; the first `scout <anything>`
call creates `scout.db` and runs them (currently through `0013`).

## Building the web UI

The UI is a Vite + vanilla-TS PWA in `web/` (consuming the shared
`@brainbot/web-toolkit`). Its build emits to `web/dist/`, which the FastAPI
server serves as static files at `GET /`. `web/dist/` is committed, so a fresh
checkout runs with just `pip install -e .` (no Node needed to *run* scout).

After any UI change, rebuild the dist:

```bash
cd web
npm install        # first time only — resolves the toolkit file: dep
npm run build      # gen-pwa (manifest + sw.js) then vite build → dist/
cd ..
```

For live UI work, `cd web && npm run dev` serves with HMR and proxies `/api/*`
to a running `scout serve` (default `:8765`).

## Deployment — behind the shared edge

For local use, `scout serve` on `localhost` is enough (above). For the deployed
estate, scout ships as a **Python app serving the prebuilt PWA as static
files** — no Node at image-build time — in a compose service on the brain's
`brainnet`, fronted by the **shared Caddy + oauth2-proxy edge** at `scout.{domain}`:

```
scout.{domain} → Caddy (HTTPS) → forward_auth → oauth2-proxy (Google SSO +
                 email whitelist) → scout:8765 (/api + static PWA)
```

- **No auth code in scout.** The edge authenticates; scout trusts the injected
  `X-Auth-Request-Email` and surfaces it as `/api/me`. One Google sign-in covers
  the brain PWA and scout (shared cookie domain). Revoke access by removing the
  email from `brainbot/compose/oauth2-proxy-emails.txt`.
- **No public port.** Only Caddy reaches scout over the docker network.
- **Data stays local.** scout's working set lives in SQLite on the `scout-data`
  volume — never the brain/Postgres. The brain is read-only at
  `http://brain:8100`.
- **Files:** `Dockerfile` (this repo) builds the image; the `scout` service +
  `scout-data` volume and the `scout.{domain}` Caddy vhost live in
  `brainbot/compose/` (`docker-compose.yml`, `Caddyfile`).

The canonical deploy doc is `brainbot/docs/app-platform.md` (the "Deployment"
section + the copy-paste appendix). This note is just the scout-side pointer.

## The normal way in: the browser

`scout serve` is the primary interface. Everything below the CSV — ingest,
enrich, verdict — runs from there as background jobs with live progress, plus
triage and the Criteria panel (view/refresh the brain profile, or edit the
`taste.md` fallback) with the always-editable playbook.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
scout serve
# scout triage UI at http://localhost:8765
```

Then in the browser: upload a CSV, run the stages, triage the results. The
brain defaults to `http://127.0.0.1:8100`; pass `--brainbot ""` to disable it
(criteria fall back to `taste.md`).

## Gmail integration (send + read-sync)

scout can send outreach from your Gmail and auto-sync replies + application status
back onto the jobs board (a 2.5-min poll). It's scout-local: the Python backend
owns the OAuth + Gmail calls; the brain isn't involved.

scout is **self-hosted, single-user** — you connect *your own* mailbox on *your
own* OAuth client, so Google's CASA/verification process never applies (that only
exists for hosting strangers). The setup is a one-time bring-your-own-client flow;
**Settings → Integrations → Gmail shows the exact callback URL + scopes to register**,
so you can copy them verbatim (the cure for `redirect_uri_mismatch`).

**One-time Google Cloud setup:**

1. **Enable the Gmail API** — `gcloud services enable gmail.googleapis.com`, or
   Console → APIs & Services → Library → Gmail API → Enable.
2. **OAuth consent screen** → add scopes `gmail.send`, `gmail.readonly`, `openid`,
   `email`, then **Publish app**. Publishing an *unverified* app is fine for your
   own mailbox — you'll click through a one-time "Google hasn't verified this app"
   screen — and it's what makes the refresh token **non-expiring** (in *Testing*
   mode it expires every 7 days and silently kills the poller). The quick
   alternative is leaving it in Testing and adding yourself under **Test users**
   (skipping this is the cause of `Error 403: access_denied`).
3. **Credentials → Create OAuth client ID → Web application** → under **Authorized
   redirect URIs**, paste the exact URL scout shows in Settings → Gmail
   (e.g. `https://<scout-domain>/api/gmail/callback`). It must match character for
   character — not "Authorized JavaScript origins".

**Give scout the client** — either paste the **Client ID + secret** into
Settings → Integrations → Gmail (stored in scout's DB), or set them in the env /
`.env` (DB wins over env):

```bash
export GMAIL_CLIENT_ID=...apps.googleusercontent.com
export GMAIL_CLIENT_SECRET=...
# optional: pin the redirect (otherwise derived from the request's forwarded host)
# export GMAIL_REDIRECT_URI=https://<scout-domain>/api/gmail/callback
```

**Connect** — Settings → Integrations → **Gmail → Connect** runs the consent flow;
or `scout gmail auth` runs a localhost loopback flow. Then sends go from the **Send
via Gmail** button on a draft, and the poller (started by `scout serve`,
`--gmail-sync-interval`) keeps the board current. `scout gmail sync` runs one pass
by hand; **Sync now** is in the Inbox panel. Application-status auto-update is a
Settings toggle (default off — scout suggests in the Inbox for one-click apply).
Send rides the light `gmail.send` (*sensitive*) scope; read-sync rides
`gmail.readonly` (*restricted*) — if Google ever stops allowing unverified
restricted self-access, the inbound board goes dark but **send keeps working**.

## A CLI pipeline run

The same stages, headless — for automation or debugging.

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# 1. Drop the CSV into the DB.
scout ingest data/crunchbase-export.csv
# read=423 upserted=423 skipped=0 errors=0

# 2. Sanity-check the mechanical pre-filter.
scout filter
# ... survivor table ...
# total=423 survivors=87
# dropped by:
#   funding_stage         12
#   headcount_max          4
#   location              198
#   vertical_excluded     122

# 3. Fetch about-pages.
scout enrich
# considered=87 fetched=87 ok=71 failed=16

# 4. Score with Haiku. Criteria come from the brain (@127.0.0.1:8100) when
#    healthy (cached locally), else taste.md.
scout verdict
# taste source=brain:profile@http://127.0.0.1:8100 version=b4cd783174d6
# considered=71 scored=71 skipped=0 failed=0
#   maybe 18
#   no    35
#   yes   18

# 5. Triage in the browser.
scout serve
# scout triage UI at http://localhost:8765
```

Re-running any stage is safe. Each stage skips work it's already done.

## How scoring resolves criteria

Resolution follows the **change-propagation cost cascade** — each tier only pays
for the next when something genuinely changed — not a dumb TTL. The cascade is
canonical in
[`brainbot/docs/change-propagation.md`](../../brainbot/docs/change-propagation.md);
the `/changes` contract scout consumes is in
[`brainbot/docs/consumer-api.md`](../../brainbot/docs/consumer-api.md).

```
scout verdict (criteria resolved once per run)
   │
   ├─ cached brief WITH a stored cursor? → the cascade:
   │     ├─ Tier 0  GET /changes since the cursor — one cheap call, no LLM
   │     │            └─ nothing moved → serve the cached brief VERBATIM, stamp verified_at
   │     ├─ Tier 1  brain moved → re-run recall, compare the distill basis
   │     │            └─ basis unchanged (coarse cursor / irrelevant edit) → serve VERBATIM
   │     └─ Tier 2  basis actually changed → re-synthesize, store brief+basis+cursor,
   │                  bump the version (only a real change re-scores)
   │
   ├─ cold (no cache, or a pre-0037 row with no cursor) → full distill,
   │     stored WITH the current cursor so the next run goes warm
   │
   ├─ brain unreachable → serve the cached brief while it is within the TTL
   │     ceiling (--brain-cache-ttl); past it (or no cache) → taste.md  (logged)
   │
   └─ score with Haiku + playbook → write {verdict, reason} to SQLite
```

Steady state is **one cheap `/changes` call per run, zero LLM spend and zero brief
wobble until the brain changes in a way that touches the criteria**. The brain is
touched only for distilling the user's criteria (`recall` + one synthesis call),
cached locally; `recall(query)` and `/changes` are the only brain calls, there is
no per-company brain query, and scout never passes a `scope`. The TTL is no longer
the re-distill trigger — it survives only as the ceiling above for serving an
unverifiable cached brief, and as an input to the Criteria panel's
**current / unverified / changed** badge (which replaced the old age-based
"stale" pill).

Verdicts are written to scout's SQLite and nowhere else — the brain is
read-only for scout. The **criteria version** (`taste_version` in the schema) is
`sha256[:12]` of the playbook + criteria text. When the brain learns something,
the criteria change, the version changes, and the next run re-scores. That's
intended.

## Flag reference

### Global

Every subcommand accepts `--db <path>`, default `scout.db`.

### `scout ingest <csv>`

| Flag | Default | What |
|---|---|---|
| `--source` | `crunchbase` | Source tag stored on each row. Distinguishes CSV vintages. |

### `scout filter`

| Flag | Default | What |
|---|---|---|
| `--db` | `scout.db` | SQLite path. |

The pre-filter rules come from the `taste_filter` DB singleton (edited in the
dashboard, Criteria → "pre-filter"), falling back to the compiled-in default —
there is no longer a `--taste` file flag.

### `scout enrich`

| Flag | Default | What |
|---|---|---|
| `--workers` | `8` | Parallel fetchers. |
| `--timeout` | `12s` | Per-request timeout. |
| `--force` | `false` | Re-fetch every company even if cached. |

### `scout verdict`

| Flag | Default | What |
|---|---|---|
| `--taste-md` | `taste.md` | Offline criteria fallback, used only when the brain is unreachable or empty. |
| `--playbook` | `playbook.md` | Scout's how-to-decide manual. Folded into the criteria version, so editing it re-scores. Optional. |
| `--brainbot` | `http://127.0.0.1:8100` | Brain base URL (HTTP). Read-only source of the user's criteria (`recall`, distilled into a brief). **Empty disables** → `taste.md` fallback. |
| `--brain-cache-ttl` | `6h` | Ceiling for serving a cached brief while the brain is unreachable (NOT a re-distill trigger — re-distilling is driven by the `/changes` cascade). Also feeds the Criteria panel's current/unverified state. |
| `--model` | `claude-haiku-4-5` | Anthropic model for per-company scoring. |
| `--distill-model` | `claude-sonnet-4-6` | Anthropic model for the once-per-run distiller (classify + synthesize). |
| `--workers` | `4` | Parallel API calls. |
| `--force` | `false` | Re-score every survivor even if the criteria version matches. |

### `scout serve`

| Flag | Default | What |
|---|---|---|
| `--addr` | `:8765` | Listen address. |
| `--taste-md` | `taste.md` | Offline criteria fallback; editable in the UI (writes the **local file only**, never the brain). |
| `--playbook` | `playbook.md` | Scout's how-to-decide manual; editable in the UI (local file only). |
| `--source` | `crunchbase` | Source tag for UI CSV uploads. |
| `--brainbot` | `http://127.0.0.1:8100` | Brain base URL (read-only). Primary criteria source (`recall` → distilled brief), viewable/refreshable in the UI's Criteria panel. Empty disables → `taste.md` fallback. |
| `--brain-cache-ttl` | `6h` | How long a cached brief stays fresh before a re-distill (shared resolver). |
| `--distill-model` | `claude-sonnet-4-6` | Anthropic model for the once-per-run distiller (classify + synthesize). |

### `scout stats`

Row counts and the verdict histogram. Takes only `--db`.

## Environment

| Var | Used by | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | `verdict` (CLI and UI runs) | Yes for scoring. |

Nothing else. scout reads variables from the shell environment **or** a `.env`
file in the working directory (auto-loaded at startup; a real environment
variable wins over the file). `.env` is gitignored — the recommended place for
the key:

```bash
# .env  (project root, gitignored)
ANTHROPIC_API_KEY=sk-ant-...
```

## Troubleshooting

**Ingest reports `skipped=N` but you didn't expect it**
Rows with no `name` column value are skipped. The Crunchbase column
aliases live in `scout/ingest/csv.py`. If your CSV uses an exotic
header, either rename it or add an alias.

**Filter says `total=0 survivors=0` but the CSV ingested fine**
Sanity-check the pre-filter rules (dashboard → Criteria → "pre-filter"). Common gotchas:
- `verticals.allowed` is non-empty AND your CSV uses different vertical names → nothing matches.
- `verticals.excluded` substring is too broad — e.g. `"law"` also matches "Law Enforcement" (substring, case-insensitive).
- `location.allowed` doesn't include "remote" but `remote_ok = false` → everyone with a remote location is dropped.

**Enrichment shows `failed=N` but no useful detail**
Each failure carries a `fetch_status`: `low_content`, `challenge`, `no_domain`,
`http_<code>`, `dns`, `refused`, `timeout`, or `error`. Inspect them:
```bash
sqlite3 scout.db "SELECT company_id, fetch_status, fetch_error FROM enrichment WHERE fetch_status != 'ok'"
```

**`brain unreachable at http://127.0.0.1:8100 ... falling back`**
Expected when the brain is down — the resolver serves a *stale* cached profile
if it has one, else `taste.md`, and scoring proceeds. If you want fresh criteria,
start the brain (or `POST /api/profile/refresh` from the UI); if you don't want
the brain at all, pass `--brainbot ""` to silence the probe. A *healthy but
empty* brain logs `no criteria captured yet` and also falls back to `taste.md`
until the user captures something.

**Verdict says `considered=0`**
Either no survivors (check `scout filter`), or no `ok` enrichment for the
survivors (check `scout enrich`), or everything is already scored at the
current criteria version — which means scout is doing its job. Use `--force`
to re-score anyway.

**`anthropic HTTP 401`**
Your `ANTHROPIC_API_KEY` is wrong or expired.

**`anthropic HTTP 429`**
Rate limited. Lower `--workers`, wait, retry. Failed rows are picked up on
the next run.

**`parse: no valid verdict JSON`**
Model returned something other than the requested JSON. Should be rare —
if it gets frequent, tighten the system prompt in
`scout/verdict/verdict.py::build_system_prompt`.

**Triage UI shows no rows after `verdict`**
The UI shows every company, not just scored ones. If you see nothing,
something is up with `scout.db`. Confirm `scout stats`.

**Triage UI shows `unscored` for everyone**
You haven't run `scout verdict` yet, or it failed silently. Run again
with `--workers 1` and watch stderr.

## Inspecting the DB by hand

`scout.db` is plain SQLite. Use whatever:

```bash
sqlite3 scout.db
> .schema
> SELECT name, verdict, reason FROM companies c JOIN verdicts v ON v.company_id = c.id;
> SELECT fetch_status, COUNT(*) FROM enrichment GROUP BY fetch_status;
> SELECT taste_version, COUNT(*) FROM verdicts GROUP BY taste_version;   -- criteria version
> SELECT * FROM runs ORDER BY started_at DESC LIMIT 10;                  -- run history
```

## Tearing down

```bash
rm scout.db scout.db-wal scout.db-shm   # nukes the working set
```

The brain is untouched (scout only ever reads it).

## Running it on a schedule

There's no daemon. If you want a daily cron:

```cron
# Re-score whatever's new, every morning at 9am.
0 9 * * *  cd ~/Repositories/scout && scout enrich && scout verdict
```

But really — scout is a "run when you have a new CSV" tool. Cron is overkill.
