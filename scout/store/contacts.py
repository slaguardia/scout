"""Company-level contacts + per-contact outreach log (M51).
Port of internal/store/contacts.go.
"""
from __future__ import annotations

import datetime
import sqlite3
from dataclasses import dataclass

from . import companies as companies_mod
from . import errors, settings, statuses
from ._helpers import new_uuid, tx

# FollowupIntervalSetting holds the default number of business days after a send
# to arm a follow-up (0 = don't auto-arm).
FOLLOWUP_INTERVAL_SETTING = "followup_interval_days"

_DEFAULT_FOLLOWUP_INTERVAL_DAYS = 5
_MAX_FOLLOWUP_INTERVAL_DAYS = 90
_MAX_CONTACT_FIELD_LEN = 200


class DuplicateContact(Exception):
    """A contact with the same email already exists at the company (→ HTTP 409).

    Mirrors Go's store.ErrDuplicateContact, defined module-local like the Go
    sentinel (which lives in contacts.go, not a shared errors file)."""

    def __init__(self, message: str = "a contact with that email already exists for this company"):
        super().__init__(message)


@dataclass
class Contact:
    id: str = ""
    company_id: str = ""
    name: str = ""
    role: str = ""
    email: str = ""
    created_at: str = ""
    updated_at: str = ""


@dataclass
class ContactInput:
    name: str = ""
    role: str = ""
    email: str = ""


def _clean_contact(inp: ContactInput) -> ContactInput:
    name = inp.name.strip()
    role = inp.role.strip()
    email = inp.email.strip().lower()
    if name == "" and email == "":
        raise ValueError("contact needs a name or an email")
    if (len(name) > _MAX_CONTACT_FIELD_LEN or len(role) > _MAX_CONTACT_FIELD_LEN
            or len(email) > _MAX_CONTACT_FIELD_LEN):
        raise ValueError("contact field is too long")
    return ContactInput(name=name, role=role, email=email)


_CONTACT_COLS = (
    "id, company_id, COALESCE(name, ''), COALESCE(role, ''), COALESCE(email, ''), created_at, updated_at"
)


def _scan_contact(row) -> Contact:
    return Contact(id=row[0], company_id=row[1], name=row[2], role=row[3],
                   email=row[4], created_at=row[5], updated_at=row[6])


def _read_contact(con: sqlite3.Connection, id: str) -> Contact:
    return _scan_contact(con.execute(f"SELECT {_CONTACT_COLS} FROM contacts WHERE id = ?", (id,)).fetchone())


def list_contacts(con: sqlite3.Connection, company_id: str) -> list[Contact]:
    """A company's active contacts, name-first."""
    rows = con.execute(
        f"SELECT {_CONTACT_COLS} FROM contacts "
        f"WHERE company_id = ? AND archived_at IS NULL "
        f"ORDER BY name COLLATE NOCASE, role COLLATE NOCASE, email COLLATE NOCASE",
        (company_id,),
    ).fetchall()
    return [_scan_contact(r) for r in rows]


def get_contact(con: sqlite3.Connection, id: str) -> Contact | None:
    """One active contact by id, or None when unknown/archived."""
    row = con.execute(
        f"SELECT {_CONTACT_COLS} FROM contacts WHERE id = ? AND archived_at IS NULL", (id,)
    ).fetchone()
    return _scan_contact(row) if row is not None else None


def find_contact_by_email(con: sqlite3.Connection, email: str) -> Contact | None:
    """The active contact with this email (case-insensitive), across all companies —
    the read-sync's outreach-vs-application router keys on it. None when unknown.
    The newest match wins if (improbably) two companies share an address."""
    email = email.strip().lower()
    if email == "":
        return None
    row = con.execute(
        f"SELECT {_CONTACT_COLS} FROM contacts WHERE email = ? AND archived_at IS NULL "
        f"ORDER BY created_at DESC LIMIT 1",
        (email,),
    ).fetchone()
    return _scan_contact(row) if row is not None else None


