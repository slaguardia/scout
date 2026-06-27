"""The joined triage rows served by the read-only UI."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass
class TriageRow:
    company_id: str = ""
    name: str = ""
    domain: str = ""
    location: str = ""
    vertical: str = ""
    headcount: int = 0
    stage: str = ""
    verdict: str = ""
    reason: str = ""
    website_url: str = ""
    website_summary: str = ""
    enriched: bool = False  # enrichment fetched cleanly (fetch_status='ok')
    flagged: bool = False  # hand-set bookmark
    reviewed_at: str = ""  # last-reviewed stamp; "" = never


def triage_rows(con: sqlite3.Connection) -> list[TriageRow]:
    """Every company joined with optional enrichment and verdict."""
    q = """
SELECT c.id, c.name, c.domain, c.location, c.vertical, c.headcount, c.funding_stage,
       v.verdict, v.reason,
       e.website_url, e.website_summary, e.fetch_status,
       c.flagged_at, c.reviewed_at
FROM companies c
LEFT JOIN verdicts v ON v.company_id = c.id
LEFT JOIN enrichment e ON e.company_id = c.id
ORDER BY
  CASE COALESCE(v.verdict, 'zzz')
    WHEN 'yes'   THEN 0
    WHEN 'maybe' THEN 1
    WHEN 'no'    THEN 2
    ELSE 3
  END,
  c.name"""
    out: list[TriageRow] = []
    for r in con.execute(q).fetchall():
        out.append(
            TriageRow(
                company_id=r[0],
                name=r[1],
                domain=r[2] or "",
                location=r[3] or "",
                vertical=r[4] or "",
                headcount=r[5] or 0,
                stage=r[6] or "",
                verdict=r[7] or "",
                reason=r[8] or "",
                website_url=r[9] or "",
                website_summary=r[10] or "",
                enriched=(r[11] == "ok"),
                flagged=r[12] is not None,
                reviewed_at=r[13] or "",
            )
        )
    return out
