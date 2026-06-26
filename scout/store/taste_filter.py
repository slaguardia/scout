"""Singleton pre-filter rules row. Port of internal/store/taste_filter.go."""
from __future__ import annotations

import sqlite3

_TASTE_FILTER_KEY = "default"


def get_taste_filter(con: sqlite3.Connection) -> tuple[str, bool]:
    """Return (content, enabled) for the saved pre-filter rules. No row →
    ("", True): no rules yet (caller falls back to the compiled-in default) and
    on by default."""
    row = con.execute(
        "SELECT content, enabled FROM taste_filter WHERE key = ?", (_TASTE_FILTER_KEY,)
    ).fetchone()
    if row is None:
        return "", True
    return row[0], bool(row[1])


def put_taste_filter(con: sqlite3.Connection, content: str, enabled: bool) -> None:
    """Upsert the singleton row's rules and enabled flag together."""
    con.execute(
        """
INSERT INTO taste_filter (key, content, enabled, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP""",
        (_TASTE_FILTER_KEY, content, 1 if enabled else 0),
    )
