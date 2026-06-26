"""SQLite connection + migration runner.

Faithful port of internal/store/store.go. Opens (or creates) the database,
applies any pending migrations atomically, and exposes the backup +
integrity-check helpers. Everything above this in the stack gets its connection
from open_db().
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

# The ordered NNNN_name.sql migration files ship inside the package, next to
# this module. Path(__file__) is this file's location, so this resolves the same
# whether scout runs from source or an installed wheel.
_MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def connect(path: str) -> sqlite3.Connection:
    """Open a connection with the same pragmas as open_db, but WITHOUT migrating.

    The web layer opens one connection per request via this helper (migrations
    already ran once at startup); open_db is connect + migrate, so every existing
    caller/test keeps the same one-call behavior.
    """
    # isolation_level=None puts the driver in autocommit mode, so WE drive
    # transactions with explicit BEGIN/COMMIT — the direct analogue of Go's
    # db.Begin()/Commit(). Without this, Python's sqlite3 silently opens a hidden
    # transaction before every INSERT/UPDATE/DELETE (but NOT before DDL or
    # SELECT), which is a classic source of "why didn't my write commit?" bugs.
    #
    # check_same_thread=False: FastAPI runs the get_db dependency and the sync
    # endpoint in a threadpool, and anyio may land them on different worker
    # threads. A per-request connection is never used concurrently (dependency
    # opens → endpoint uses → dependency closes, all sequential), so relaxing the
    # same-thread guard is safe and required. Harmless for the single-thread
    # store tests.
    con = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    # Make rows behave like dicts (row["title"]) instead of bare positional
    # tuples — the closest equivalent to scanning into a Go struct.
    con.row_factory = sqlite3.Row
    # Same pragmas as Go's Open():
    #  - foreign_keys: SQLite leaves FK enforcement OFF by default; turn it on.
    #  - WAL: readers don't block the single writer (the verdict pass fans out).
    #  - busy_timeout: a blocked writer waits up to 5s for the lock instead of
    #    failing immediately with SQLITE_BUSY.
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA busy_timeout = 5000")
    return con


def open_db(path: str) -> sqlite3.Connection:
    """Open (or create) the database at `path`, run migrations, return the handle."""
    con = connect(path)
    _migrate(con)
    return con


def _migrate(con: sqlite3.Connection) -> None:
    """Apply every not-yet-applied migration, in filename order."""
    con.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
    )

    names = sorted(p.name for p in _MIGRATIONS_DIR.glob("*.sql"))
    for name in names:
        applied = con.execute(
            "SELECT COUNT(1) FROM schema_migrations WHERE name = ?", (name,)
        ).fetchone()[0]
        if applied:
            continue

        body = (_MIGRATIONS_DIR / name).read_text()
        # Apply the migration body AND its bookkeeping row in ONE transaction, so
        # a multi-statement migration (ADD COLUMN + backfill + DROP COLUMN) is
        # atomic: an interruption rolls the whole thing back instead of leaving
        # the schema half-migrated and wedging the next startup.
        #
        # Python gotcha: executescript() is the only way to run a multi-statement
        # body, but it implicitly COMMITs any open transaction before it runs — so
        # we can't wrap it in a BEGIN/COMMIT issued from Python. Instead we put the
        # BEGIN/COMMIT *inside* the script string. `name` is a trusted local
        # filename (no SQL-injection surface), so inlining it is safe.
        script = (
            "BEGIN;\n"
            f"{body}\n"
            f"INSERT INTO schema_migrations (name) VALUES ('{name}');\n"
            "COMMIT;"
        )
        try:
            con.executescript(script)
        except Exception:
            # The failed body left the transaction open; roll it back so the
            # connection is reusable and the migration stays unrecorded.
            try:
                con.rollback()
            except sqlite3.OperationalError:
                pass  # no active transaction to roll back
            raise


def backup(con: sqlite3.Connection, dest: str) -> None:
    """Write a consistent, compacted snapshot to `dest` via VACUUM INTO.

    Safe to run while serving (captures a transactionally-consistent view and
    folds in WAL pages). `dest` must not already exist — SQLite refuses to
    overwrite.
    """
    # VACUUM INTO can't bind parameters; quote the path by doubling single quotes.
    quoted = "'" + dest.replace("'", "''") + "'"
    con.execute(f"VACUUM INTO {quoted}")


def integrity_check(con: sqlite3.Connection) -> None:
    """Run PRAGMA integrity_check; raise if the database is corrupt.

    A healthy database reports the single row "ok".
    """
    problems = [r[0] for r in con.execute("PRAGMA integrity_check") if r[0] != "ok"]
    if problems:
        raise RuntimeError("integrity_check failed: " + "; ".join(problems))
