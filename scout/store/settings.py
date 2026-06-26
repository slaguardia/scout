"""Key/value settings table. Port of internal/store/settings.go.

This is the canonical example of the store-module pattern: free functions that
take the sqlite3 connection as their first argument (no DB class), parameterized
SQL with ? placeholders, and the Go method name lower_snake_cased.
"""
from __future__ import annotations

import sqlite3

# Settings keys used across the app (Go's exported string consts).
ANTHROPIC_KEY_SETTING = "anthropic_api_key"
OUTREACH_CURSOR_SETTING = "outreach_knowledge_cursor"


def get_setting(con: sqlite3.Connection, key: str) -> str:
    """Return the stored value for key, or "" when unset."""
    row = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row[0] if row is not None else ""


def set_setting(con: sqlite3.Connection, key: str, value: str) -> None:
    """Upsert key = value."""
    con.execute(
        """
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        """,
        (key, value),
    )


def delete_setting(con: sqlite3.Connection, key: str) -> None:
    """Remove key. No error if it was already absent."""
    con.execute("DELETE FROM settings WHERE key = ?", (key,))
