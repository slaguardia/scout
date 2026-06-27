"""Shared web-test scaffolding.

Builds the FastAPI app over a fresh temp DB seeded with an "Acme" company at
acme.com, returning a starlette TestClient + the seeded company id + the db path
(so a test can open its own connection for store-level assertions).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from scout.store import db as db_module
from scout.store.companies import Company, upsert_company
from scout.web import Config, create_app


def new_test_app(tmp_path, monkeypatch):
    """(client, company_id, db_path). Clears ANTHROPIC_API_KEY so the capture/LLM
    paths stay off (a no-key environment)."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    db_path = str(tmp_path / "test.db")
    con = db_module.open_db(db_path)
    cid = upsert_company(con, Company(source="test", name="Acme", domain="acme.com", raw_json="{}"))
    con.close()
    config = Config(db_path=db_path, taste_md_path=str(tmp_path / "taste.md"))
    client = TestClient(create_app(config))
    return client, cid, db_path


def open_db(db_path):
    """A connection for store-level assertions (migrations already ran)."""
    return db_module.connect(db_path)
