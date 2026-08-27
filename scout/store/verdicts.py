"""Verdicts table."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

# ManualModel tags a verdict set by hand from the UI; the scorer treats such
# rows as sticky (only --force re-scores over a manual override).
MANUAL_MODEL = "manual"


@dataclass
class Verdict:
    company_id: str = ""
    verdict: str = ""
    reason: str = ""
    taste_version: str = ""
    model: str = ""
    scored_at: str | None = None


@dataclass
class VerdictCandidate:
    """A survivor with its enrichment, ready for scoring."""

    company_id: str = ""
    name: str = ""
    domain: str = ""
    location: str = ""
    vertical: str = ""
    headcount: int = 0
    stage: str = ""
    website_summary: str = ""


def get_verdict(con: sqlite3.Connection, company_id: str) -> Verdict | None:
    """Return the latest verdict for a company, or None when absent."""
    row = con.execute(
        "SELECT company_id, verdict, reason, taste_version, model, scored_at FROM verdicts WHERE company_id = ?",
        (company_id,),
    ).fetchone()
    if row is None:
        return None
    return Verdict(
        company_id=row[0],
        verdict=row[1],
        reason=row[2],
        taste_version=row[3],
        model=row[4],
        scored_at=row[5],
    )


def upsert_verdict(con: sqlite3.Connection, v: Verdict) -> None:
    """Insert or replace a verdict for a company."""
    con.execute(
        """
INSERT INTO verdicts (company_id, verdict, reason, taste_version, model, scored_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(company_id) DO UPDATE SET
    verdict       = excluded.verdict,
    reason        = excluded.reason,
    taste_version = excluded.taste_version,
    model         = excluded.model,
    scored_at     = CURRENT_TIMESTAMP;""",
        (v.company_id, v.verdict, v.reason, v.taste_version, v.model),
    )


def count_verdicts_by_verdict(con: sqlite3.Connection) -> dict[str, int]:
    """A histogram for stats."""
    rows = con.execute("SELECT verdict, COUNT(1) FROM verdicts GROUP BY verdict").fetchall()
    return {r[0]: r[1] for r in rows}


@dataclass
class ScopeCounts:
    """How the scored set breaks down against the live criteria version — the
    numbers behind the run dialog's scope picker.

    `stale` counts verdicts scored against a different taste_version, i.e. the
    ones a criteria edit invalidated. Manual verdicts are counted separately
    because a bulk re-score leaves them alone unless asked not to.
    """

    scored: int = 0
    stale: int = 0
    current: int = 0
    manual: int = 0


def scope_counts(con: sqlite3.Connection, current_taste_version: str) -> ScopeCounts:
    """Break the verdicts table down into current / stale / manual."""
    c = ScopeCounts()
    rows = con.execute(
        "SELECT COALESCE(taste_version, ''), COALESCE(model, ''), COUNT(1) "
        "FROM verdicts GROUP BY 1, 2"
    ).fetchall()
    for version, model, n in rows:
        c.scored += n
        if model == MANUAL_MODEL:
            c.manual += n
        elif version == current_taste_version and current_taste_version != "":
            c.current += n
        else:
            c.stale += n
    return c
