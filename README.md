# scout

A personal **job-fit scorer**. Ingests company dumps (Crunchbase CSV), enriches
each from its website, and asks: *given everything it knows about the user, is
this company worth their time?* It reasons with its own LLM and writes
the verdict to its local store. Triage happens in a small local web UI, where
the user browses, sorts, and filters the scored candidates.

Companion to [brainbot](https://github.com/slaguardia/brainbot): **scout owns a
local knowledge store** (who the user is, what they want — typed in the
dashboard) that **brainbot optionally fills**; **scout brings the intelligence**
(its LLM + a small playbook for *how* to judge). Scout is brainbot's canonical
example consumer.

→ **Architecture and how it all fits together: [`docs/north-star.md`](./docs/north-star.md).**

## Status

Pipeline + web control surface are built (ingest → filter → enrich → verdict →
triage, all drivable from the browser). Scout runs on a local knowledge store —
company-fit criteria, experience, voice, logistics — typed in the dashboard
under Settings → Knowledge; scoring, outreach drafting and application answers
all work with no brain at all. The brain is an optional source that fills that
store over plain HTTP/JSON (`recall`/`doc`/`map`, read only); a typed doc always
wins over what it synced.

## Quickstart

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"        # installs the `scout` command + pytest

# Put the key in a gitignored .env (auto-loaded), or export it in your shell.
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# The brain is optional (http://127.0.0.1:8100 by default; `--brainbot ""` disables it).
# Scout runs on what you typed under Settings → Knowledge; the brain only fills that in.
scout serve            # the primary interface — drive everything from the browser
                       #   upload a CSV, enrich, verdict, triage at localhost:8765
```

The CLI stages (`ingest`, `filter`, `enrich`, `verdict`, …) still exist as a
secondary automation/debug surface, but the web UI is the way in. Run the tests
with `pytest`.

## Layout

```
scout/            the Python package (the backend)
  store/          SQLite layer — connection + migrations + one module per table
  anthropic/      Anthropic Messages API client (httpx, no SDK)
  brainbot/       read-only brain client (recall / doc / map)
  ingest/ capture/ enrich/ verdict/ distill/   the scoring pipeline
  outreach/ chat/ criteria/ filter/ jobs/ playbook/   the rest
  web/            FastAPI app (app.py + routes/, serves the PWA + /api)
  cli.py          the `scout` command (serve, ingest, verdict, outreach, …)
tests/            pytest suite covering the store, pipeline, and web layers
web/              Vite/TypeScript PWA (source) → builds to web/dist/
```

## Stack

- **Python · FastAPI** — the API + control surface, on uvicorn
- **SQLite** — working set, via the stdlib `sqlite3` driver (no ORM)
- **httpx** — the Anthropic Messages API + brain calls (direct HTTP, no SDK)
- **the brain** (optional) — `recall`/`doc`/`map` over HTTP (read-only), filling the local knowledge store
- **Vite/TS PWA** — triage + control surface, served as static files by the API
