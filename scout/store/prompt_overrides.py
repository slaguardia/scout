"""Per-stage outreach prompt overrides + on/off flags."""

from __future__ import annotations

import sqlite3


def get_stage(con: sqlite3.Connection, stage: str) -> tuple[str, bool]:
    """Return (content, enabled) for a stage's saved prompt override. No row →
    ("", True): the compiled-in default prompt, stage on."""
    row = con.execute(
        "SELECT content, enabled FROM prompt_overrides WHERE stage = ?", (stage,)
    ).fetchone()
    if row is None:
        return "", True
    return row[0], row[1] != 0


def put_prompt_override(con: sqlite3.Connection, stage: str, content: str) -> None:
    """Upsert a stage's prompt override (content). A new row defaults enabled=1."""
    con.execute(
        """
INSERT INTO prompt_overrides (stage, content, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(stage) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP""",
        (stage, content),
    )


def set_stage_enabled(con: sqlite3.Connection, stage: str, enabled: bool) -> None:
    """Upsert a stage's on/off flag, leaving any content override untouched."""
    con.execute(
        """
INSERT INTO prompt_overrides (stage, enabled, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(stage) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP""",
        (stage, 1 if enabled else 0),
    )


def reset_stage_content(con: sqlite3.Connection, stage: str) -> None:
    """Clear a stage's content override (revert to the compiled-in default),
    leaving its enabled flag in place."""
    con.execute(
        "UPDATE prompt_overrides SET content = '', updated_at = CURRENT_TIMESTAMP WHERE stage = ?",
        (stage,),
    )