def create_contact(con: sqlite3.Connection, company_id: str, inp: ContactInput) -> Contact:
    """Add a company contact. Raises NotFound for an unknown company and
    DuplicateContact when an active contact already has that email. An archived
    contact with the same email is revived in place."""
    inp = _clean_contact(inp)
    if not companies_mod.company_exists(con, company_id):
        raise errors.NotFound()
    if inp.email != "":
        row = con.execute(
            "SELECT id, archived_at FROM contacts WHERE company_id = ? AND email = ?",
            (company_id, inp.email),
        ).fetchone()
        if row is not None:
            existing_id, archived = row[0], row[1]
            if archived is None:
                raise DuplicateContact()
            con.execute(
                "UPDATE contacts SET name = ?, role = ?, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (inp.name, inp.role, existing_id),
            )
            return _read_contact(con, existing_id)
    id = new_uuid()
    try:
        con.execute(
            "INSERT INTO contacts (id, company_id, name, role, email) VALUES (?, ?, ?, ?, ?)",
            (id, company_id, inp.name, inp.role, inp.email),
        )
    except sqlite3.IntegrityError:
        raise DuplicateContact()
    return _read_contact(con, id)


def update_contact(con: sqlite3.Connection, id: str, inp: ContactInput) -> Contact:
    """Edit an active contact. Raises NotFound for an unknown/archived id;
    DuplicateContact when the new email collides with another contact."""
    inp = _clean_contact(inp)
    try:
        cur = con.execute(
            "UPDATE contacts SET name = ?, role = ?, email = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND archived_at IS NULL",
            (inp.name, inp.role, inp.email, id),
        )
    except sqlite3.IntegrityError:
        raise DuplicateContact()
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_contact(con, id)


def archive_contact(con: sqlite3.Connection, id: str) -> None:
    """Soft-delete a contact (its outreach log is left intact). Raises NotFound
    for an unknown/already-archived id."""
    cur = con.execute(
        "UPDATE contacts SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ? AND archived_at IS NULL",
        (id,),
    )
    if cur.rowcount == 0:
        raise errors.NotFound()


def followup_interval_days(con: sqlite3.Connection) -> int:
    """The configured business-day follow-up interval, falling back to the
    default for an unset/garbage value. 0 means "don't auto-arm.\""""
    v = settings.get_setting(con, FOLLOWUP_INTERVAL_SETTING).strip()
    if v == "":
        return _DEFAULT_FOLLOWUP_INTERVAL_DAYS
    try:
        n = int(v)
    except ValueError:
        return _DEFAULT_FOLLOWUP_INTERVAL_DAYS
    if n < 0:
        return _DEFAULT_FOLLOWUP_INTERVAL_DAYS
    if n > _MAX_FOLLOWUP_INTERVAL_DAYS:
        n = _MAX_FOLLOWUP_INTERVAL_DAYS
    return n


def set_followup_interval_days(con: sqlite3.Connection, n: int) -> None:
    """Store the follow-up interval (0–90 business days)."""
    if n < 0 or n > _MAX_FOLLOWUP_INTERVAL_DAYS:
        raise ValueError(f"follow-up interval must be 0–{_MAX_FOLLOWUP_INTERVAL_DAYS} days")
    settings.set_setting(con, FOLLOWUP_INTERVAL_SETTING, str(n))


def _add_business_days(d: datetime.date, n: int) -> datetime.date:
    """Advance d by n weekdays (skips Sat/Sun). n <= 0 returns d."""
    while n > 0:
        d = d + datetime.timedelta(days=1)
        if d.weekday() not in (5, 6):  # 5=Sat, 6=Sun
            n -= 1
    return d


@dataclass
class OutreachEntry:
    id: int = 0
    contact_id: str = ""
    posting_id: str = ""
    sent_at: str = ""
    body: str = ""
    note: str = ""
    followup_due_at: str = ""
    followup_done_at: str = ""


