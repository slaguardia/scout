"""Small shared test helpers (mk_company etc.). The `db` fixture lives in
conftest.py."""

from __future__ import annotations

import sqlite3

from scout.store import companies, postings
from scout.store.companies import Company


def mk_company(source: str, name: str, domain: str) -> Company:
    """A Company with raw_json '{}' and an optional domain."""
    return Company(source=source, name=name, raw_json="{}", domain=domain or None)


def seed_posting(db: sqlite3.Connection) -> str:
    """Create a company + one posting and return the posting id."""
    cid = companies.upsert_company(
        db, Company(source="test", name="Acme", domain="acme.com", raw_json="{}")
    )
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "Solutions Engineer")
    return p.id
