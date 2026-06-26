"""Hand-set company marks (flagged / reviewed). Port of internal/store/marks.go.

Both raise NotFound for an unknown company so handlers can answer 404 rather
than silently no-op.
"""
from __future__ import annotations

import sqlite3

from . import errors


def set_flagged(con: sqlite3.Connection, company_id: str, flagged: bool) -> None:
    """Flag (flagged_at = now) or unflag (flagged_at = NULL) a company."""
    if flagged:
        q = "UPDATE companies SET flagged_at = CURRENT_TIMESTAMP WHERE id = ?"
    else:
        q = "UPDATE companies SET flagged_at = NULL WHERE id = ?"
    _exec_mark(con, q, company_id)


def touch_reviewed(con: sqlite3.Connection, company_id: str) -> None:
    """Stamp a company as reviewed now (repeated calls move the stamp forward)."""
    _exec_mark(con, "UPDATE companies SET reviewed_at = CURRENT_TIMESTAMP WHERE id = ?", company_id)


def _exec_mark(con: sqlite3.Connection, q: str, company_id: str) -> None:
    cur = con.execute(q, (company_id,))
    if cur.rowcount == 0:
        raise errors.NotFound()
