"""Job postings — the jobs view + application tracker. Port of internal/store/postings.go."""
from __future__ import annotations

import sqlite3
import urllib.parse
from dataclasses import dataclass

from . import companies, errors, statuses
from ._helpers import new_uuid
from .statuses import MAX_STATUS_LABEL_LEN


def _clean_status_label(field_name: str, s: str) -> str:
    """Trim a configurable status label (outreach reply status or application
    stage). Only a length bound is enforced; the error is prefixed with the field
    name so the web layer can map it to a 400."""
    s = s.strip()
    if len(s) > MAX_STATUS_LABEL_LEN:
        raise ValueError(f"{field_name} label is too long")
    return s


def validate_posting_url(url: str) -> str:
    """Trim and validate a posting link: it must be a non-empty http(s) URL.
    Errors start with "url " so the web handler maps them to HTTP 400."""
    url = url.strip()
    if url == "":
        raise ValueError("url required")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("url must be http(s)")
    return url


@dataclass
class Posting:
    id: str = ""
    company_id: str = ""
    url: str = ""
    title: str = ""
    location: str = ""
    source: str = "manual"
    fetch_status: str = ""
    created_at: str = ""
    captured_at: str = ""
    posted_at: str = ""
    employment_type: str = ""
    workplace_type: str = ""
    department: str = ""
    comp_range: str = ""
    description: str = ""
    application_status: str = ""
    outreach_count: int = 0
    last_outreach_at: str = ""
    outreach_status: str = ""
    notes: str = ""
    next_up: bool = False
    questions_status: str = ""
    questions_at: str = ""


# Shared SELECT list; keep in sync with _scan_posting.
_POSTING_COLS = """id, company_id, url, COALESCE(title, ''), COALESCE(location, ''),
       COALESCE(source, 'manual'), COALESCE(fetch_status, ''),
       created_at, COALESCE(captured_at, ''),
       COALESCE(posted_at, ''), COALESCE(employment_type, ''), COALESCE(workplace_type, ''),
       COALESCE(department, ''), COALESCE(comp_range, ''), COALESCE(description, ''),
       COALESCE(application_status, ''),
       (SELECT COUNT(*) FROM outreach_log ol WHERE ol.posting_id = job_postings.id),
       COALESCE((SELECT MAX(COALESCE(date(ol.followup_done_at), ol.sent_at)) FROM outreach_log ol WHERE ol.posting_id = job_postings.id), ''),
       COALESCE(outreach_status, ''),
       COALESCE(notes, ''), next_up_at,
       COALESCE(questions_status, ''), COALESCE(questions_at, '')"""


def _scan_posting(row) -> Posting:
    return Posting(
        id=row[0], company_id=row[1], url=row[2], title=row[3], location=row[4],
        source=row[5], fetch_status=row[6], created_at=row[7], captured_at=row[8],
        posted_at=row[9], employment_type=row[10], workplace_type=row[11],
        department=row[12], comp_range=row[13], description=row[14],
        application_status=row[15], outreach_count=row[16], last_outreach_at=row[17],
        outreach_status=row[18], notes=row[19], next_up=row[20] is not None,
        questions_status=row[21], questions_at=row[22],
    )


def _read_posting(con: sqlite3.Connection, id: str) -> Posting:
    row = con.execute(f"SELECT {_POSTING_COLS} FROM job_postings WHERE id = ?", (id,)).fetchone()
    return _scan_posting(row)


def add_posting(con: sqlite3.Connection, company_id: str, url: str, title: str) -> Posting:
    """Insert a hand-added posting (source "manual"). The URL is the posting's
    identity: re-adding a tracked link returns the existing row (backfilling a
    blank title). Raises NotFound if the company doesn't exist."""
    url = validate_posting_url(url)
    title = title.strip()

    row = con.execute(
        "SELECT id FROM job_postings WHERE url = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (url,),
    ).fetchone()
    if row is not None:
        existing_id = row[0]
        if title != "":
            con.execute(
                "UPDATE job_postings SET title = ? WHERE id = ? AND (title IS NULL OR title = '')",
                (title, existing_id),
            )
        return _read_posting(con, existing_id)

    if not companies.company_exists(con, company_id):
        raise errors.NotFound()

    id = new_uuid()
    con.execute(
        "INSERT INTO job_postings (id, company_id, url, title, source) VALUES (?, ?, ?, ?, 'manual')",
        (id, company_id, url, title or None),
    )
    return _read_posting(con, id)


@dataclass
class CapturedPosting:
    company_id: str = ""
    url: str = ""
    pasted_url: str = ""
    title: str = ""
    location: str = ""
    fetch_status: str = ""
    posted_at: str = ""
    employment_type: str = ""
    workplace_type: str = ""
    department: str = ""
    comp_range: str = ""
    description: str = ""