@dataclass
class OutreachInput:
    sent_at: str = ""
    body: str = ""
    note: str = ""
    followup_due_at: str = ""
    no_followup: bool = False
    # Gmail link (M55): set when the send went out via — or was synced from —
    # Gmail. The partial unique index on a non-empty gmail_message_id dedupes a
    # send that the read-poll later sees in the mailbox.
    gmail_message_id: str = ""
    gmail_thread_id: str = ""


# sent_at is a DATE column; date() normalizes it to a bare ISO date so it
# round-trips through _parse_date on a PUT.
_OUTREACH_LOG_COLS = (
    "id, contact_id, posting_id, COALESCE(date(sent_at), ''), COALESCE(body, ''), "
    "COALESCE(note, ''), COALESCE(followup_due_at, ''), COALESCE(followup_done_at, '')"
)


def _scan_outreach_entry(row) -> OutreachEntry:
    return OutreachEntry(id=row[0], contact_id=row[1], posting_id=row[2], sent_at=row[3],
                         body=row[4], note=row[5], followup_due_at=row[6], followup_done_at=row[7])


def _read_outreach_entry(con: sqlite3.Connection, id: int) -> OutreachEntry:
    return _scan_outreach_entry(
        con.execute(f"SELECT {_OUTREACH_LOG_COLS} FROM outreach_log WHERE id = ?", (id,)).fetchone()
    )


def _parse_date(field_name: str, s: str) -> str:
    s = s.strip()
    if s == "":
        return ""
    try:
        datetime.datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"{field_name} must be a YYYY-MM-DD date")
    return s


def log_outreach(con: sqlite3.Connection, posting_id: str, contact_id: str, inp: OutreachInput) -> OutreachEntry:
    """Record a send to a contact about a posting, arm its follow-up, and clear
    the posting's "next up" to-do. Validation errors carry the field name."""
    sent = _parse_date("sent_at", inp.sent_at)
    due = _parse_date("followup_due_at", inp.followup_due_at)

    # The contact must exist, be active, and belong to the posting's company.
    ok = con.execute(
        "SELECT 1 FROM contacts c JOIN job_postings p ON p.company_id = c.company_id "
        "WHERE c.id = ? AND p.id = ? AND c.archived_at IS NULL",
        (contact_id, posting_id),
    ).fetchone()
    if ok is None:
        raise ValueError("contact not found for this posting's company")

    if sent == "":
        sent = datetime.date.today().strftime("%Y-%m-%d")

    # Logging a send seeds the posting's outreach_status to the first configured
    # label when blank (never overwriting a hand-set value). Resolved before the
    # tx so a settings read isn't inside it.
    first_status = ""
    labels = statuses.outreach_statuses(con)
    if labels:
        first_status = labels[0]

    if inp.no_followup:
        due_val = None
    elif due != "":
        due_val = due
    else:
        n = followup_interval_days(con)
        if n > 0:
            base = datetime.datetime.strptime(sent, "%Y-%m-%d").date()
            due_val = _add_business_days(base, n).strftime("%Y-%m-%d")
        else:
            due_val = None

    with tx(con):
        cur = con.execute(
            "INSERT INTO outreach_log "
            "(contact_id, posting_id, sent_at, body, note, followup_due_at, gmail_message_id, gmail_thread_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (contact_id, posting_id, sent, inp.body.strip(), inp.note.strip(), due_val,
             inp.gmail_message_id, inp.gmail_thread_id),
        )
        new_id = cur.lastrowid
        con.execute("UPDATE job_postings SET next_up_at = NULL WHERE id = ?", (posting_id,))
        if first_status != "":
            con.execute(
                "UPDATE job_postings SET outreach_status = ? WHERE id = ? AND COALESCE(outreach_status, '') = ''",
                (first_status, posting_id),
            )
    return _read_outreach_entry(con, new_id)


def list_outreach_for_posting(con: sqlite3.Connection, posting_id: str) -> list[OutreachEntry]:
    """A posting's send log, newest first."""
    rows = con.execute(
        f"SELECT {_OUTREACH_LOG_COLS} FROM outreach_log WHERE posting_id = ? ORDER BY sent_at DESC, id DESC",
        (posting_id,),
    ).fetchall()
    return [_scan_outreach_entry(r) for r in rows]


