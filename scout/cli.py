"""scout — personal job-research pipeline (Python CLI).

Port of cmd/scout/main.go. Argparse-driven; each subcommand mirrors the Go
flagset (same names/defaults/semantics) and drives the already-ported packages.

  scout ingest <csv>        Load a CSV dump into the local DB.
  scout filter              Apply the pre-filter rules (from the DB); print survivors.
  scout enrich              Fetch about-pages for survivors.
  scout verdict             Score enriched survivors.
  scout distill             Print the company-fit brief (recall + synthesis); debug.
  scout outreach …          Outreach knowledge sources + drafting.
  scout questions …         Detect application-form essay questions.
  scout serve               Web control surface + triage UI (primary interface).
  scout stats               Show DB row counts.
  scout backup / restore    Snapshot / restore the DB.

The web UI (`scout serve`) is the primary interface; the CLI is the secondary
automation/debug surface.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import threading
from datetime import datetime
from urllib.parse import urlparse

from scout import (
    anthropic,
    brainbot,
    criteria,
    distill,
    enrich,
    ingest,
    outreach,
    playbook,
    taste,
    verdict,
)
from scout import filter as filter_pkg
from scout.store import db as store_db
from scout.web.config import (
    DEFAULT_BRAIN_CACHE_TTL,
    DEFAULT_BRAIN_URL,
    DEFAULT_DISTILL_MODEL,
    DEFAULT_OUTREACH_MODEL,
    Config,
)

# defaultReconcileInterval (Go: 2m) — how often `scout serve` reconciles the
# cached brief against the brain in the background. The others come from the web
# Config (one source of truth shared with the serve path).
DEFAULT_RECONCILE_INTERVAL = 2 * 60.0  # seconds
# Gmail read-sync poll cadence (the plan's 2.5 minutes).
DEFAULT_GMAIL_SYNC_INTERVAL = 150.0  # seconds


# --- dotenv (port of cmd/scout/dotenv.go) ------------------------------------


def load_dotenv(path: str = ".env") -> None:
    """Read KEY=value lines from a .env file in the working directory and set any
    not already present in the environment — a real env var always wins. Missing
    file → no-op. Supports blank lines, `#` comments, an optional `export ` prefix,
    and matching single/double quotes around the value. No interpolation."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return  # no .env (or unreadable) — fall back to the real env
    for raw in lines:
        line = raw.strip()
        if line == "" or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, sep, val = line.partition("=")
        if sep == "":
            continue
        key = key.strip()
        if key == "":
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] in ("'", '"') and val[-1] == val[0]:
            val = val[1:-1]
        if key not in os.environ:
            os.environ[key] = val


# --- small helpers -----------------------------------------------------------


def _stderr(line: str) -> None:
    print(line, file=sys.stderr)


def split_ids(s: str) -> list[str]:
    """Parse a comma-separated --company value into trimmed, non-empty IDs."""
    return [p.strip() for p in s.split(",") if p.strip()]


_DUR_RE = re.compile(r"(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)")
_UNIT_SECONDS = {"ns": 1e-9, "us": 1e-6, "µs": 1e-6, "ms": 1e-3, "s": 1.0, "m": 60.0, "h": 3600.0}


def parse_duration(s: str) -> float:
    """Parse a Go-style duration string ("12s", "6h", "2m", "1h30m", "500ms")
    into seconds. Mirrors flag.Duration so the flag values round-trip."""
    s = s.strip()
    if s in ("", "0"):
        return 0.0
    matches = _DUR_RE.findall(s)
    if not matches or "".join(n + u for n, u in matches) != s:
        raise argparse.ArgumentTypeError(f"invalid duration: {s!r}")
    return sum(float(n) * _UNIT_SECONDS[u] for n, u in matches)


def parse_addr(addr: str) -> tuple[str, int]:
    """Split a Go listen address (":8765", "127.0.0.1:8807", "localhost:5173")
    into (host, port) for uvicorn. An empty host (":8765") binds all interfaces
    (0.0.0.0), matching Go's net/http default."""
    if ":" not in addr:
        raise ValueError(f"invalid --addr {addr!r} (want host:port, e.g. :8765)")
    host, _, port = addr.rpartition(":")
    if host == "":
        host = "0.0.0.0"
    try:
        return host, int(port)
    except ValueError:
        raise ValueError(f"invalid --addr {addr!r} (port not an int)")