def upsert_captured_posting(con: sqlite3.Connection, p: CapturedPosting) -> tuple[Posting, bool]:
    """Insert a captured posting, or refresh the same-URL row in place. Returns
    (posting, updated). Raises NotFound if a fresh insert targets an unknown
    company."""
    url = validate_posting_url(p.url)
    pasted = p.pasted_url.strip() or url

    def nz(s: str) -> str | None:
        return s.strip() or None

    row = con.execute(
        "SELECT id FROM job_postings WHERE url IN (?, ?) ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (url, pasted),
    ).fetchone()
    if row is not None:
        existing_id = row[0]
        con.execute(
            """UPDATE job_postings SET
                url = ?, title = ?, location = COALESCE(?, location),
                posted_at = COALESCE(?, posted_at), employment_type = COALESCE(?, employment_type),
                workplace_type = COALESCE(?, workplace_type), department = COALESCE(?, department),
                comp_range = COALESCE(?, comp_range), description = COALESCE(?, description),
                source = 'capture', fetch_status = ?, captured_at = CURRENT_TIMESTAMP
             WHERE id = ?""",
            (url, nz(p.title), nz(p.location), nz(p.posted_at), nz(p.employment_type),
             nz(p.workplace_type), nz(p.department), nz(p.comp_range), nz(p.description),
             nz(p.fetch_status), existing_id),
        )
        return _read_posting(con, existing_id), True

    if not companies.company_exists(con, p.company_id):
        raise errors.NotFound()
    id = new_uuid()
    con.execute(
        """INSERT INTO job_postings (id, company_id, url, title, location,
               posted_at, employment_type, workplace_type, department, comp_range, description,
               source, fetch_status, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'capture', ?, CURRENT_TIMESTAMP)""",
        (id, p.company_id, url, nz(p.title), nz(p.location), nz(p.posted_at),
         nz(p.employment_type), nz(p.workplace_type), nz(p.department), nz(p.comp_range),
         nz(p.description), nz(p.fetch_status)),
    )
    return _read_posting(con, id), False


@dataclass
class PostingTracking:
    application_status: str = ""
    outreach_status: str = ""
    notes: str = ""


def update_posting_tracking(con: sqlite3.Connection, id: str, t: PostingTracking) -> Posting:
    """Set a posting's application-lifecycle fields. Raises NotFound for an
    unknown posting; validation errors carry the offending field as a prefix."""
    outreach_status = _clean_status_label("outreach_status", t.outreach_status)
    application_status = _clean_status_label("application_status", t.application_status)
    cur = con.execute(
        "UPDATE job_postings SET application_status = ?, outreach_status = ?, notes = ? WHERE id = ?",
        (application_status, outreach_status, t.notes.strip() or None, id),
    )
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_posting(con, id)


@dataclass
class PostingEdit:
    title: str = ""
    location: str = ""
    employment_type: str = ""
    workplace_type: str = ""
    department: str = ""
    comp_range: str = ""
    description: str = ""


def update_posting_details(con: sqlite3.Connection, id: str, e: PostingEdit) -> Posting:
    """Set a posting's hand-editable content fields. Strings are trimmed; empty
    ones store as NULL. Raises NotFound for an unknown posting."""
    cur = con.execute(
        """UPDATE job_postings SET
            title = ?, location = ?, employment_type = ?,
            workplace_type = ?, department = ?, comp_range = ?, description = ?
         WHERE id = ?""",
        (e.title.strip() or None, e.location.strip() or None, e.employment_type.strip() or None,
         e.workplace_type.strip() or None, e.department.strip() or None,
         e.comp_range.strip() or None, e.description.strip() or None, id),
    )
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_posting(con, id)


def update_posting_url(con: sqlite3.Connection, id: str, url: str) -> Posting:
    """Change a posting's link. Validated as on add. Raises NotFound for an
    unknown posting."""
    url = validate_posting_url(url)
    cur = con.execute("UPDATE job_postings SET url = ? WHERE id = ?", (url, id))
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_posting(con, id)


def update_posting_company(con: sqlite3.Connection, id: str, company_id: str) -> Posting:
    """Re-link a posting to a different existing company. An unknown/blank
    company id raises UnknownCompany; an unknown posting raises NotFound."""
    company_id = company_id.strip()
    if company_id == "":
        raise errors.UnknownCompany()
    if not companies.company_exists(con, company_id):
        raise errors.UnknownCompany()
    cur = con.execute("UPDATE job_postings SET company_id = ? WHERE id = ?", (company_id, id))
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_posting(con, id)


def set_posting_next_up(con: sqlite3.Connection, id: str, next_up: bool) -> Posting:
    """Queue (next_up_at = now) or unqueue (NULL) a posting as "next up for
    outreach". Raises NotFound for an unknown posting."""
    if next_up:
        q = "UPDATE job_postings SET next_up_at = CURRENT_TIMESTAMP WHERE id = ?"
    else:
        q = "UPDATE job_postings SET next_up_at = NULL WHERE id = ?"
    cur = con.execute(q, (id,))
    if cur.rowcount == 0:
        raise errors.NotFound()
    return _read_posting(con, id)


def get_posting(con: sqlite3.Connection, id: str) -> Posting | None:
    """Return one posting by id, or None when absent."""
    row = con.execute(f"SELECT {_POSTING_COLS} FROM job_postings WHERE id = ?", (id,)).fetchone()
    if row is None:
        return None
    return _scan_posting(row)


