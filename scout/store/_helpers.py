"""Small shared helpers for the store modules.

- tx()       — run a block inside one explicit transaction (commit/rollback)
- null()     — empty string stores as SQL NULL
- new_uuid() — a random v4 id for non-deterministic keys
"""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager


@contextmanager
def tx(con: sqlite3.Connection):
    """Run a block inside one transaction; commit on success, roll back on error.

    The connection is opened in autocommit mode (isolation_level=None), so we
    drive transactions explicitly with BEGIN/COMMIT/ROLLBACK.
    """
    con.execute("BEGIN")
    try:
        yield con
    except Exception:
        con.rollback()
        raise
    else:
        con.commit()


def null(s: str | None) -> str | None:
    """Empty/None → SQL NULL; otherwise the string unchanged.

    Callers trim whitespace first where a stored empty value should collapse to
    NULL (e.g. null(s.strip())).
    """
    return s or None


def new_uuid() -> str:
    """A fresh random (v4) id, for non-deterministic keys."""
    return str(uuid.uuid4())
