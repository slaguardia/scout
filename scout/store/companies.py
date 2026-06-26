"""Companies table — the cross-source dedup root. Port of internal/store/companies.go.

Company primary keys are deterministic UUIDv5 over the company's identity (its
normalized domain, or 'name:<lower(name)>' when domain-less), so the same
company always hashes to the same row — the pkey doubles as the dedup key.
"""
from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass

from . import errors
from ._helpers import new_uuid, tx

# companyNamespace seeds the deterministic company IDs. Stable across builds
# (derived from a fixed name), so the same identity always hashes to the same
# UUID. uuid.uuid5 (SHA1 over NAMESPACE_URL) matches Go's uuid.NewSHA1 byte-for-byte.
_COMPANY_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "github.com/slaguardia/scout/companies")


@dataclass
class Company:
    """The minimal row used by ingest and filter. Nullable Go columns
    (sql.NullString / sql.NullInt64) are str|None / int|None here."""

    source: str = ""
    name: str = ""
    raw_json: str = ""
    domain: str | None = None
    source_id: str | None = None
    headcount: int | None = None
    funding_stage: str | None = None
    location: str | None = None
    vertical: str | None = None
    id: str = ""


@dataclass
class EditableCompany:
    """The hand-editable company fields — everything the Add-company form
    collects except the website (the domain is identity and never changes)."""

    name: str = ""
    headcount: int | None = None
    funding_stage: str | None = None
    location: str | None = None
    vertical: str | None = None


def norm_name(name: str) -> str:
    """Fold a company name to its identity form: trimmed and lowercased.

    EVERY name-identity comparison routes through this — never SQLite's
    ASCII-only lower() (see domain_keyed_ids_by_name).
    """
    return name.strip().lower()


def company_id(domain: str, name: str) -> str:
    """Derive the deterministic primary key from a company's identity: the
    normalized domain, or 'name:<lower(name)>' when there's no domain."""
    key = domain.strip().lower()
    if key == "":
        key = "name:" + norm_name(name)
    return str(uuid.uuid5(_COMPANY_NAMESPACE, key))


_UPSERT_SQL = """
INSERT INTO companies (id, source, source_id, name, name_key, domain, headcount, funding_stage, location, vertical, raw_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    source        = excluded.source,
    source_id     = excluded.source_id,
    name          = excluded.name,
    name_key      = excluded.name_key,
    domain        = excluded.domain,
    headcount     = excluded.headcount,
    funding_stage = excluded.funding_stage,
    location      = excluded.location,
    vertical      = excluded.vertical,
    raw_json      = excluded.raw_json,
    ingested_at   = CURRENT_TIMESTAMP;"""


def _upsert_company(con: sqlite3.Connection, id: str, c: Company) -> None:
    """Write one company row. name_key is the Go-folded identity name."""
    con.execute(
        _UPSERT_SQL,
        (id, c.source, c.source_id, c.name, norm_name(c.name), c.domain,
         c.headcount, c.funding_stage, c.location, c.vertical, c.raw_json),
    )


def upsert_company(con: sqlite3.Connection, c: Company) -> str:
    """Insert or update a company keyed by its deterministic UUID. Returns the id."""
    cid = company_id(c.domain or "", c.name)
    _upsert_company(con, cid, c)
    return cid


def upsert_company_with_id(con: sqlite3.Connection, id: str, c: Company) -> None:
    """Upsert a company under an already-computed deterministic id."""
    _upsert_company(con, id, c)


def backfill_company_blanks(con: sqlite3.Connection, id: str, c: Company) -> None:
    """Fill only the columns currently NULL/empty on the stored row from c's
    non-empty values, leaving existing data untouched."""
    con.execute(
        """
UPDATE companies SET
    headcount     = COALESCE(headcount, ?),
    funding_stage = CASE WHEN funding_stage IS NULL OR funding_stage = '' THEN ? ELSE funding_stage END,
    location      = CASE WHEN location      IS NULL OR location      = '' THEN ? ELSE location      END,
    vertical      = CASE WHEN vertical      IS NULL OR vertical      = '' THEN ? ELSE vertical      END
WHERE id = ?;""",
        (c.headcount, c.funding_stage, c.location, c.vertical, id),
    )