def delete_posting(con: sqlite3.Connection, id: str) -> None:
    """Permanently remove one job posting (its drafts/answers cascade off
    job_postings). Raises NotFound for an unknown id."""
    cur = con.execute("DELETE FROM job_postings WHERE id = ?", (id,))
    if cur.rowcount == 0:
        raise errors.NotFound()


def list_postings(con: sqlite3.Connection, company_id: str) -> list[Posting]:
    """A company's postings, newest first."""
    rows = con.execute(
        f"SELECT {_POSTING_COLS} FROM job_postings WHERE company_id = ? "
        f"ORDER BY created_at DESC, rowid DESC",
        (company_id,),
    ).fetchall()
    return [_scan_posting(r) for r in rows]


@dataclass
class JobRow:
    posting_id: str = ""
    company_id: str = ""
    company: str = ""
    url: str = ""
    title: str = ""
    location: str = ""
    source: str = ""
    fetch_status: str = ""
    created_at: str = ""
    posted_at: str = ""
    employment_type: str = ""
    workplace_type: str = ""
    department: str = ""
    comp_range: str = ""
    description: str = ""
    verdict: str = ""
    reason: str = ""
    reviewed: bool = False
    flagged: bool = False
    application_status: str = ""
    outreach_count: int = 0
    last_outreach_at: str = ""
    outreach_status: str = ""
    contacts: str = ""
    notes: str = ""
    next_up: bool = False
    followups_due: int = 0
    outreach_draft_status: str = ""
    questions_status: str = ""


def list_job_rows(con: sqlite3.Connection) -> list[JobRow]:
    """Every posting across all companies, newest first, for the jobs view."""
    # Reminder alerts (followups_due) only fire while a posting is still awaiting
    # a reply — outreach_status blank or the first configured label.
    first_status = ""
    labels = statuses.outreach_statuses(con)
    if labels:
        first_status = labels[0]

    q = """
SELECT p.id, p.company_id, c.name, p.url, COALESCE(p.title, ''), COALESCE(p.location, ''),
       COALESCE(p.source, 'manual'), COALESCE(p.fetch_status, ''),
       p.created_at,
       COALESCE(p.posted_at, ''), COALESCE(p.employment_type, ''), COALESCE(p.workplace_type, ''),
       COALESCE(p.department, ''), COALESCE(p.comp_range, ''), COALESCE(p.description, ''),
       COALESCE(v.verdict, ''), COALESCE(v.reason, ''),
       c.reviewed_at, c.flagged_at, p.next_up_at,
       COALESCE(p.application_status, ''),
       (SELECT COUNT(*) FROM outreach_log ol WHERE ol.posting_id = p.id),
       COALESCE((SELECT MAX(COALESCE(date(ol.followup_done_at), ol.sent_at)) FROM outreach_log ol WHERE ol.posting_id = p.id), ''),
       COALESCE(p.outreach_status, ''),
       COALESCE((SELECT json_group_array(json_object(
                  'position', CASE WHEN ct.role <> '' THEN ct.role ELSE ct.name END,
                  'email', ct.email))
                FROM contacts ct
                WHERE ct.company_id = p.company_id AND ct.archived_at IS NULL AND ct.email <> ''), ''),
       COALESCE(p.notes, ''),
       COALESCE((SELECT od.status FROM outreach_drafts od
                 WHERE od.posting_id = p.id ORDER BY od.id DESC LIMIT 1), ''),
       COALESCE(p.questions_status, ''),
       (SELECT COUNT(*) FROM outreach_log ol
         WHERE ol.posting_id = p.id
           AND COALESCE(p.outreach_status, '') IN ('', ?)
           AND ol.followup_due_at IS NOT NULL
           AND ol.followup_due_at <= DATE('now')
           AND ol.id = (SELECT MAX(ol2.id) FROM outreach_log ol2
                        WHERE ol2.contact_id = ol.contact_id AND ol2.posting_id = ol.posting_id))
FROM job_postings p
JOIN companies c ON c.id = p.company_id
LEFT JOIN verdicts v ON v.company_id = p.company_id
ORDER BY p.created_at DESC, p.rowid DESC"""
    rows = con.execute(q, (first_status,)).fetchall()
    out: list[JobRow] = []
    for r in rows:
        out.append(
            JobRow(
                posting_id=r[0], company_id=r[1], company=r[2], url=r[3], title=r[4],
                location=r[5], source=r[6], fetch_status=r[7], created_at=r[8],
                posted_at=r[9], employment_type=r[10], workplace_type=r[11],
                department=r[12], comp_range=r[13], description=r[14],
                verdict=r[15], reason=r[16],
                reviewed=r[17] is not None, flagged=r[18] is not None, next_up=r[19] is not None,
                application_status=r[20], outreach_count=r[21], last_outreach_at=r[22],
                outreach_status=r[23], contacts=r[24], notes=r[25],
                outreach_draft_status=r[26], questions_status=r[27], followups_due=r[28],
            )
        )
    return out
