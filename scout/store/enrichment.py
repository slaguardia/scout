"""Enrichment cache (about-page records). Port of internal/store/enrichment.go."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass
class EnrichmentTarget:
    """A company that still needs (or could refresh) enrichment, with its fact
    columns riding along so the extraction pass sees blank fields cheaply."""

    company_id: str = ""
    name: str = ""
    domain: str = ""
    headcount: int = 0  # 0 = unknown
    funding_stage: str = ""
    location: str = ""
    vertical: str = ""


@dataclass
class Enrichment:
    """The cached about-page record. Nullable Go columns are str|None here."""

    company_id: str = ""
    website_url: str | None = None
    website_summary: str | None = None
    fetch_status: str = ""
    fetch_error: str | None = None
    fetched_at: str | None = None


def enrichment_targets(
    con: sqlite3.Connection, force: bool, only_blanks: bool, company_ids: list[str] | None = None
) -> list[EnrichmentTarget]:
    """Companies that need enrichment. force returns every domain'd company;
    only_blanks returns only those with no enrichment row; force wins. A non-empty
    company_ids returns exactly those (with a domain) regardless of freshness."""
    q = """
SELECT c.id, c.name, COALESCE(c.domain, ''),
       COALESCE(c.headcount, 0), COALESCE(c.funding_stage, ''),
       COALESCE(c.location, ''), COALESCE(c.vertical, '')
FROM companies c
LEFT JOIN enrichment e ON e.company_id = c.id
WHERE COALESCE(c.domain, '') <> ''
  AND (? OR e.company_id IS NULL OR (NOT ? AND datetime(c.ingested_at) > datetime(e.fetched_at)))"""
    args: list = [1 if force else 0, 1 if only_blanks else 0]
    if company_ids:
        args = [1, 0]  # targeted implies force
        args.extend(company_ids)
        q += "\n  AND c.id IN (" + ",".join("?" for _ in company_ids) + ")"
    rows = con.execute(q, args).fetchall()
    return [
        EnrichmentTarget(
            company_id=r[0], name=r[1], domain=r[2], headcount=r[3],
            funding_stage=r[4], location=r[5], vertical=r[6],
        )
        for r in rows
    ]


def upsert_enrichment(con: sqlite3.Connection, e: Enrichment) -> None:
    """Insert or replace an enrichment row."""
    con.execute(
        """
INSERT INTO enrichment (company_id, website_url, website_summary, fetch_status, fetch_error, fetched_at)
VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(company_id) DO UPDATE SET
    website_url     = excluded.website_url,
    website_summary = excluded.website_summary,
    fetch_status    = excluded.fetch_status,
    fetch_error     = excluded.fetch_error,
    fetched_at      = CURRENT_TIMESTAMP;""",
        (e.company_id, e.website_url, e.website_summary, e.fetch_status, e.fetch_error),
    )


def get_enrichment(con: sqlite3.Connection, company_id: str) -> Enrichment | None:
    """Return the cached enrichment for a company, or None when absent."""
    row = con.execute(
        "SELECT company_id, website_url, website_summary, fetch_status, fetch_error, fetched_at "
        "FROM enrichment WHERE company_id = ?",
        (company_id,),
    ).fetchone()
    if row is None:
        return None
    return Enrichment(
        company_id=row[0], website_url=row[1], website_summary=row[2],
        fetch_status=row[3], fetch_error=row[4], fetched_at=row[5],
    )