def url_host(raw: str) -> str:
    """The lowercased, www-stripped host of a posting URL; "(unknown)" when it
    can't be parsed."""
    try:
        u = urlparse(raw)
        if u.hostname:
            return u.hostname.lower().removeprefix("www.")
    except ValueError:
        pass
    return "(unknown)"


def _tabwrite(rows: list[list[str]]) -> None:
    """Print rows as a left-aligned table with 2-space column padding — the
    analogue of Go's text/tabwriter used by `scout filter`."""
    if not rows:
        return
    cols = len(rows[0])
    widths = [max(len(r[c]) for r in rows) for c in range(cols)]
    for r in rows:
        parts = []
        for c in range(cols):
            cell = r[c]
            # No trailing padding on the last column.
            parts.append(cell if c == cols - 1 else cell.ljust(widths[c] + 2))
        print("".join(parts))


# --- ingest ------------------------------------------------------------------


def cmd_ingest(args) -> None:
    con = store_db.open_db(args.db)
    try:
        res = ingest.CSV(source=args.source, con=con).run(args.csv)
    finally:
        con.close()
    print(
        f"read={res.read} upserted={res.upserted} "
        f"({res.upserted - res.merged} new, {res.merged} merged, {res.collisions} name-collisions) "
        f"skipped={res.skipped} errors={len(res.errors)}"
    )
    for col in res.collision_details:
        where = col.domain or "no domain"
        _stderr(f'  collision on {where}: "{col.incoming_name}" overwrote "{col.overwrote_name}"')
    for e in res.errors:
        _stderr(f"  err: {e}")


# --- filter ------------------------------------------------------------------


def cmd_filter(args) -> None:
    con = store_db.open_db(args.db)
    try:
        t = filter_pkg.taste_from_db(con)
        res = t.apply(con)
    finally:
        con.close()

    rows = [["id", "name", "location", "vertical", "headcount", "stage"]]
    for s in res.survivors:
        rows.append([s.id, s.name, s.location, s.vertical, str(s.headcount), s.stage])
    _tabwrite(rows)

    print(f"\ntotal={res.total} survivors={len(res.survivors)}")
    if res.dropped_by:
        print("dropped by:")
        for k in sorted(res.dropped_by):
            print(f"  {k:<22} {res.dropped_by[k]}")


# --- enrich ------------------------------------------------------------------


def cmd_enrich(args) -> None:
    con = store_db.open_db(args.db)
    try:
        e = enrich.Enricher(
            con=con,
            workers=args.workers,
            timeout=args.timeout,
            only_blanks=args.only_blanks,
            company_ids=split_ids(args.company),
        )
        # Fact extraction is best-effort: with a key, blank company columns are
        # filled from the fetched page; without one, enrichment is fetch-only.
        ac = anthropic.new("")
        if ac.has_key():
            e.llm = ac
        res = e.run(args.force)
    finally:
        con.close()
    print(
        f"considered={res.considered} fetched={res.fetched} ok={res.ok} "
        f"failed={res.failed} filled={res.filled}"
    )


# --- verdict -----------------------------------------------------------------


def cmd_verdict(args) -> None:
    con = store_db.open_db(args.db)
    try:
        ft = filter_pkg.taste_from_db(con)

        # Resolve criteria via the shared resolver: a TTL-cached distilled brief
        # (primary), with taste.md as the offline fallback. One Anthropic client
        # serves both the distiller and the verdict scorer.
        ac = anthropic.new("")
        resolver = criteria.Resolver(
            store=con,
            taste_md_path=args.taste_md,
            ttl=args.brain_cache_ttl,
            log=_stderr,
        )
        if args.brainbot != "":
            bc = brainbot.new(args.brainbot)
            resolver.brain = bc
            resolver.distiller = distill.Distiller(
                brain=bc, client=ac, model=args.distill_model, log=_stderr
            )
        tb = resolver.resolve()

        # Fold the playbook (how-to-decide) into the version, matching `scout
        # verdict`'s Go behavior: a playbook edit re-scores everything.
        pb = playbook.content_or_default(con)
        if pb != "":
            tb.version = taste.hash(pb + "\n---taste---\n" + tb.version)
            tb.source = tb.source + " + playbook"

        print(f"taste source={tb.source} version={tb.version}")

        s = verdict.Scorer(
            con=con,
            taste=tb,
            filter=ft,
            client=ac,
            model=args.model,
            playbook=pb,
            force=args.force,
            only_blanks=args.only_blanks,
            company_ids=split_ids(args.company),
            workers=args.workers,
        )
        res = s.run()
    finally:
        con.close()

    print(f"considered={res.considered} scored={res.scored} skipped={res.skipped} failed={res.failed}")
    for k in sorted(res.by_verdict):
        print(f"  {k:<5} {res.by_verdict[k]}")
    if res.cache_creation_tokens > 0 or res.cache_read_tokens > 0:
        print(f"cache: created={res.cache_creation_tokens} tokens, read={res.cache_read_tokens} tokens")


