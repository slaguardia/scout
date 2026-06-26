# scout

A personal **job-fit scorer**. Ingests company dumps (Crunchbase CSV), enriches
each from its website, and asks: *given everything the brain knows about the
user, is this company worth their time?* It reasons with its own LLM and writes
the verdict to its local store. Triage happens in a small local web UI, where
the user browses, sorts, and filters the scored candidates.

Companion to [brainbot](https://github.com/slaguardia/brainbot): **brainbot holds
the knowledge** (who the user is, what they want); **scout brings the intelligence**
(its LLM + a small playbook for *how* to judge). Scout is brainbot's canonical
example consumer.

→ **Architecture and how it all fits together: [`docs/north-star.md`](./docs/north-star.md).**

## Status

Pipeline + web control surface are built (ingest → filter → enrich → verdict →
triage, all drivable from the browser). The brain is wired as the primary
source of the user's criteria over plain HTTP/JSON (`profile`/`recall`, read
only), with `taste.md` as the offline fallback when the brain is unreachable.

## Quickstart

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"        # installs the `scout` command + pytest

# Put the key in a gitignored .env (auto-loaded), or export it in your shell.
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# The brain runs at http://127.0.0.1:8100 by default (and is on by default).
# If it's down, scout logs once and falls back to taste.md.
scout serve            # the primary interface — drive everything from the browser
                       #   upload a CSV, enrich, verdict, triage at localhost:8765
```

The CLI stages (`ingest`, `filter`, `enrich`, `verdict`, …) still exist as a
secondary automation/debug surface, but the web UI is the way in. Run the tests
with `pytest`. See [`PORTING.md`](./PORTING.md) for the conventions and the
Go→Python mapping (this backend was ported from Go).

## Layout

```
scout/            the Python package (the backend)
  store/          SQLite layer — connection + migrations + one module per table
  anthropic/      Anthropic Messages API client (httpx, no SDK)
  brainbot/       read-only brain client (recall / doc / map)
  ingest/ capture/ enrich/ verdict/ distill/   the scoring pipeline
  outreach/ chat/ criteria/ filter/ jobs/ taste/ playbook/   the rest
  web/            FastAPI app (app.py + routes/, serves the PWA + /api)
  cli.py          the `scout` command (serve, ingest, verdict, outreach, …)
tests/            pytest, ported from the Go *_test.go suite
web/              Vite/TypeScript PWA (source) → builds to web/dist/
```

## Stack

- **Python · FastAPI** — the API + control surface, on uvicorn
- **SQLite** — working set, via the stdlib `sqlite3` driver (no ORM)
- **httpx** — the Anthropic Messages API + brain calls (direct HTTP, no SDK)
- **the brain** — `recall`/`doc`/`map` over HTTP (read-only) for the user's criteria
- **Vite/TS PWA** — triage + control surface, served as static files by the API
