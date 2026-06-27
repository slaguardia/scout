"""Chat threads + messages (tracking agent / per-entity research)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from . import errors
from ._helpers import new_uuid

# Chat scopes. A thread is global or bound to one entity. scope_id is the
# company/posting id; "" (NULL) for global.
CHAT_SCOPE_GLOBAL = "global"
CHAT_SCOPE_COMPANY = "company"
CHAT_SCOPE_POSTING = "posting"


@dataclass
class ChatThread:
    id: str = ""
    scope: str = ""
    scope_id: str = ""  # "" for global
    title: str = ""
    created_at: str = ""
    updated_at: str = ""


@dataclass
class ChatMessage:
    id: str = ""
    thread_id: str = ""
    role: str = ""
    content: str = ""  # the raw content-block JSON array, verbatim
    created_at: str = ""


_THREAD_COLS = "id, scope, scope_id, title, created_at, updated_at"


def _scan_thread(row) -> ChatThread:
    return ChatThread(
        id=row[0],
        scope=row[1],
        scope_id=row[2] or "",
        title=row[3] or "",
        created_at=row[4],
        updated_at=row[5] or "",
    )


def open_or_create_thread(con: sqlite3.Connection, scope: str, scope_id: str) -> ChatThread:
    """Return the thread for (scope, scope_id), creating it on first sight.
    scope_id "" means global. Idempotent."""
    if scope not in (CHAT_SCOPE_GLOBAL, CHAT_SCOPE_COMPANY, CHAT_SCOPE_POSTING):
        raise ValueError(f"unknown chat scope {scope!r}")
    if scope == CHAT_SCOPE_GLOBAL:
        scope_id = ""  # global threads carry no entity id
    elif scope_id == "":
        raise ValueError(f"scope {scope!r} requires a scope_id")

    t = _find_thread(con, scope, scope_id)
    if t is not None:
        return t

    id = new_uuid()
    scope_val = scope_id or None
    # Create only if still absent — the WHERE NOT EXISTS makes a concurrent
    # double-open collapse to one row instead of tripping the unique index.
    con.execute(
        """INSERT INTO chat_threads (id, scope, scope_id, updated_at)
           SELECT ?, ?, ?, CURRENT_TIMESTAMP
           WHERE NOT EXISTS (SELECT 1 FROM chat_threads WHERE scope = ? AND COALESCE(scope_id, '') = ?)""",
        (id, scope, scope_val, scope, scope_id),
    )
    t = _find_thread(con, scope, scope_id)
    if t is None:
        raise RuntimeError("create chat thread: row vanished")
    return t


def _find_thread(con: sqlite3.Connection, scope: str, scope_id: str) -> ChatThread | None:
    row = con.execute(
        f"SELECT {_THREAD_COLS} FROM chat_threads WHERE scope = ? AND COALESCE(scope_id, '') = ? LIMIT 1",
        (scope, scope_id),
    ).fetchone()
    return _scan_thread(row) if row is not None else None


def get_thread(con: sqlite3.Connection, id: str) -> ChatThread | None:
    """Return one thread by id, or None when absent."""
    row = con.execute(f"SELECT {_THREAD_COLS} FROM chat_threads WHERE id = ?", (id,)).fetchone()
    return _scan_thread(row) if row is not None else None


def list_threads(con: sqlite3.Connection, scope: str) -> list[ChatThread]:
    """Threads for a scope, newest-updated first."""
    rows = con.execute(
        f"SELECT {_THREAD_COLS} FROM chat_threads WHERE scope = ? "
        f"ORDER BY COALESCE(updated_at, created_at) DESC, rowid DESC",
        (scope,),
    ).fetchall()
    return [_scan_thread(r) for r in rows]


def append_message(
    con: sqlite3.Connection, thread_id: str, role: str, content: str, title: str
) -> ChatMessage:
    """Store one turn and return it. The first user line seeds the thread title;
    every append bumps updated_at. Raises NotFound if the thread doesn't exist."""
    if len(content) == 0:
        raise ValueError("chat message content is empty")
    if not _thread_exists(con, thread_id):
        raise errors.NotFound()

    id = new_uuid()
    con.execute(
        "INSERT INTO chat_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)",
        (id, thread_id, role, content),
    )
    # Bump updated_at; set the title only if blank (first user line wins).
    con.execute(
        """UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP,
             title = CASE WHEN (title IS NULL OR title = '') AND ? <> '' THEN ? ELSE title END
         WHERE id = ?""",
        (title, title, thread_id),
    )
    return _read_message(con, id)


def _thread_exists(con: sqlite3.Connection, id: str) -> bool:
    return con.execute("SELECT COUNT(1) FROM chat_threads WHERE id = ?", (id,)).fetchone()[0] > 0


def _read_message(con: sqlite3.Connection, id: str) -> ChatMessage:
    row = con.execute(
        "SELECT id, thread_id, role, content, created_at FROM chat_messages WHERE id = ?", (id,)
    ).fetchone()
    return ChatMessage(id=row[0], thread_id=row[1], role=row[2], content=row[3], created_at=row[4])


def thread_messages(con: sqlite3.Connection, thread_id: str) -> list[ChatMessage]:
    """A thread's messages oldest-first."""
    rows = con.execute(
        "SELECT id, thread_id, role, content, created_at FROM chat_messages "
        "WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC",
        (thread_id,),
    ).fetchall()
    return [
        ChatMessage(id=r[0], thread_id=r[1], role=r[2], content=r[3], created_at=r[4]) for r in rows
    ]
