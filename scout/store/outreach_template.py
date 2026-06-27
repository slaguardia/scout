"""Singleton email + follow-up template rows."""

from __future__ import annotations

import sqlite3

# Both live in outreach_template, keyed apart.
_OUTREACH_TEMPLATE_KEY = "default"
_FOLLOWUP_TEMPLATE_KEY = "followup"


def get_outreach_template(con: sqlite3.Connection) -> str:
    """The saved email template, or "" when none has been saved."""
    row = con.execute(
        "SELECT content FROM outreach_template WHERE key = ?", (_OUTREACH_TEMPLATE_KEY,)
    ).fetchone()
    return row[0] if row is not None else ""


def put_outreach_template(con: sqlite3.Connection, content: str) -> None:
    """Upsert the singleton email-template row."""
    _put_template(con, _OUTREACH_TEMPLATE_KEY, content)


def get_followup_template(con: sqlite3.Connection) -> str:
    """The saved follow-up template, or "" when none has been saved."""
    row = con.execute(
        "SELECT content FROM outreach_template WHERE key = ?", (_FOLLOWUP_TEMPLATE_KEY,)
    ).fetchone()
    return row[0] if row is not None else ""


def put_followup_template(con: sqlite3.Connection, content: str) -> None:
    """Upsert the singleton follow-up template row."""
    _put_template(con, _FOLLOWUP_TEMPLATE_KEY, content)


def _put_template(con: sqlite3.Connection, key: str, content: str) -> None:
    con.execute(
        """
INSERT INTO outreach_template (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP""",
        (key, content),
    )