def update_company_editable(con: sqlite3.Connection, id: str, e: EditableCompany) -> None:
    """Replace the editable fields on one company (full replace — blanks clear).
    Raises NotFound for an unknown id."""
    cur = con.execute(
        """
UPDATE companies SET
    name = ?, name_key = ?, headcount = ?, funding_stage = ?, location = ?, vertical = ?
WHERE id = ?;""",
        (e.name, norm_name(e.name), e.headcount, e.funding_stage, e.location, e.vertical, id),
    )
    if cur.rowcount == 0:
        raise errors.NotFound()


def set_company_domain(con: sqlite3.Connection, old_id: str, domain: str) -> str:
    """Attach/change a company's domain and re-key the row onto its domain
    identity. Returns the resulting id. Raises NotFound for an unknown id;
    DomainTaken if a DIFFERENT company already holds the domain identity."""
    row = con.execute("SELECT name FROM companies WHERE id = ?", (old_id,)).fetchone()
    if row is None:
        raise errors.NotFound()
    name = row[0]

    new_id = company_id(domain, name)
    if new_id == old_id:
        # Same identity (re-typing the domain, or a differently-cased equal) —
        # just store the normalized value in place, no re-key.
        con.execute("UPDATE companies SET domain = ? WHERE id = ?", (domain, old_id))
        return old_id

    with tx(con):
        target = con.execute("SELECT name FROM companies WHERE id = ?", (new_id,)).fetchone()
        if target is not None:
            # A company already holds this domain identity. Same name ⇒ the same
            # company under both keys (the reverse fold): fold old_id in.
            # Different name ⇒ refuse.
            if norm_name(target[0]) != norm_name(name):
                raise errors.DomainTaken()
            _fold_children(con, old_id, new_id)
        else:
            # Re-key in place: clone the row under the domain id with the new
            # domain, move children onto it, drop the old (name-keyed) row.
            con.execute(
                """
INSERT INTO companies (id, source, source_id, name, name_key, domain, headcount, funding_stage, location, vertical, raw_json, ingested_at, flagged_at, reviewed_at)
SELECT ?, source, source_id, name, name_key, ?, headcount, funding_stage, location, vertical, raw_json, ingested_at, flagged_at, reviewed_at
FROM companies WHERE id = ?""",
                (new_id, domain, old_id),
            )
            _fold_children(con, old_id, new_id)
    return new_id


def update_company_notes(con: sqlite3.Connection, id: str, notes: str) -> None:
    """Set the free-form, human-only notes on a company. Empty clears it.
    Raises NotFound for an unknown id."""
    cur = con.execute("UPDATE companies SET notes = ? WHERE id = ?", (notes or None, id))
    if cur.rowcount == 0:
        raise errors.NotFound()


def fill_company_name_placeholder(con: sqlite3.Connection, id: str, name: str) -> bool:
    """Set the company name only when the stored name is still the domain
    placeholder or empty. Reports whether a row changed."""
    name = name.strip()
    if name == "":
        return False
    cur = con.execute(
        """
UPDATE companies SET name = ?, name_key = ?
WHERE id = ? AND (name = '' OR name = COALESCE(domain, ''));""",
        (name, norm_name(name), id),
    )
    return cur.rowcount > 0


# companyChildTables1to1 hold at most one row per company (company_id is the
# PRIMARY KEY) — newID's row is kept on a fold, oldID's dropped.
_COMPANY_CHILD_TABLES_1TO1 = ["enrichment", "verdicts"]
# Many rows per company (company_id non-unique) — both sides coexist.
_COMPANY_CHILD_TABLES_MANY = ["verdict_trace", "job_postings", "verdict_override"]
# Many rows but with a partial UNIQUE(company_id, email) index (M51).
_COMPANY_CHILD_TABLES_UNIQUE_EMAIL = ["contacts"]

# Every table whose company_id FKs companies(id). TestCompanyChildTablesMatchSchema
# guards this against schema drift.
COMPANY_CHILD_TABLES = (
    _COMPANY_CHILD_TABLES_1TO1
    + _COMPANY_CHILD_TABLES_MANY
    + _COMPANY_CHILD_TABLES_UNIQUE_EMAIL
)


