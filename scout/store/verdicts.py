"""Verdicts table. Port of internal/store/verdicts.go."""
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
        company_id=row[0], verdict=row[1], reason=row[2],
        taste_version=row[3], model=row[4], scored_at=row[5],
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
