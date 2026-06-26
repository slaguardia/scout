"""Append-only verdict decision trail. Port of internal/store/trace.go."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from ._helpers import null


@dataclass
class VerdictTrace:
    company_id: str = ""
    run_id: str = ""
    model: str = ""
    taste_version: str = ""
    criteria_source: str = ""
    verdict: str = ""
    reason: str = ""


def insert_verdict_trace(con: sqlite3.Connection, t: VerdictTrace) -> None:
    """Append one decision-trail row."""
    con.execute(
        """
INSERT INTO verdict_trace
  (company_id, run_id, model, taste_version, criteria_source, verdict, reason)
VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (t.company_id, null(t.run_id), t.model, t.taste_version,
         null(t.criteria_source), t.verdict, t.reason),
    )


@dataclass
class TraceEvent:
    id: int = 0
    run_id: str = ""
    model: str = ""
    taste_version: str = ""
    criteria_source: str = ""
    verdict: str = ""
    reason: str = ""
    scored_at: str = ""


def company_trace(con: sqlite3.Connection, company_id: str) -> list[TraceEvent]:
    """The full decision trail for one company, oldest first."""
    rows = con.execute(
        """
SELECT id, COALESCE(run_id,''), model, taste_version,
       COALESCE(criteria_source,''), verdict, reason, scored_at
FROM verdict_trace
WHERE company_id = ?
ORDER BY scored_at ASC, id ASC""",
        (company_id,),
    ).fetchall()
    return [
        TraceEvent(id=r[0], run_id=r[1], model=r[2], taste_version=r[3],
                   criteria_source=r[4], verdict=r[5], reason=r[6], scored_at=r[7])
        for r in rows
    ]