def _fold_children(con: sqlite3.Connection, old_id: str, new_id: str) -> None:
    """Re-point every child row from old_id to new_id, then delete the old
    parent. Must run inside an open transaction."""
    for table in _COMPANY_CHILD_TABLES_1TO1:
        con.execute(
            f"DELETE FROM {table} WHERE company_id = ? AND EXISTS (SELECT 1 FROM {table} WHERE company_id = ?)",
            (old_id, new_id),
        )
        con.execute(f"UPDATE {table} SET company_id = ? WHERE company_id = ?", (new_id, old_id))
    for table in _COMPANY_CHILD_TABLES_MANY:
        con.execute(f"UPDATE {table} SET company_id = ? WHERE company_id = ?", (new_id, old_id))
    for table in _COMPANY_CHILD_TABLES_UNIQUE_EMAIL:
        con.execute(
            f"DELETE FROM {table} WHERE company_id = ? AND email <> '' AND email IN (SELECT email FROM {table} WHERE company_id = ?)",
            (old_id, new_id),
        )
        con.execute(f"UPDATE {table} SET company_id = ? WHERE company_id = ?", (new_id, old_id))
    con.execute("DELETE FROM companies WHERE id = ?", (old_id,))


def merge_company(con: sqlite3.Connection, old_id: str, new_id: str) -> None:
    """Collapse a domain-less company (old_id) into an already-stored domain-keyed
    company (new_id) for the same identity, in one transaction."""
    with tx(con):
        _fold_children(con, old_id, new_id)


def delete_company(con: sqlite3.Connection, id: str) -> None:
    """Permanently remove one company and every row attached to it, in one
    transaction. Raises NotFound for an unknown id."""
    with tx(con):
        for table in COMPANY_CHILD_TABLES:
            con.execute(f"DELETE FROM {table} WHERE company_id = ?", (id,))
        cur = con.execute("DELETE FROM companies WHERE id = ?", (id,))
        if cur.rowcount == 0:
            raise errors.NotFound()


def upsert_and_fold_name(con: sqlite3.Connection, domain_key: str, c: Company, name_key: str) -> None:
    """Upsert the new domain-keyed company AND fold a pre-existing name-keyed twin
    into it in a SINGLE transaction."""
    with tx(con):
        _upsert_company(con, domain_key, c)
        _fold_children(con, name_key, domain_key)


def company_exists(con: sqlite3.Connection, id: str) -> bool:
    """Whether a company with the given deterministic id is already stored."""
    return con.execute("SELECT 1 FROM companies WHERE id = ?", (id,)).fetchone() is not None


def company_name_by_id(con: sqlite3.Connection, id: str) -> tuple[str, bool]:
    """Return (name, exists) for a company id in one query."""
    row = con.execute("SELECT name FROM companies WHERE id = ?", (id,)).fetchone()
    if row is None:
        return "", False
    return row[0], True


def domain_keyed_ids_by_name(con: sqlite3.Connection, name: str) -> list[str]:
    """Ids of companies that carry a real domain and whose name matches
    (case-insensitive, trimmed) the given name."""
    key = norm_name(name)
    if key == "":
        return []
    rows = con.execute(
        "SELECT id FROM companies WHERE name_key = ? AND domain IS NOT NULL AND trim(domain) <> ''",
        (key,),
    ).fetchall()
    return [r[0] for r in rows]


def count_companies(con: sqlite3.Connection) -> int:
    """Total number of rows in the companies table."""
    return con.execute("SELECT COUNT(1) FROM companies").fetchone()[0]


def distinct_values(con: sqlite3.Connection, column: str) -> list[str]:
    """Sorted (case-insensitive) distinct non-empty values of a company column.
    The column is validated against a fixed allow-list, never interpolated from
    caller input."""
    if column not in ("funding_stage", "vertical"):  # allow-list
        raise ValueError(f"distinct values: unsupported column {column!r}")
    rows = con.execute(
        f"SELECT DISTINCT {column} FROM companies "
        f"WHERE {column} IS NOT NULL AND {column} <> '' "
        f"ORDER BY {column} COLLATE NOCASE"
    ).fetchall()
    return [r[0] for r in rows]


def vertical_tags(con: sqlite3.Connection) -> list[str]:
    """The distinct individual vertical tags: composite "A, B, C" cells split on
    commas, deduped case-insensitively (first spelling wins), and sorted."""
    cells = distinct_values(con, "vertical")
    seen: set[str] = set()
    out: list[str] = []
    for cell in cells:
        for tok in cell.split(","):
            tok = tok.strip()
            key = tok.lower()
            if tok == "" or key in seen:
                continue
            seen.add(key)
            out.append(tok)
    out.sort(key=str.lower)
    return out
