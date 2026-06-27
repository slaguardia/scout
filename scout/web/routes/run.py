"""The control surface: start pipeline stages as jobs, stream/cancel them, report
the busy stage, and ingest a CSV upload.

The pipeline Runner (scout.jobs.Runner) is a
one-at-a-time app singleton on AppState; routes 503 when it isn't wired. Each
background stage opens its OWN sqlite connection inside the worker thread (never
the request connection). SSE framing is one collapsed data line per event.
"""

from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, Depends, File, UploadFile
from starlette.responses import Response, StreamingResponse

from scout import enrich as enrich_pkg
from scout import filter as filter_pkg
from scout import ingest, jobs
from scout import verdict as verdict_pkg
from scout.store.db import connect

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import decode_json, raw_body

router = APIRouter()


def _workers_or(req: int, default: int) -> int:
    """Clamp a requested worker count into [1,24], default when unset. The ceiling
    guards against a UI value that would blow past the API rate limit."""
    if req <= 0:
        return default
    if req > 24:
        return 24
    return req


def _run_opts(raw: bytes) -> dict:
    """The optional JSON body for POST /api/run/{stage} (best-effort decode)."""
    try:
        return decode_json(raw)
    except Exception:  # noqa: BLE001 - the body is optional
        return {}


# --- POST /api/run/{stage} ---------------------------------------------------


@router.post("/api/run/{stage}")
def run_stage(
    stage: str,
    raw: bytes = Depends(raw_body),
    state: AppState = Depends(get_state),
    con=Depends(get_db),
) -> Response:
    if state.runner is None:
        return json_error("control surface disabled", 503)
    opts = _run_opts(raw)
    force = bool(opts.get("force"))
    only_blanks = bool(opts.get("only_blanks"))
    company_ids = opts.get("company_ids") or None
    if company_ids is not None and not isinstance(company_ids, list):
        company_ids = None
    workers = int(opts.get("workers", 0) or 0)
    db_path = state.config.db_path

    if stage == "enrich":
        fn = _enrich_job(state, db_path, force, only_blanks, company_ids, workers)
    elif stage == "verdict":
        # Re-key the shared client so a dashboard-stored key takes effect with no
        # restart; only then gate on a present key.
        if state.ensure_anthropic_key(con) == "":
            return json_error(
                "verdict needs an Anthropic API key (set one in Settings, or ANTHROPIC_API_KEY "
                "in the server environment)",
                412,
            )
        fn = _verdict_job(state, db_path, force, only_blanks, company_ids, workers)
    else:
        return json_error("unknown stage: " + stage, 400)

    try:
        job = state.runner.start(stage, fn)
    except jobs.ErrBusy as e:
        return json_error(str(e), 409)
    return json_response({"job_id": job.id, "stage": stage}, 202)


def _enrich_job(state, db_path, force, only_blanks, company_ids, workers):
    def fn(ctx, _id, emit):  # noqa: ANN001
        con = connect(db_path)
        try:
            e = enrich_pkg.Enricher(
                con=con,
                progress=emit,
                only_blanks=only_blanks,
                company_ids=company_ids,
                workers=_workers_or(workers, 8),
            )
            # Fact extraction needs a key; without it enrichment is purely mechanical.
            if state.ensure_anthropic_key(con) != "":
                e.llm = state.anthropic
            res = e.run(force)
            return {
                "considered": res.considered,
                "fetched": res.fetched,
                "ok": res.ok,
                "failed": res.failed,
                "filled": res.filled,
            }
        finally:
            con.close()

    return fn