# --- distill (debug) ---------------------------------------------------------


def cmd_distill(args) -> None:
    if args.brainbot == "":
        raise RuntimeError("distill: --brainbot is required (nothing to distill without a brain)")
    d = distill.Distiller(
        brain=brainbot.new(args.brainbot),
        client=anthropic.new(""),
        model=args.model,
        k=args.k,
        log=_stderr,
    )
    res = d.run()
    print(f"\n=== chunks ({len(res.chunks)}) ===")
    for c in res.chunks:
        print(f"\n--- {distill.chunk_label(c)} (score {c.score:.4f}) ---\n{c.text}")
    print(f"\n=== classified items ===\n{res.items}")
    print(f"\n=== brief ===\n{res.brief}")


# --- outreach ----------------------------------------------------------------


def cmd_outreach_sources(args) -> None:
    con = store_db.open_db(args.db)
    try:
        bc = brainbot.new(args.brainbot)
        ac = anthropic.new("")
        if args.refresh:
            try:
                outreach.discover(bc, ac, con, "")
            except outreach.ErrNoExperience as e:
                _stderr(f"warning: {e}")
            # Any other discovery error propagates (Go returns it).
        else:
            try:
                outreach.ensure_knowledge(bc, ac, con, "", _stderr)
            except Exception as e:  # noqa: BLE001 - best-effort, like Go's warning
                _stderr(f"warning: {e}")

        from scout.store.outreach_sources import list_outreach_sources

        srcs = list_outreach_sources(con)
    finally:
        con.close()
    if not srcs:
        print("(no sources — add an experience page to your brain; it syncs automatically)")
        return
    for s in srcs:
        print(f"{s.need:<12} {s.title:<40} {s.page_id}")


def cmd_outreach_draft(args) -> None:
    if args.posting.strip() == "":
        raise RuntimeError("outreach draft: --posting <id> is required")
    from scout.store.outreach_drafts import (
        create_outreach_draft,
        get_outreach_draft,
        reap_stuck_outreach_drafts,
    )
    from scout.store.outreach_sources import outreach_knowledge

    con = store_db.open_db(args.db)
    try:
        bc = brainbot.new(args.brainbot)
        ac = anthropic.new("")
        # Auto-sync knowledge from the brain (change-aware) before the gate.
        try:
            outreach.ensure_knowledge(bc, ac, con, "", _stderr)
        except Exception as e:  # noqa: BLE001
            _stderr(f"warning: {e}")

        # Gate on the experience bundle (the honesty ground truth). Voice is soft.
        if outreach_knowledge(con, "experience").strip() == "":
            raise RuntimeError(
                "outreach draft: no experience page found in your brain — "
                "add one; scout syncs it automatically"
            )
        if outreach_knowledge(con, "voice").strip() == "":
            _stderr("warning: no voice knowledge — drafting a less-voiced email")

        n = reap_stuck_outreach_drafts(con, 30)
        if n > 0:
            _stderr(f"reaped {n} stuck draft(s)")

        d = create_outreach_draft(con, args.posting)
        eng = outreach.Engine(con=con, client=ac, model=args.model, brainbot=bc, log=_stderr)
        eng.run(d.id, False)

        out = get_outreach_draft(con, d.id)
    finally:
        con.close()
    if out is None:
        raise RuntimeError(f"outreach draft: read back draft {d.id}")
    print(f"status: {out.status}")
    if out.fail_reason != "":
        print(f"fail_reason: {out.fail_reason}")
    if out.violations not in ("", "null"):
        print(f"violations: {out.violations}")
    if out.critique != "":
        print(f"critique: {out.critique}")
    if out.lint not in ("", "[]"):
        print(f"lint: {out.lint}")
    print("---")
    print(out.draft)


