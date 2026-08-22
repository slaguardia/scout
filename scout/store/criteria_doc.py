"""Singleton company-fit criteria doc (the typed-in criteria)."""

from __future__ import annotations

import sqlite3

_CRITERIA_KEY = "default"


def get_criteria_doc(con: sqlite3.Connection) -> str:
    """The saved criteria doc, or "" when none has been saved."""
    row = con.execute("SELECT content FROM criteria_doc WHERE key = ?", (_CRITERIA_KEY,)).fetchone()
    return row[0] if row is not None else ""


def put_criteria_doc(con: sqlite3.Connection, content: str) -> None:
    """Upsert the singleton criteria row."""
    con.execute(
        """
INSERT INTO criteria_doc (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP""",
        (_CRITERIA_KEY, content),
    )
