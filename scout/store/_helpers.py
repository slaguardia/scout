"""Small shared helpers for the store modules.

These mirror Go idioms that don't have a direct Python equivalent:
  - tx()      ← Go's `tx, _ := db.Begin(); defer tx.Rollback(); …; tx.Commit()`
  - null()    ← Go's store.NullString (empty string stores as SQL NULL)
  - new_uuid() ← Go's uuid.NewString() (a random v4 id for non-deterministic keys)
"""
from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager


@contextmanager
def tx(con: sqlite3.Connection):
    """Run a block inside one transaction; commit on success, roll back on error.

    The connection is opened in autocommit mode (isolation_level=None), so we
    drive transactions explicitly — the direct analogue of Go's db.Begin() /
    tx.Commit() / defer tx.Rollback().
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

    Mirrors store.NullString. Callers trim first where Go does
    (store.NullString(strings.TrimSpace(s))).
    """
    return s or None


def new_uuid() -> str:
    """A fresh random (v4) id — Go's uuid.NewString(), for non-deterministic keys."""
    return str(uuid.uuid4())
