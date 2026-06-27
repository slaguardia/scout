"""Application-form questions + drafted answers."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from . import errors
from ._helpers import tx

# Answer statuses.
ANSWER_DETECTED = "detected"
ANSWER_GENERATING = "generating"
ANSWER_READY = "ready"
ANSWER_NEEDS_REVIEW = "needs_review"
ANSWER_FAILED = "failed"


@dataclass
class DetectedQuestion:
    """One essay question a capture-side resolver found, in the shape the store
    ingests (kept store-local so the store never imports capture)."""

    key: str = ""  # ATS field id/path; "" when unknown
    prompt: str = ""  # the question text shown to the applicant
    max_length: int = 0  # char limit when the ATS declares one; 0 = unknown


@dataclass
class PostingAnswer:
    id: int = 0
    posting_id: str = ""
    q_key: str = ""
    prompt: str = ""
    max_length: int = 0
    answer: str = ""
    edited: str = ""
    status: str = ""
    fail_reason: str = ""
    created_at: str = ""
    updated_at: str = ""


_ANSWER_COLS = "id, posting_id, q_key, prompt, max_length, answer, edited, status, fail_reason, created_at, updated_at"


def _scan_answer(row) -> PostingAnswer:
    return PostingAnswer(
        id=row[0],
        posting_id=row[1],
        q_key=row[2],
        prompt=row[3],
        max_length=row[4],
        answer=row[5],
        edited=row[6],
        status=row[7],
        fail_reason=row[8],
        created_at=row[9],
        updated_at=row[10],
    )


def _must_affect(cur: sqlite3.Cursor) -> None:
    if cur.rowcount == 0:
        raise errors.NotFound()


def upsert_detected_questions(
    con: sqlite3.Connection, posting_id: str, qs: list[DetectedQuestion], status: str
) -> None:
    """Record a detection pass: insert any newly-found questions and stamp the
    posting's questions_status/questions_at, without touching an existing
    question's answer/edited/status. Raises NotFound when the posting is absent."""
    with tx(con):
        if (
            con.execute("SELECT COUNT(1) FROM job_postings WHERE id = ?", (posting_id,)).fetchone()[
                0
            ]
            == 0
        ):
            raise errors.NotFound()
        for q in qs:
            prompt = q.prompt.strip()
            if prompt == "":
                continue  # a question with no prompt is not answerable — skip it
            ml = q.max_length if q.max_length >= 0 else 0
            con.execute(
                "INSERT INTO posting_answers (posting_id, q_key, prompt, max_length) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT(posting_id, q_key, prompt) DO NOTHING",
                (posting_id, q.key.strip(), prompt, ml),
            )
        con.execute(
            "UPDATE job_postings SET questions_status = ?, questions_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, posting_id),
        )


def list_answers(con: sqlite3.Connection, posting_id: str) -> list[PostingAnswer]:
    """A posting's questions+answers in form order (oldest id first)."""
    rows = con.execute(
        f"SELECT {_ANSWER_COLS} FROM posting_answers WHERE posting_id = ? ORDER BY id ASC",
        (posting_id,),
    ).fetchall()
    return [_scan_answer(r) for r in rows]


def get_answer(con: sqlite3.Connection, id: int) -> PostingAnswer | None:
    """Return one answer row, or None when absent."""
    row = con.execute(f"SELECT {_ANSWER_COLS} FROM posting_answers WHERE id = ?", (id,)).fetchone()
    return _scan_answer(row) if row is not None else None


def mark_answers_generating(con: sqlite3.Connection, posting_id: str) -> list[PostingAnswer]:
    """Flip every not-yet-answered question (no answer, no edit, status
    detected/failed) to `generating` and return the full set now in flight
    (including any left in generating by an interrupted run)."""
    con.execute(
        "UPDATE posting_answers SET status = ?, fail_reason = '', updated_at = CURRENT_TIMESTAMP "
        "WHERE posting_id = ? AND edited = '' AND answer = '' AND status IN (?, ?)",
        (ANSWER_GENERATING, posting_id, ANSWER_DETECTED, ANSWER_FAILED),
    )
    rows = con.execute(
        f"SELECT {_ANSWER_COLS} FROM posting_answers WHERE posting_id = ? AND status = ? ORDER BY id ASC",
        (posting_id, ANSWER_GENERATING),
    ).fetchall()
    return [_scan_answer(r) for r in rows]


def update_answer(
    con: sqlite3.Connection, id: int, answer: str, status: str, fail_reason: str
) -> None:
    """Record a generation outcome for one question."""
    cur = con.execute(
        "UPDATE posting_answers SET answer = ?, status = ?, fail_reason = ?, updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ?",
        (answer, status, fail_reason, id),
    )
    _must_affect(cur)


def edit_answer(con: sqlite3.Connection, id: int, edited: str) -> PostingAnswer:
    """Store the user's inline edit (wins over the generated answer). An empty
    string clears the edit."""
    cur = con.execute(
        "UPDATE posting_answers SET edited = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (edited, id),
    )
    _must_affect(cur)
    return _scan_answer(
        con.execute(f"SELECT {_ANSWER_COLS} FROM posting_answers WHERE id = ?", (id,)).fetchone()
    )


def regenerate_answer(con: sqlite3.Connection, id: int) -> PostingAnswer:
    """Clear one question (answer + edit) and flip it to `generating` for a fresh
    single-question draft."""
    cur = con.execute(
        "UPDATE posting_answers SET answer = '', edited = '', fail_reason = '', status = ?, "
        "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (ANSWER_GENERATING, id),
    )
    _must_affect(cur)
    return _scan_answer(
        con.execute(f"SELECT {_ANSWER_COLS} FROM posting_answers WHERE id = ?", (id,)).fetchone()
    )


def delete_answer(con: sqlite3.Connection, id: int) -> None:
    """Hard-delete one detected question (and any draft/edit on it). Raises
    NotFound when the id doesn't exist."""
    cur = con.execute("DELETE FROM posting_answers WHERE id = ?", (id,))
    _must_affect(cur)


def reap_stuck_answers(con: sqlite3.Connection, older_than_minutes: int) -> int:
    """Fail any answer stuck in `generating` longer than older_than_minutes
    (0 = all). Returns the number reaped."""
    cur = con.execute(
        "UPDATE posting_answers SET "
        "status = ?, fail_reason = 'interrupted — scout restarted mid-run', updated_at = CURRENT_TIMESTAMP "
        "WHERE status = ? AND updated_at <= datetime('now', ?)",
        (ANSWER_FAILED, ANSWER_GENERATING, f"-{older_than_minutes} minutes"),
    )
    return cur.rowcount