def _verdict_job(state, db_path, force, only_blanks, company_ids, workers):
    def fn(ctx, run_id, emit):  # noqa: ANN001
        # Re-resolve criteria first so the Resolver re-checks its TTL and refreshes
        # the cached brain profile; otherwise a long-lived server scores against
        # criteria frozen at startup once the cache TTL lapses.
        state.reload_taste()
        con = connect(db_path)
        try:
            ft = filter_pkg.taste_from_db(con)
            tb = state.current_taste()
            if tb is None:
                raise RuntimeError(f"no taste loaded (check {state.config.taste_md_path})")
            sc = verdict_pkg.Scorer(
                con=con,
                taste=tb,
                filter=ft,
                client=state.anthropic,
                playbook=state.current_playbook(),
                run_id=run_id,
                force=force,
                only_blanks=only_blanks,
                company_ids=company_ids,
                workers=_workers_or(workers, 10),
                progress=emit,
            )
            res = sc.run()
            return {
                "considered": res.considered,
                "scored": res.scored,
                "skipped": res.skipped,
                "failed": res.failed,
                "by_verdict": res.by_verdict,
            }
        finally:
            con.close()

    return fn


# --- /api/jobs/{id}/stream (SSE) + /cancel -----------------------------------


def _sse(event: str, data: str) -> bytes:
    """One SSE message, single collapsed data line."""
    data = data.replace("\n", " ")
    return f"event: {event}\ndata: {data}\n\n".encode()


@router.get("/api/jobs/{job_id}/stream")
def job_stream(job_id: str, state: AppState = Depends(get_state)) -> Response:
    if state.runner is None:
        return json_error("control surface disabled", 503)
    job = state.runner.get(job_id)
    if job is None:
        return json_error("not found", 404)

    def gen():
        backlog, ch, _done = job.subscribe()
        for line in backlog:
            yield _sse("line", line)
        while True:
            item = ch.get()  # blocks; None sentinel ends the stream
            if item is None:
                yield _sse("end", job.current_status())
                return
            yield _sse("line", item)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/api/jobs/{job_id}/cancel")
def job_cancel(job_id: str, state: AppState = Depends(get_state)) -> Response:
    if state.runner is None:
        return json_error("control surface disabled", 503)
    return json_response({"canceled": state.runner.cancel(job_id)})


# --- GET /api/runs -----------------------------------------------------------


@router.get("/api/runs")
def runs(state: AppState = Depends(get_state)) -> Response:
    busy = state.runner.busy() if state.runner is not None else ""
    return json_response({"busy_stage": busy})


# --- POST /api/ingest (multipart CSV) ----------------------------------------


@router.post("/api/ingest")
async def ingest_csv(
    csv: UploadFile | None = File(default=None), state: AppState = Depends(get_state)
) -> Response:
    if state.runner is None:
        return json_error("control surface disabled", 503)
    if csv is None:
        return json_error("missing 'csv' file field", 400)

    data = await csv.read()
    fd, tmp_path = tempfile.mkstemp(prefix="scout-upload-", suffix=".csv")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
    except OSError as e:
        os.remove(tmp_path)
        return json_error("write temp: " + str(e), 500)

    source = state.config.ingest_source or "crunchbase"
    filename = csv.filename or "upload.csv"
    db_path = state.config.db_path

    def fn(ctx, _id, emit):  # noqa: ANN001
        try:
            emit(f"ingesting {filename} (source={source})…")
            con = connect(db_path)
            try:
                res = ingest.CSV(source=source, con=con).run(tmp_path)
            finally:
                con.close()
            emit(
                f"read={res.read} upserted={res.upserted} "
                f"({res.upserted - res.merged} new, {res.merged} merged, {res.collisions} name-collisions) "
                f"skipped={res.skipped} errors={len(res.errors)}"
            )
            for col in res.collision_details:
                where = col.domain or "no domain"
                emit(
                    f'warn: collision on {where} — "{col.incoming_name}" overwrote "{col.overwrote_name}"'
                )
            return {
                "read": res.read,
                "upserted": res.upserted,
                "inserted": res.upserted - res.merged,
                "merged": res.merged,
                "collisions": res.collisions,
                "collision_details": res.collision_details,
                "skipped": res.skipped,
                "errors": len(res.errors),
                "filename": filename,
            }
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    try:
        job = state.runner.start("ingest", fn)
    except jobs.ErrBusy as e:
        os.remove(tmp_path)
        return json_error(str(e), 409)
    return json_response({"job_id": job.id, "stage": "ingest"}, 202)