@dataclass
class OutreachEntryEdit:
    sent_at: str = ""
    body: str = ""
    note: str = ""
    followup_due_at: str = ""
    done: bool = False


def update_outreach_entry(con: sqlite3.Connection, id: int, e: OutreachEntryEdit) -> OutreachEntry:
    """Edit a logged send. Raises NotFound for an unknown id."""
    sent = _parse_date("sent_at", e.sent_at)
    due = _parse_date("followup_due_at", e.followup_due_at)
    due_val: str | None = due if due != "" else None

    # Marking a follow-up done arms the second rung: the due date walks forward to
    # the escalation. Only on the not-done→done transition.
    row = con.execute("SELECT COALESCE(followup_done_at, '') FROM outreach_log WHERE id = ?", (id,)).fetchone()
    cur_done = row[0] if row is not None else ""
    if cur_done == "" and e.done:
        n = followup_interval_days(con)
        if n > 0:
            due_val = _add_business_days(datetime.date.today(), n).strftime("%Y-%m-%d")
        else:
            due_val = None

    # COALESCE preserves an existing done timestamp; reopening clears it.
    done_expr = "COALESCE(followup_done_at, CURRENT_TIMESTAMP)" if e.done else "NULL"
    args: list = [e.body.strip(), e.note.strip(), due_val]
    q = f"UPDATE outreach_log SET body = ?, note = ?, followup_due_at = ?, followup_done_at = {done_expr}"
    if sent != "":
        q += ", sent_at = ?"
        args.append(sent)
    q += " WHERE id = ?"
    args.append(id)
    cur = con.execute(q, args)
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_outreach_entry(con, id)


def delete_outreach_entry(con: sqlite3.Connection, id: int) -> None:
    """Remove a logged send. Raises NotFound for an unknown id."""
    cur = con.execute("DELETE FROM outreach_log WHERE id = ?", (id,))
    if cur.rowcount == 0:
        raise errors.NotFound()


@dataclass
class FollowupDue:
    log_id: int = 0
    posting_id: str = ""
    contact_id: str = ""
    contact_name: str = ""
    role: str = ""
    company: str = ""
    due_at: str = ""


def followups_due(con: sqlite3.Connection) -> list[FollowupDue]:
    """The active follow-ups that are due/overdue — folded into the notifications
    panel. Mirrors the jobs-view badge gating exactly: the latest send on its
    (contact, posting), followup_due_at arrived, and the posting still awaiting a
    reply (outreach_status blank or the first configured label). Soonest first."""
    first_status = ""
    labels = statuses.outreach_statuses(con)
    if labels:
        first_status = labels[0]
    rows = con.execute(
        """
        SELECT ol.id, ol.posting_id, ol.contact_id, ol.followup_due_at,
               COALESCE(ct.name, ''), COALESCE(ct.email, ''),
               COALESCE(p.title, ''), COALESCE(co.name, '')
        FROM outreach_log ol
        JOIN job_postings p ON p.id = ol.posting_id
        JOIN companies co ON co.id = p.company_id
        LEFT JOIN contacts ct ON ct.id = ol.contact_id
        WHERE ol.followup_due_at IS NOT NULL
          AND ol.followup_due_at <= DATE('now')
          AND COALESCE(p.outreach_status, '') IN ('', ?)
          AND ol.id = (SELECT MAX(ol2.id) FROM outreach_log ol2
                       WHERE ol2.contact_id = ol.contact_id AND ol2.posting_id = ol.posting_id)
        ORDER BY ol.followup_due_at ASC, ol.id ASC
        """,
        (first_status,),
    ).fetchall()
    return [
        FollowupDue(
            log_id=r[0], posting_id=r[1], contact_id=r[2], due_at=r[3],
            contact_name=r[4] or r[5], role=r[6], company=r[7],
        )
        for r in rows
    ]
