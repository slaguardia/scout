"""Singleton verdict playbook row."""

from __future__ import annotations

import sqlite3

_PLAYBOOK_KEY = "default"


def get_playbook(con: sqlite3.Connection) -> str:
    """The saved verdict playbook, or "" when none has been saved."""
    row = con.execute("SELECT content FROM playbook WHERE key = ?", (_PLAYBOOK_KEY,)).fetchone()
    return row[0] if row is not None else ""


def put_playbook(con: sqlite3.Connection, content: str) -> None:
    """Upsert the singleton playbook row."""
    con.execute(
        """
INSERT INTO playbook (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP""",
        (_PLAYBOOK_KEY, content),
    )
