"""Singleton email + follow-up template rows. Port of internal/store/outreach_template.go."""
from __future__ import annotations

import sqlite3

# All live in outreach_template, keyed apart.
_OUTREACH_TEMPLATE_KEY = "default"
_FOLLOWUP_TEMPLATE_KEY = "followup"
_SUBJECT_TEMPLATE_KEY = "subject"            # M55: send subject (substitution, no LLM)
_SIGNATURE_TEMPLATE_KEY = "signature"        # M55: appended sign-off block
_FOLLOWUP_SUBJECT_KEY = "followup_subject"   # M55: follow-up subject


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


def get_subject_template(con: sqlite3.Connection) -> str:
    """The saved send-subject template, or "" when none has been saved."""
    row = con.execute(
        "SELECT content FROM outreach_template WHERE key = ?", (_SUBJECT_TEMPLATE_KEY,)
    ).fetchone()
    return row[0] if row is not None else ""


def put_subject_template(con: sqlite3.Connection, content: str) -> None:
    _put_template(con, _SUBJECT_TEMPLATE_KEY, content)


def get_signature_template(con: sqlite3.Connection) -> str:
    """The saved signature block, or "" when none has been saved."""
    row = con.execute(
        "SELECT content FROM outreach_template WHERE key = ?", (_SIGNATURE_TEMPLATE_KEY,)
    ).fetchone()
    return row[0] if row is not None else ""


def put_signature_template(con: sqlite3.Connection, content: str) -> None:
    _put_template(con, _SIGNATURE_TEMPLATE_KEY, content)


def get_followup_subject_template(con: sqlite3.Connection) -> str:
    """The saved follow-up subject, or "" when none has been saved."""
    row = con.execute(
        "SELECT content FROM outreach_template WHERE key = ?", (_FOLLOWUP_SUBJECT_KEY,)
    ).fetchone()
    return row[0] if row is not None else ""


def put_followup_subject_template(con: sqlite3.Connection, content: str) -> None:
    _put_template(con, _FOLLOWUP_SUBJECT_KEY, content)


def _put_template(con: sqlite3.Connection, key: str, content: str) -> None:
    con.execute(
        """
INSERT INTO outreach_template (key, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP""",
        (key, content),
    )
