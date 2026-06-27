"""Shared pytest fixtures.

`db` is a fresh, fully-migrated database per test, backed by a temp file that
pytest cleans up automatically.
"""

import pytest

from scout.store import db as db_module


@pytest.fixture
def db(tmp_path):
    """A fresh migrated sqlite3 connection, one per test."""
    con = db_module.open_db(str(tmp_path / "scout.db"))
    yield con
    con.close()