# --- questions ---------------------------------------------------------------


def cmd_questions_detect(args) -> None:
    from scout import capture
    from scout.store.postings import get_posting, list_job_rows

    if (args.posting == "") == (not args.all):
        raise RuntimeError("questions detect: pass exactly one of --posting <id> or --all")

    con = store_db.open_db(args.db)
    try:
        c = capture.Capturer(db=con, client=anthropic.new(""))

        targets: list[tuple[str, str]] = []
        if args.posting != "":
            p = get_posting(con, args.posting)
            if p is None:
                raise RuntimeError(f"questions detect: posting {args.posting} not found")
            targets.append((p.id, p.url))
        else:
            for r in list_job_rows(con):
                targets.append((r.posting_id, r.url))

        by_host: dict[str, dict[str, int]] = {}
        for pid, url in targets:
            try:
                scan = c.detect_and_store_questions(pid, url)
            except Exception as e:  # noqa: BLE001
                _stderr(f"  {pid}: store: {e}")
                continue
            ti = by_host.setdefault(
                url_host(url), {"ok": 0, "none": 0, "unsupported": 0, "unreachable": 0, "questions": 0}
            )
            if scan.status == capture.QUESTIONS_OK:
                ti["ok"] += 1
                ti["questions"] += len(scan.questions)
            elif scan.status == capture.QUESTIONS_NONE:
                ti["none"] += 1
            elif scan.status == capture.QUESTIONS_UNSUPPORTED:
                ti["unsupported"] += 1
            else:
                ti["unreachable"] += 1
            if args.posting != "":
                print(f"{pid}  {scan.status}  ({len(scan.questions)} questions, source {scan.source})")
                for q in scan.questions:
                    print(f"  - {q.prompt}")
    finally:
        con.close()

    if args.all:
        print(f"{'host':<34} {'ok':>4} {'none':>5} {'unsup':>6} {'err':>5} {'#q':>6}")
        for h in sorted(by_host):
            t = by_host[h]
            print(
                f"{h:<34} {t['ok']:>4} {t['none']:>5} {t['unsupported']:>6} "
                f"{t['unreachable']:>5} {t['questions']:>6}"
            )


# --- serve -------------------------------------------------------------------


