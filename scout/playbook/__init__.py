"""Package playbook loads the verdict agent's operating manual.

The playbook is the *how* of triage — procedural instructions for making the call
(handling ambiguity, weak signal, tie-breaking) — as opposed to taste (the *what*:
the user's preferences) and the brain (memory).

It lives in the DB (a singleton row) so a dashboard save can't clobber it and git
never touches it, same as the outreach template. An empty/absent row means "use
the compiled-in default" (DEFAULT_PLAYBOOK, the shipped default.md). The playbook
only augments the system prompt; it never changes the hard JSON-output contract.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from scout.store import playbook as store_playbook

# DEFAULT_PLAYBOOK is the compiled-in starting playbook (the shipped judging
# procedure), used until the user saves their own. Kept as a reviewable markdown
# file so the default is a single source of truth.
DEFAULT_PLAYBOOK = (Path(__file__).parent / "default.md").read_text(encoding="utf-8")


def content_or_default(con: sqlite3.Connection | None) -> str:
    """The user's saved playbook, or the compiled-in default when none is saved
    (or on a read error — scoring never blocks on this)."""
    if con is not None:
        try:
            c = store_playbook.get_playbook(con)
        except Exception:  # noqa: BLE001 - a read failure must fall back, not block scoring
            c = ""
        if c.strip():
            return c.strip()
    return DEFAULT_PLAYBOOK.strip()
