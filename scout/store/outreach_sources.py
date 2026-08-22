"""The outreach knowledge store: prose docs bound to knowledge needs.

Each row carries an origin — 'brain' for a page the sync whole-fetched, 'local'
for the doc typed in Settings → Knowledge (page_id 'local', at most one per
need). The one rule: a sync may overwrite brain rows and never touches local
ones. Readers concatenate both, so every consumer gets typed knowledge for free.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from ._helpers import tx

ORIGIN_BRAIN = "brain"
ORIGIN_LOCAL = "local"
LOCAL_PAGE_ID = "local"


@dataclass
class OutreachSource:
    need: str = ""
    page_id: str = ""
    title: str = ""
    content: str = ""
    version: str = ""
    resolved_at: str = ""
    origin: str = ORIGIN_BRAIN


def list_outreach_sources(con: sqlite3.Connection) -> list[OutreachSource]:
    """Every source, ordered by need, then local first, then title."""
    rows = con.execute(
        "SELECT need, page_id, title, content, version, resolved_at, origin "
        "FROM outreach_sources ORDER BY need, origin = 'local' DESC, title"
    ).fetchall()
    return [
        OutreachSource(
            need=r[0],
            page_id=r[1],
            title=r[2],
            content=r[3],
            version=r[4],
            resolved_at=r[5],
            origin=r[6],
        )
        for r in rows
    ]


def outreach_knowledge(con: sqlite3.Connection, need: str) -> str:
    """Concatenate the text of every doc bound to a need — the typed doc first,
    then the brain pages. Empty string means the need has nothing on file."""
    rows = con.execute(
        "SELECT title, content FROM outreach_sources WHERE need = ? "
        "ORDER BY origin = 'local' DESC, title",
        (need,),
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
    """Swap the brain-synced set for one need in a transaction (delete-all +
    insert). Only brain rows are replaced — a local row survives every sync."""
    with tx(con):
        con.execute(
            "DELETE FROM outreach_sources WHERE need = ? AND origin = ?", (need, ORIGIN_BRAIN)
        )
        for s in sources:
            con.execute(
                "INSERT INTO outreach_sources (need, page_id, title, content, version, origin) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (need, s.page_id, s.title, s.content, s.version, ORIGIN_BRAIN),
            )


def upsert_outreach_source(con: sqlite3.Connection, s: OutreachSource) -> None:
    """Add or refresh one (need, page_id) row."""
    con.execute(
        """
INSERT INTO outreach_sources (need, page_id, title, content, version, origin, resolved_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(need, page_id) DO UPDATE SET
    title = excluded.title, content = excluded.content, version = excluded.version,
    origin = excluded.origin, resolved_at = CURRENT_TIMESTAMP""",
        (s.need, s.page_id, s.title, s.content, s.version, s.origin or ORIGIN_BRAIN),
    )


def get_local_source(con: sqlite3.Connection, need: str) -> str:
    """The typed doc for a need, or "" when none has been saved."""
    row = con.execute(
        "SELECT content FROM outreach_sources WHERE need = ? AND page_id = ?",
        (need, LOCAL_PAGE_ID),
    ).fetchone()
    return row[0] if row is not None else ""


def put_local_source(con: sqlite3.Connection, need: str, content: str) -> None:
    """Save the typed doc for a need. Blank content removes the row, so "nothing
    typed" and "cleared" look the same to every reader."""
    if content.strip() == "":
        con.execute(
            "DELETE FROM outreach_sources WHERE need = ? AND page_id = ?", (need, LOCAL_PAGE_ID)
        )
        return
    upsert_outreach_source(
        con,
        OutreachSource(need=need, page_id=LOCAL_PAGE_ID, content=content, origin=ORIGIN_LOCAL),
    )
