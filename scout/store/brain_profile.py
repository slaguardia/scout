"""Cached brain profile (change-aware criteria brief)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass
class BrainProfile:
    source_url: str = ""
    body: str = ""
    content_hash: str = ""
    fetched_at: str = ""
    age_seconds: int = 0
    cursor: str = ""
    verified_at: str = ""
    verified_age_seconds: int = 0


def get_brain_profile(con: sqlite3.Connection, source_url: str) -> BrainProfile | None:
    """Return the cached profile for source_url, or None when nothing is cached."""
    q = """
SELECT source_url, body, content_hash, fetched_at,
       CAST(strftime('%s','now') - strftime('%s', fetched_at) AS INTEGER) AS age_seconds,
       cursor,
       COALESCE(verified_at, '') AS verified_at,
       CASE WHEN verified_at IS NULL THEN -1
            ELSE CAST(strftime('%s','now') - strftime('%s', verified_at) AS INTEGER)
       END AS verified_age_seconds
FROM brain_profile_cache WHERE source_url = ?"""
    row = con.execute(q, (source_url,)).fetchone()
    if row is None:
        return None
    return BrainProfile(
        source_url=row[0],
        body=row[1],
        content_hash=row[2],
        fetched_at=row[3],
        age_seconds=row[4],
        cursor=row[5],
        verified_at=row[6],
        verified_age_seconds=row[7],
    )


def put_brain_profile(
    con: sqlite3.Connection, source_url: str, body: str, content_hash: str, cursor: str
) -> None:
    """Upsert the cached profile — the full write (fresh distill). Stamps both
    fetched_at and verified_at to now and stores the brain's current cursor."""
    con.execute(
        """
INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at, cursor, verified_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
ON CONFLICT(source_url) DO UPDATE SET
    body         = excluded.body,
    content_hash = excluded.content_hash,
    fetched_at   = CURRENT_TIMESTAMP,
    cursor       = excluded.cursor,
    verified_at  = CURRENT_TIMESTAMP""",
        (source_url, body, content_hash, cursor),
    )


def touch_brain_profile(con: sqlite3.Connection, source_url: str, cursor: str) -> None:
    """Record "confirmed unchanged as of now" WITHOUT rewriting the brief: update
    cursor + verified_at = now only. A missing row is a no-op (not an error)."""
    con.execute(
        "UPDATE brain_profile_cache SET cursor = ?, verified_at = CURRENT_TIMESTAMP WHERE source_url = ?",
        (cursor, source_url),
    )
