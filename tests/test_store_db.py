"""Tests for the SQLite foundation (scout/store/db.py).

pytest discovers any test_*.py file and runs every test_* function. `tmp_path`
is a built-in fixture: a fresh temp directory per test, auto-cleaned — so each
test gets its own throwaway database with no manual setup/teardown.
"""

import sqlite3

import pytest

from scout.store import db


def _migration_count() -> int:
    return len(list(db._MIGRATIONS_DIR.glob("*.sql")))


def test_all_migrations_apply_to_fresh_db(tmp_path):
    """Opening a brand-new DB applies every migration and records each one."""
    con = db.open_db(str(tmp_path / "scout.db"))

    applied = con.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
    assert applied == _migration_count() > 0

    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"companies", "job_postings"} <= tables


def test_migrate_is_idempotent(tmp_path):
    """Re-opening the same DB applies nothing new and doesn't error."""
    path = str(tmp_path / "scout.db")
    db.open_db(path).close()

    con = db.open_db(path)  # second run must be a clean no-op
    applied = con.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
    assert applied == _migration_count()


def test_migration_body_is_atomic(tmp_path):
    """DDL rolls back inside a transaction.

    The migration runner relies on this property — a multi-statement body that
    fails partway must undo its earlier DDL, or a re-run wedges on the
    already-applied first statement.
    """
    con = db.open_db(str(tmp_path / "scout.db"))

    con.execute("BEGIN")
    con.execute("ALTER TABLE job_postings ADD COLUMN atomicity_probe TEXT")
    # A later statement in the same body fails (duplicate column).
    with pytest.raises(sqlite3.OperationalError):
        con.execute("ALTER TABLE job_postings ADD COLUMN atomicity_probe TEXT")
    con.rollback()

    # The probe column must have rolled back, so re-adding it now succeeds. If DDL
    # did NOT roll back, this raises "duplicate column name".
    con.execute("ALTER TABLE job_postings ADD COLUMN atomicity_probe TEXT")


def test_application_status_backfill_sql(tmp_path):
    """Migration 0051's backfill.

    Current stage = the last stage_history entry; garbage/empty histories
    collapse to ''. Exercises SQLite's JSON1 functions under Python's driver.
    """
    con = db.open_db(str(tmp_path / "scout.db"))
    con.execute(
        "CREATE TABLE tt (id TEXT, stage_history TEXT, application_status TEXT NOT NULL DEFAULT '')"
    )
    rows = [
        ("a", '[{"stage":"applied","date":"2026-05-22"}]'),
        ("b", '[{"stage":"applied","date":"2026-05-22"},{"stage":"offer","date":"2026-06-10"}]'),
        ("c", "[]"),
        ("d", "not json"),
        ("e", None),
    ]
    con.executemany("INSERT INTO tt (id, stage_history) VALUES (?, ?)", rows)

    con.execute(
        """
        UPDATE tt
        SET application_status = COALESCE(
            json_extract(stage_history, '$[' || (json_array_length(stage_history) - 1) || '].stage'),
            '')
        WHERE stage_history IS NOT NULL AND stage_history <> ''
          AND json_valid(stage_history) AND json_array_length(stage_history) > 0
        """
    )

    def status(row_id: str) -> str:
        return con.execute("SELECT application_status FROM tt WHERE id = ?", (row_id,)).fetchone()[
            0
        ]

    assert {rid: status(rid) for rid in "abcde"} == {
        "a": "applied",
        "b": "offer",
        "c": "",
        "d": "",
        "e": "",
    }
