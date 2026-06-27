"""Joined company-detail + stats payloads."""

from __future__ import annotations

import json
import sqlite3
import sys
from dataclasses import dataclass, field

from . import errors, postings, taste_filter


@dataclass
class CompanyDetail:
    company_id: str = ""
    name: str = ""
    source: str = ""
    source_id: str = ""
    domain: str = ""
    headcount: int = 0
    funding_stage: str = ""
    location: str = ""
    vertical: str = ""
    ingested_at: str = ""
    raw_json: dict = field(default_factory=dict)
    notes: str = ""
    flagged: bool = False
    flagged_at: str = ""
    reviewed_at: str = ""
    has_verdict: bool = False
    verdict: str = ""
    reason: str = ""
    taste_version: str = ""
    model: str = ""
    scored_at: str = ""
    has_enrichment: bool = False
    website_url: str = ""
    website_summary: str = ""
    fetch_status: str = ""
    fetch_error: str = ""
    fetched_at: str = ""
    postings: list = field(default_factory=list)


def get_company_detail(con: sqlite3.Connection, company_id: str) -> CompanyDetail | None:
    """The full joined detail for one company, or None when not found."""
    q = """
SELECT c.id, c.name, c.source, COALESCE(c.source_id, ''),
       COALESCE(c.domain, ''), COALESCE(c.headcount, 0),
       COALESCE(c.funding_stage, ''), COALESCE(c.location, ''),
       COALESCE(c.vertical, ''), c.ingested_at, c.raw_json, c.flagged_at, c.reviewed_at,
       COALESCE(c.notes, ''),
       v.verdict, v.reason, v.taste_version, v.model, v.scored_at,
       e.website_url, e.website_summary, e.fetch_status, e.fetch_error, e.fetched_at
FROM companies c
LEFT JOIN verdicts   v ON v.company_id = c.id
LEFT JOIN enrichment e ON e.company_id = c.id
WHERE c.id = ?"""
    row = con.execute(q, (company_id,)).fetchone()
    if row is None:
        return None

    d = CompanyDetail(
        company_id=row[0],
        name=row[1],
        source=row[2],
        source_id=row[3],
        domain=row[4],
        headcount=row[5],
        funding_stage=row[6],
        location=row[7],
        vertical=row[8],
        ingested_at=row[9],
        notes=row[13],
    )
    d.raw_json = _parse_raw_json(row[10])
    flagged_at, reviewed_at = row[11], row[12]
    d.flagged = flagged_at is not None
    d.flagged_at = flagged_at or ""
    d.reviewed_at = reviewed_at or ""

    verdict, reason, taste_version, model, scored_at = row[14], row[15], row[16], row[17], row[18]
    if verdict is not None:
        d.has_verdict = True
        d.verdict = verdict
        d.reason = reason or ""
        d.taste_version = taste_version or ""
        d.model = model or ""
        d.scored_at = scored_at or ""

    website_url, website_summary, fetch_status = row[19], row[20], row[21]
    fetch_error, fetched_at = row[22], row[23]
    if website_url is not None or website_summary is not None or fetch_status is not None:
        d.has_enrichment = True
        d.website_url = website_url or ""
        d.website_summary = website_summary or ""
        d.fetch_status = fetch_status or ""
        d.fetch_error = fetch_error or ""
        d.fetched_at = fetched_at or ""

    # Postings are one-to-many; a failure here shouldn't sink the whole payload.
    try:
        d.postings = postings.list_postings(con, company_id)
    except Exception as exc:  # noqa: BLE001 - log and continue
        print(f"list postings {company_id}: {exc}", file=sys.stderr)
        d.postings = []
    return d


def _parse_raw_json(s) -> dict:
    """Turn the stored raw_json column into a map; tolerate any on-disk shape."""
    out: dict = {}
    if not s:
        return out
    try:
        m = json.loads(s)
    except (json.JSONDecodeError, TypeError, ValueError):
        return out
    if isinstance(m, dict):
        if all(isinstance(v, str) for v in m.values()):
            return m
        return {k: _stringify(v) for k, v in m.items()}
    return out


def _stringify(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "<nil>"
    return str(v)


@dataclass
class Stats:
    total_companies: int = 0
    enriched_ok: int = 0
    scored: int = 0
    unscored: int = 0
    by_verdict: dict = field(default_factory=dict)
    fetch_status: dict = field(default_factory=dict)
    current_taste: str = ""
    taste_source: str = ""
    taste_filter_enabled: bool = True


def get_stats(
    con: sqlite3.Connection, current_taste_version: str, current_taste_source: str
) -> Stats:
    """Compute the sidebar payload."""
    s = Stats(
        by_verdict={},
        fetch_status={},
        current_taste=current_taste_version,
        taste_source=current_taste_source,
        taste_filter_enabled=True,
    )
    try:
        _, enabled = taste_filter.get_taste_filter(con)
        s.taste_filter_enabled = enabled
    except Exception:  # noqa: BLE001
        pass

    s.total_companies = con.execute("SELECT COUNT(1) FROM companies").fetchone()[0]
    s.enriched_ok = con.execute(
        "SELECT COUNT(1) FROM enrichment WHERE fetch_status = 'ok'"
    ).fetchone()[0]
    s.scored = con.execute("SELECT COUNT(1) FROM verdicts").fetchone()[0]
    s.unscored = max(s.total_companies - s.scored, 0)

    _scan_hist(con, "SELECT verdict, COUNT(1) FROM verdicts GROUP BY verdict", s.by_verdict)
    _scan_hist(
        con, "SELECT fetch_status, COUNT(1) FROM enrichment GROUP BY fetch_status", s.fetch_status
    )
    return s


def _scan_hist(con: sqlite3.Connection, q: str, dst: dict) -> None:
    for k, n in con.execute(q).fetchall():
        dst[k] = n


def get_company_name(con: sqlite3.Connection, company_id: str) -> tuple[str, str]:
    """Look up (name, domain) by id. Raises NotFound when absent."""
    row = con.execute(
        "SELECT name, COALESCE(domain, '') FROM companies WHERE id = ?", (company_id,)
    ).fetchone()
    if row is None:
        raise errors.NotFound()
    return row[0], row[1]