def cmd_serve(args) -> None:
    import uvicorn

    from scout import chat as chat_pkg
    from scout import jobs
    from scout.store.db import connect
    from scout.store.outreach_drafts import reap_stuck_outreach_drafts
    from scout.store.posting_answers import reap_stuck_answers
    from scout.store.runs import finish_run, insert_run

    host, port = parse_addr(args.addr)

    # Build the web Config from the serve flags and stand up the app exactly as
    # the Go cmdServe builds the web.Server (migrations, clients, resolver, taste).
    config = Config(
        db_path=args.db,
        taste_md_path=args.taste_md,
        ingest_source=args.source,
        distill_model=args.distill_model,
        outreach_model=args.outreach_model,
        brain_url=args.brainbot,
        brain_cache_ttl=args.brain_cache_ttl,
    )
    from scout.web import create_app

    app = create_app(config)
    state = app.state.scout
    db_path = config.db_path
    bc = state.brainbot

    # The control surface: a one-at-a-time job runner, persisted to the runs table.
    runner = jobs.Runner()

    def on_start(job_id: str, stage: str) -> None:
        tv = state.current_taste_version() if stage == "verdict" else ""
        c = connect(db_path)
        try:
            insert_run(c, job_id, stage, tv)
        except Exception as e:  # noqa: BLE001
            _stderr(f"run insert: {e}")
        finally:
            c.close()

    def on_finish(job_id: str, status: str, summary, err_msg: str) -> None:
        c = connect(db_path)
        try:
            finish_run(c, job_id, status, summary, err_msg)
        except Exception as e:  # noqa: BLE001
            _stderr(f"run finish: {e}")
        finally:
            c.close()

    runner.on_start = on_start
    runner.on_finish = on_finish
    state.runner = runner

    # Outreach drafting + answer generation + chat: gated on a configured key
    # (DB-stored wins over env; create_app already seeded the shared client).
    if state.anthropic is not None and state.anthropic.has_key():
        rc = connect(db_path)
        try:
            n = reap_stuck_outreach_drafts(rc, 0)
            if n > 0:
                _stderr(f"outreach: failed {n} draft(s) orphaned by a restart")
            m = reap_stuck_answers(rc, 0)
            if m > 0:
                _stderr(f"answers: failed {m} answer(s) orphaned by a restart")
        finally:
            rc.close()

        def brief_fn() -> str:
            """The company-fit brief for answer generation: resolve criteria over a
            fresh connection (the shared resolver's store is request-scoped)."""
            bcon = connect(db_path)
            try:
                if state.resolver is not None:
                    r = criteria.Resolver(
                        brain=state.resolver.brain,
                        distiller=state.resolver.distiller,
                        store=bcon,
                        taste_md_path=config.taste_md_path,
                        ttl=config.brain_cache_ttl,
                        log=_stderr,
                    )
                    return r.resolve().text
                if config.taste_md_path:
                    return taste.load_file(config.taste_md_path).text
                return ""
            finally:
                bcon.close()

        eng = outreach.Engine(
            con=connect(db_path),
            client=state.anthropic,
            model=config.outreach_model,
            brainbot=bc,
            log=_stderr,
            brief=brief_fn,
        )
        state.outreach = eng
        state.answers = eng
        _stderr(f"outreach drafting + answer generation enabled (model {config.outreach_model})")

        state.chat = chat_pkg.new(connect(db_path), state.anthropic)
        _stderr(f"chat enabled (model {chat_pkg.MODEL})")
    else:
        _stderr("outreach drafting + answer generation disabled (no ANTHROPIC_API_KEY)")

    # Background criteria reconciler: keeps the cached company-fit brief consistent
    # with the brain without a manual Refresh. Gated on a configured brain and a
    # positive interval; the daemon thread dies with the process on shutdown.
    if args.reconcile_interval > 0 and args.brainbot != "":
        _stderr(f"criteria: background reconcile every {args.reconcile_interval}s")
        stop = threading.Event()
        threading.Thread(
            target=criteria.reconcile_loop,
            args=(stop, args.reconcile_interval, state.reload_taste),
            daemon=True,
        ).start()

    # Background Gmail read-sync poller (M55): pulls replies + application-status
    # mail every 150s and updates the board. Started unconditionally — the loop
    # self-gates per pass on a present refresh token, so connecting Gmail from the
    # UI starts the sync within one interval, no restart. Daemon thread dies with
    # the process on shutdown (mirrors the criteria reconciler).
    if args.gmail_sync_interval > 0:
        from scout.gmail import sync as gmail_sync

        _stderr(f"gmail: background read-sync every {args.gmail_sync_interval}s (when connected)")
        gstop = threading.Event()
        threading.Thread(
            target=gmail_sync.sync_loop,
            args=(gstop, args.gmail_sync_interval, db_path),
            kwargs={"anthropic": state.anthropic, "log": _stderr},
            daemon=True,
        ).start()

    print(f"scout triage UI at http://localhost{args.addr}")
    uvicorn.run(app, host=host, port=port)


# --- gmail -------------------------------------------------------------------


