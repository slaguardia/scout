"""Durable pipeline-run records. Port of internal/store/runs.go."""
from __future__ import annotations

import datetime
import json
import sqlite3
from dataclasses import dataclass, field


def _utc_rfc3339() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _null_if_empty(s: str):
    return s or None


@dataclass
class Run:
    id: str = ""
    stage: str = ""
    status: str = ""
    started_at: str = ""
    finished_at: str = ""
    taste_version: str = ""
    summary: dict = field(default_factory=dict)
    error: str = ""


def insert_run(con: sqlite3.Connection, id: str, stage: str, taste_version: str) -> None:
    """Record the start of a run (status 'running')."""
    con.execute(
        "INSERT INTO runs (id, stage, status, started_at, taste_version) VALUES (?, ?, 'running', ?, ?)",
        (id, stage, _utc_rfc3339(), _null_if_empty(taste_version)),
    )


def finish_run(con: sqlite3.Connection, id: str, status: str, summary: dict | None, err_msg: str) -> None:
    """Update a run with its terminal status and summary."""
    summary_json = json.dumps(summary) if summary is not None else None
    con.execute(
        "UPDATE runs SET status = ?, finished_at = ?, summary = ?, error = ? WHERE id = ?",
        (status, _utc_rfc3339(), summary_json, _null_if_empty(err_msg), id),
    )


def list_runs(con: sqlite3.Connection, limit: int) -> list[Run]:
    """The most recent runs, newest first."""
    if limit <= 0:
        limit = 30
    rows = con.execute(
        "SELECT id, stage, status, started_at, COALESCE(finished_at,''), "
        "COALESCE(taste_version,''), COALESCE(summary,''), COALESCE(error,'') "
        "FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out: list[Run] = []
    for r in rows:
        run = Run(id=r[0], stage=r[1], status=r[2], started_at=r[3], finished_at=r[4],
                  taste_version=r[5], error=r[7])
        if r[6] != "":
            try:
                run.summary = json.loads(r[6])
            except (json.JSONDecodeError, ValueError):
                run.summary = {}
        out.append(run)
    return out
