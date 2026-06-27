"""Cached brain pages bound to outreach knowledge needs."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from ._helpers import tx


@dataclass
class OutreachSource:
    need: str = ""
    page_id: str = ""
    title: str = ""
    content: str = ""
    version: str = ""
    resolved_at: str = ""


def list_outreach_sources(con: sqlite3.Connection) -> list[OutreachSource]:
    """Every cached source, ordered by need then title."""
    rows = con.execute(
        "SELECT need, page_id, title, content, version, resolved_at "
        "FROM outreach_sources ORDER BY need, title"
    ).fetchall()
    return [
        OutreachSource(
            need=r[0], page_id=r[1], title=r[2], content=r[3], version=r[4], resolved_at=r[5]
        )
        for r in rows
    ]


def outreach_knowledge(con: sqlite3.Connection, need: str) -> str:
    """Concatenate the cached text of every page bound to a need. Empty string
    means the need has no resolved sources."""
    rows = con.execute(
        "SELECT title, content FROM outreach_sources WHERE need = ? ORDER BY title", (need,)
    ).fetchall()
    parts: list[str] = []
    for title, content in rows:
        if content.strip() == "":
            continue
        if title != "":
            parts.append(f"# {title}\n\n{content}")
        else:
            parts.append(content)
    return "\n\n---\n\n".join(parts)


def replace_outreach_sources(
    con: sqlite3.Connection, need: str, sources: list[OutreachSource]
) -> None:
    """Swap the cached set for one need in a transaction (delete-all + insert)."""
    with tx(con):
        con.execute("DELETE FROM outreach_sources WHERE need = ?", (need,))
        for s in sources:
            con.execute(
                "INSERT INTO outreach_sources (need, page_id, title, content, version) VALUES (?, ?, ?, ?, ?)",
                (need, s.page_id, s.title, s.content, s.version),
            )


def upsert_outreach_source(con: sqlite3.Connection, s: OutreachSource) -> None:
    """Add or refresh one (need, page_id) row."""
    con.execute(
        """
INSERT INTO outreach_sources (need, page_id, title, content, version, resolved_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(need, page_id) DO UPDATE SET
    title = excluded.title, content = excluded.content,
    version = excluded.version, resolved_at = CURRENT_TIMESTAMP""",
        (s.need, s.page_id, s.title, s.content, s.version),
    )
