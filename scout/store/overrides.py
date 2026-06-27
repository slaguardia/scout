"""Durable hand-set verdict overrides (record of intent)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from ._helpers import null


@dataclass
class VerdictOverride:
    company_id: str = ""
    from_verdict: str = ""  # prior verdict being replaced; "" if unscored
    to_verdict: str = ""
    reason: str = ""
    criteria_version: str = ""


def insert_verdict_override(con: sqlite3.Connection, o: VerdictOverride) -> None:
    """Append one override record."""
    con.execute(
        "INSERT INTO verdict_override (company_id, from_verdict, to_verdict, reason, criteria_version) "
        "VALUES (?, ?, ?, ?, ?)",
        (o.company_id, null(o.from_verdict), o.to_verdict, o.reason, null(o.criteria_version)),
    )