def cmd_gmail_auth(args) -> None:
    """Connect a Gmail account via a one-shot localhost loopback OAuth flow: print
    (and open) the consent URL, capture the redirect on --port, exchange the code,
    and store the refresh token + address. The loopback redirect
    (http://localhost:<port>/api/gmail/callback) must be a registered redirect URI
    on the OAuth client."""
    import http.server
    import secrets
    import urllib.parse
    import webbrowser

    from scout.gmail import oauth as gmail_oauth
    from scout.gmail.client import GmailClient
    from scout.store import gmail as gmail_store

    con = store_db.open_db(args.db)
    try:
        redirect = f"http://localhost:{args.port}/api/gmail/callback"
        cfg = gmail_oauth.load_config(con, redirect_uri=redirect)
        if not cfg.configured():
            _stderr("gmail: set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (env or .env) first")
            sys.exit(1)
        state = secrets.token_urlsafe(24)
        url = gmail_oauth.consent_url(cfg, state)

        holder: dict = {}

        class _Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                parsed = urllib.parse.urlparse(self.path)
                if parsed.path != "/api/gmail/callback":
                    self.send_response(404)
                    self.end_headers()
                    return
                q = urllib.parse.parse_qs(parsed.query)
                holder["code"] = q.get("code", [""])[0]
                holder["state"] = q.get("state", [""])[0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h2>Gmail connected. You can close this tab.</h2>")

            def log_message(self, *a):  # silence the access log
                pass

        srv = http.server.HTTPServer(("localhost", args.port), _Handler)
        print(f"opening the Google consent screen; if it doesn't open, visit:\n{url}")
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001 - headless box: just print the URL
            pass
        srv.handle_request()  # serve exactly one request: the OAuth redirect
        srv.server_close()

        if not holder.get("code") or holder.get("state") != state:
            _stderr("gmail: OAuth callback missing a code or with a mismatched state — aborted")
            sys.exit(1)
        tok = gmail_oauth.exchange_code(cfg, holder["code"])
        email = tok.email
        if not email and tok.refresh_token:
            with GmailClient(cfg, tok.refresh_token, access_token=tok.access_token) as gc:
                email = gc.get_profile().get("emailAddress", "")
        gmail_store.store_credentials(con, tok.refresh_token, email)
        print(f"connected {email or '(unknown address)'}")
    finally:
        con.close()


def cmd_gmail_sync(args) -> None:
    """Run one Gmail read-sync pass (the poller does this every 150s when serving)."""
    from scout import anthropic as anthropic_pkg
    from scout.gmail import oauth as gmail_oauth
    from scout.gmail import sync as gmail_sync
    from scout.store import gmail as gmail_store

    con = store_db.open_db(args.db)
    try:
        if not gmail_store.is_connected(con):
            _stderr("gmail: not connected — run `scout gmail auth` first")
            sys.exit(1)
        ac = anthropic_pkg.new("")
        try:
            res = gmail_sync.sync_once(con, anthropic=ac, log=_stderr)
        except gmail_oauth.GmailAuthError as e:
            _stderr(f"gmail: auth failed — reconnect with `scout gmail auth` ({e})")
            sys.exit(1)
        print(" ".join(f"{k}={v}" for k, v in res.items()))
    finally:
        con.close()


# --- stats -------------------------------------------------------------------


def cmd_stats(args) -> None:
    from scout.store.companies import count_companies
    from scout.store.verdicts import count_verdicts_by_verdict

    con = store_db.open_db(args.db)
    try:
        n = count_companies(con)
        hist = count_verdicts_by_verdict(con)
    finally:
        con.close()
    print(f"companies={n}")
    if hist:
        print("verdicts:")
        for k in sorted(hist):
            print(f"  {k:<5} {hist[k]}")


# --- backup / restore --------------------------------------------------------


def cmd_backup(args) -> None:
    dest = args.out or f"scout-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    if os.path.exists(dest):
        raise RuntimeError(f"refusing to overwrite existing {dest}")
    con = store_db.open_db(args.db)
    try:
        store_db.backup(con, dest)
    finally:
        con.close()
    size_mb = os.path.getsize(dest) / (1 << 20)
    print(f"backup written: {dest} ({size_mb:.1f} MB)")


def cmd_restore(args) -> None:
    src = args.snapshot
    if not os.path.exists(src):
        raise RuntimeError(f"snapshot {src}: not found")

    db_path = args.db
    staged = db_path + ".restoring"
    for p in (staged, staged + "-wal", staged + "-shm"):
        try:
            os.remove(p)
        except OSError:
            pass
    try:
        shutil.copyfile(src, staged)
        # Validate + migrate the staged copy so a corrupt or incompatible snapshot
        # never touches the live DB.
        sdb = store_db.open_db(staged)
        try:
            store_db.integrity_check(sdb)
        finally:
            sdb.close()

        # Swap into place. Keep the displaced DB unless --force.
        if os.path.exists(db_path):
            if args.force:
                os.remove(db_path)
            else:
                aside = db_path + ".pre-restore"
                os.replace(db_path, aside)
                print(f"existing db kept at {aside}")
        for p in (db_path + "-wal", db_path + "-shm"):
            try:
                os.remove(p)
            except OSError:
                pass
        os.replace(staged, db_path)
        print(f"restored {src} -> {db_path}")
    finally:
        for p in (staged, staged + "-wal", staged + "-shm"):
            try:
                os.remove(p)
            except OSError:
                pass


# --- argument parsing --------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="scout", description="personal job-research pipeline")
    sub = p.add_subparsers(dest="command", metavar="<command>")

    # ingest
    sp = sub.add_parser("ingest", help="load a CSV dump into the local DB")
    sp.add_argument("csv", help="csv path")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.add_argument("--source", default="crunchbase", help="source tag stored on each row")
    sp.set_defaults(func=cmd_ingest)

    # filter
    sp = sub.add_parser("filter", help="apply the pre-filter rules; print survivors")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.set_defaults(func=cmd_filter)

    # enrich
    sp = sub.add_parser("enrich", help="fetch about-pages for survivors")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.add_argument("--workers", type=int, default=8, help="parallel fetchers")
    sp.add_argument("--timeout", type=parse_duration, default=12.0, help="per-request timeout")
    sp.add_argument("--force", action="store_true", help="re-fetch even if cached")
    sp.add_argument("--only-blanks", action="store_true", help="only companies with no enrichment row yet")
    sp.add_argument("--company", default="", help="comma-separated company IDs; re-fetch exactly these")
    sp.set_defaults(func=cmd_enrich)

    # verdict
    sp = sub.add_parser("verdict", help="score enriched survivors")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.add_argument("--taste-md", default="taste.md", help="narrative taste block (for the LLM)")
    sp.add_argument("--brainbot", default=DEFAULT_BRAIN_URL, help="brain base URL (HTTP); empty disables")
    sp.add_argument("--brain-cache-ttl", type=parse_duration, default=DEFAULT_BRAIN_CACHE_TTL,
                    help="reuse a cached brain profile for this long before refetching")
    sp.add_argument("--model", default=anthropic.DEFAULT_MODEL, help="Anthropic model for scoring")
    sp.add_argument("--distill-model", default=DEFAULT_DISTILL_MODEL,
                    help="Anthropic model for the once-per-run distiller")
    sp.add_argument("--workers", type=int, default=10, help="parallel API calls")
    sp.add_argument("--force", action="store_true", help="re-score even if taste_version matches")
    sp.add_argument("--only-blanks", action="store_true", help="only companies with no verdict row yet")
    sp.add_argument("--company", default="", help="comma-separated company IDs; re-score exactly these")
    sp.set_defaults(func=cmd_verdict)

    # distill
    sp = sub.add_parser("distill", help="print the company-fit brief (debug)")
    sp.add_argument("--brainbot", default=DEFAULT_BRAIN_URL, help="brain base URL (HTTP)")
    sp.add_argument("--model", default=DEFAULT_DISTILL_MODEL, help="Anthropic model for the distiller")
    sp.add_argument("--k", type=int, default=0, help="per-question recall depth (0 = distiller default)")
    sp.set_defaults(func=cmd_distill)

    # outreach
    sp = sub.add_parser("outreach", help="outreach knowledge sources + drafting")
    osub = sp.add_subparsers(dest="outreach_cmd", metavar="<subcommand>")
    so = osub.add_parser("sources", help="sync + print the brain-discovered knowledge bundle")
    so.add_argument("--db", default="scout.db", help="sqlite path")
    so.add_argument("--brainbot", default=DEFAULT_BRAIN_URL, help="brain base URL (HTTP)")
    so.add_argument("--refresh", action="store_true", help="force a full re-discovery")
    so.set_defaults(func=cmd_outreach_sources)
    so = osub.add_parser("draft", help="run the outreach pipeline for one posting")
    so.add_argument("--db", default="scout.db", help="sqlite path")
    so.add_argument("--posting", default="", help="job_postings.id to draft outreach for")
    so.add_argument("--model", default=DEFAULT_OUTREACH_MODEL, help="Anthropic model for the outreach pipeline")
    so.add_argument("--brainbot", default=DEFAULT_BRAIN_URL, help="brain base URL (HTTP)")
    so.set_defaults(func=cmd_outreach_draft)
    sp.set_defaults(func=lambda a: _require_sub("outreach: want a subcommand: sources | draft"))

    # questions
    sp = sub.add_parser("questions", help="detect application-form essay questions")
    qsub = sp.add_subparsers(dest="questions_cmd", metavar="<subcommand>")
    sq = qsub.add_parser("detect", help="detect a posting's (or every posting's) questions")
    sq.add_argument("--db", default="scout.db", help="sqlite path")
    sq.add_argument("--posting", default="", help="job_postings.id to detect questions for")
    sq.add_argument("--all", action="store_true", help="detect across every posting (backfill)")
    sq.set_defaults(func=cmd_questions_detect)
    sp.set_defaults(func=lambda a: _require_sub("questions: want a subcommand: detect"))

    # gmail
    sp = sub.add_parser("gmail", help="connect a Gmail account; run a read-sync pass")
    gsub = sp.add_subparsers(dest="gmail_cmd", metavar="<subcommand>")
    ga = gsub.add_parser("auth", help="connect a Gmail account via a localhost loopback OAuth flow")
    ga.add_argument("--db", default="scout.db", help="sqlite path")
    ga.add_argument("--port", type=int, default=8765,
                    help="loopback port for the OAuth redirect (must be a registered redirect URI)")
    ga.set_defaults(func=cmd_gmail_auth)
    gs = gsub.add_parser("sync", help="run one Gmail read-sync pass")
    gs.add_argument("--db", default="scout.db", help="sqlite path")
    gs.set_defaults(func=cmd_gmail_sync)
    sp.set_defaults(func=lambda a: _require_sub("gmail: want a subcommand: auth | sync"))

    # serve
    sp = sub.add_parser("serve", help="web control surface + triage UI")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.add_argument("--addr", default=":8765", help="listen address")
    sp.add_argument("--taste-md", default="taste.md", help="narrative taste block (editable in the UI)")
    sp.add_argument("--source", default="crunchbase", help="source tag for UI CSV uploads")
    sp.add_argument("--brainbot", default=DEFAULT_BRAIN_URL, help="brain base URL (HTTP); empty disables")
    sp.add_argument("--brain-cache-ttl", type=parse_duration, default=DEFAULT_BRAIN_CACHE_TTL,
                    help="reuse a cached brain profile for this long before refetching")
    sp.add_argument("--reconcile-interval", type=parse_duration, default=DEFAULT_RECONCILE_INTERVAL,
                    help="background interval to reconcile the cached brief; 0 disables")
    sp.add_argument("--gmail-sync-interval", type=parse_duration, default=DEFAULT_GMAIL_SYNC_INTERVAL,
                    help="background interval to poll Gmail for replies + application mail; 0 disables")
    sp.add_argument("--distill-model", default=DEFAULT_DISTILL_MODEL, help="Anthropic model for the distiller")
    sp.add_argument("--outreach-model", default=DEFAULT_OUTREACH_MODEL,
                    help="Anthropic model for the outreach pipeline")
    sp.set_defaults(func=cmd_serve)

    # stats
    sp = sub.add_parser("stats", help="show DB row counts")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.set_defaults(func=cmd_stats)

    # backup
    sp = sub.add_parser("backup", help="write a single-file DB snapshot")
    sp.add_argument("--db", default="scout.db", help="sqlite path")
    sp.add_argument("--out", default="", help="snapshot path (default scout-<timestamp>.db)")
    sp.set_defaults(func=cmd_backup)

    # restore
    sp = sub.add_parser("restore", help="make a snapshot file the live database")
    sp.add_argument("snapshot", help="snapshot path")
    sp.add_argument("--db", default="scout.db", help="live sqlite path to restore into")
    sp.add_argument("--force", action="store_true", help="overwrite without keeping a .pre-restore copy")
    sp.set_defaults(func=cmd_restore)

    # help
    sp = sub.add_parser("help", help="show this help")
    sp.set_defaults(func=None)

    return p


def _require_sub(msg: str) -> None:
    raise RuntimeError(msg)


def main(argv: list[str] | None = None) -> None:
    load_dotenv(".env")  # project-local config (e.g. ANTHROPIC_API_KEY); real env wins
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command is None or args.command == "help":
        parser.print_help()
        sys.exit(0 if args.command == "help" else 2)

    try:
        args.func(args)
    except SystemExit:
        raise
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:  # noqa: BLE001 - top-level: report and exit 1, like Go's exit()
        _stderr(f"error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
