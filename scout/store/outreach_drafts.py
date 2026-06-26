"""Outreach draft pipeline rows. Port of internal/store/outreach_drafts.go."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from . import errors
from ._helpers import tx

# Draft statuses. Terminal: sent, failed, superseded.
# Active (at most one per posting): researching, awaiting_review, needs_work, no_hook.
DRAFT_RESEARCHING = "researching"
DRAFT_AWAITING_REVIEW = "awaiting_review"
DRAFT_NEEDS_WORK = "needs_work"
DRAFT_NO_HOOK = "no_hook"
DRAFT_SENT = "sent"
DRAFT_FAILED = "failed"
DRAFT_SUPERSEDED = "superseded"


@dataclass
class OutreachDraft:
    id: int = 0
    posting_id: str = ""
    status: str = ""
    stage: str = ""
    research: str = ""
    hook: str = ""
    draft: str = ""
    edited: str = ""
    lint: str = ""
    violations: str = ""
    critique: str = ""
    fail_reason: str = ""
    created_at: str = ""
    updated_at: str = ""
    sent_at: str = ""


_DRAFT_COLS = (
    "id, posting_id, status, stage, research, hook, draft, edited, lint, "
    "violations, critique, fail_reason, created_at, updated_at, COALESCE(sent_at, '')"
)


def _scan_draft(row) -> OutreachDraft:
    return OutreachDraft(
        id=row[0], posting_id=row[1], status=row[2], stage=row[3], research=row[4],
        hook=row[5], draft=row[6], edited=row[7], lint=row[8], violations=row[9],
        critique=row[10], fail_reason=row[11], created_at=row[12], updated_at=row[13], sent_at=row[14],
    )


def _must_affect(cur: sqlite3.Cursor) -> None:
    if cur.rowcount == 0:
        raise errors.NotFound()


def _insert_draft(con: sqlite3.Connection, posting_id: str) -> OutreachDraft:
    """Insert a fresh researching draft and return it (within the caller's tx)."""
    cur = con.execute("INSERT INTO outreach_drafts (posting_id) VALUES (?)", (posting_id,))
    row = con.execute(f"SELECT {_DRAFT_COLS} FROM outreach_drafts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _scan_draft(row)


def create_outreach_draft(con: sqlite3.Connection, posting_id: str) -> OutreachDraft:
    """Start a new draft for a posting. Raises NotFound for an unknown posting and
    ValueError ("active draft") when one is already in a non-terminal status."""
    with tx(con):
        if con.execute("SELECT COUNT(1) FROM job_postings WHERE id = ?", (posting_id,)).fetchone()[0] == 0:
            raise errors.NotFound()
        active = con.execute(
            "SELECT COUNT(1) FROM outreach_drafts WHERE posting_id = ? AND status IN (?, ?, ?, ?)",
            (posting_id, DRAFT_RESEARCHING, DRAFT_AWAITING_REVIEW, DRAFT_NEEDS_WORK, DRAFT_NO_HOOK),
        ).fetchone()[0]
        if active > 0:
            raise ValueError(f"posting {posting_id} already has an active draft")
        d = _insert_draft(con, posting_id)
    return d


def regenerate_outreach_draft(con: sqlite3.Connection, posting_id: str) -> OutreachDraft:
    """Retire the posting's current reviewable draft (→ superseded) and start a
    fresh one, carrying the most recent research forward. Refuses while a draft is
    still researching."""
    with tx(con):
        if con.execute("SELECT COUNT(1) FROM job_postings WHERE id = ?", (posting_id,)).fetchone()[0] == 0:
            raise errors.NotFound()
        researching = con.execute(
            "SELECT COUNT(1) FROM outreach_drafts WHERE posting_id = ? AND status = ?",
            (posting_id, DRAFT_RESEARCHING),
        ).fetchone()[0]
        if researching > 0:
            raise ValueError(f"posting {posting_id} already has an active draft")

        prior_row = con.execute(
            "SELECT COALESCE(research, '') FROM outreach_drafts "
            "WHERE posting_id = ? AND COALESCE(research, '') != '' ORDER BY id DESC LIMIT 1",
            (posting_id,),
        ).fetchone()
        prior_research = prior_row[0] if prior_row is not None else ""

        con.execute(
            "UPDATE outreach_drafts SET status = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE posting_id = ? AND status IN (?, ?, ?)",
            (DRAFT_SUPERSEDED, posting_id, DRAFT_AWAITING_REVIEW, DRAFT_NEEDS_WORK, DRAFT_NO_HOOK),
        )

        d = _insert_draft(con, posting_id)
        if prior_research != "":
            con.execute("UPDATE outreach_drafts SET research = ? WHERE id = ?", (prior_research, d.id))
            d.research = prior_research
    return d


def get_outreach_draft(con: sqlite3.Connection, id: int) -> OutreachDraft | None:
    """Return one draft, or None when absent."""
    row = con.execute(f"SELECT {_DRAFT_COLS} FROM outreach_drafts WHERE id = ?", (id,)).fetchone()
    return _scan_draft(row) if row is not None else None


def list_outreach_drafts(con: sqlite3.Connection, posting_id: str) -> list[OutreachDraft]:
    """A posting's drafts, newest first."""
    rows = con.execute(
        f"SELECT {_DRAFT_COLS} FROM outreach_drafts WHERE posting_id = ? ORDER BY id DESC",
        (posting_id,),
    ).fetchall()
    return [_scan_draft(r) for r in rows]


def set_outreach_draft_stage(con: sqlite3.Connection, id: int, stage: str) -> None:
    """Record which pipeline step an in-flight draft is on."""
    cur = con.execute(
        "UPDATE outreach_drafts SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (stage, id)
    )
    _must_affect(cur)


def set_outreach_draft_result(
    con: sqlite3.Connection, id: int, status: str, research: str, hook: str,
    draft: str, lint: str, violations: str, critique: str, fail_reason: str,
) -> None:
    """Record a pipeline outcome: the new status plus any stage outputs."""
    cur = con.execute(
        "UPDATE outreach_drafts SET "
        "status = ?, stage = '', research = ?, hook = ?, draft = ?, lint = ?, violations = ?, "
        "critique = ?, fail_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, research, hook, draft, lint, violations, critique, fail_reason, id),
    )
    _must_affect(cur)


def set_outreach_draft_edited(con: sqlite3.Connection, id: int, edited: str, lint: str) -> None:
    """Store the user's revision and its lint findings."""
    cur = con.execute(
        "UPDATE outreach_drafts SET edited = ?, lint = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (edited, lint, id),
    )
    _must_affect(cur)


def mark_outreach_draft_sent(con: sqlite3.Connection, id: int) -> OutreachDraft:
    """Flip a draft to sent and stamp sent_at. Idempotent: an already-sent draft
    returns itself; only a missing row raises NotFound."""
    cur = con.execute(
        "UPDATE outreach_drafts SET status = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ? AND status != ?",
        (DRAFT_SENT, id, DRAFT_SENT),
    )
    if cur.rowcount == 0:
        row = con.execute(f"SELECT {_DRAFT_COLS} FROM outreach_drafts WHERE id = ?", (id,)).fetchone()
        if row is not None:
            d = _scan_draft(row)
            if d.status == DRAFT_SENT:
                return d
        raise errors.NotFound()
    row = con.execute(f"SELECT {_DRAFT_COLS} FROM outreach_drafts WHERE id = ?", (id,)).fetchone()
    return _scan_draft(row)


def reap_stuck_outreach_drafts(con: sqlite3.Connection, older_than_minutes: int) -> int:
    """Fail any draft stuck in `researching` longer than older_than_minutes
    (0 = all). Returns the number reaped."""
    cur = con.execute(
        "UPDATE outreach_drafts SET "
        "status = ?, fail_reason = 'interrupted — scout restarted mid-run', updated_at = CURRENT_TIMESTAMP "
        "WHERE status = ? AND updated_at <= datetime('now', ?)",
        (DRAFT_FAILED, DRAFT_RESEARCHING, f"-{older_than_minutes} minutes"),
    )
    return cur.rowcount
