"""The run-plan and pre-filter-preview endpoints — the numbers the UI shows
*before* a bulk verdict run spends anything.

A run funnels through three gates that were all silent: the pre-filter, the
enrichment requirement, and the skip-already-scored rule. These endpoints make
each drop countable.
"""

from __future__ import annotations

import json

from web_helpers import new_test_app, open_db

from scout.store import enrichment, verdicts
from scout.store.companies import Company, upsert_company


def _seed(db_path, rows):
    """rows: (name, domain, location, headcount, enriched) -> ids"""
    con = open_db(db_path)
    ids = []
    for name, domain, location, headcount, enriched in rows:
        cid = upsert_company(
            con,
            Company(
                source="t", name=name, domain=domain, raw_json="{}",
                location=location, headcount=headcount,
            ),
        )
        if enriched:
            enrichment.upsert_enrichment(
                con,
                enrichment.Enrichment(
                    company_id=cid, website_url=f"https://{domain}",
                    website_summary=f"{name} does things", fetch_status="ok",
                ),
            )
        ids.append(cid)
    con.commit()
    con.close()
    return ids


def test_plan_reports_the_whole_funnel(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    # cid (Acme) comes seeded with no enrichment.
    ids = _seed(
        db_path,
        [
            ("Beta", "beta.com", "Remote", 50, True),
            ("Cee", "cee.com", "Remote", 60, True),
            ("Dee", "dee.com", "Remote", 70, False),
        ],
    )

    # Pre-filter off: every company passes, so the only drop is enrichment.
    client.put(
        "/api/taste-filter",
        content=json.dumps({"enabled": False, "rules": {}}),
        headers={"Content-Type": "application/json"},
    )
    p = client.get("/api/run/verdict/plan").json()
    assert p["total"] == 4
    assert p["passes_prefilter"] == 4
    assert p["enriched"] == 2
    assert p["unenriched"] == 2, "Acme and Dee have no readable site"
    assert p["scored"] == 0 and p["stale"] == 0 and p["manual"] == 0

    # A hand-set verdict and a stale model verdict split the scope counts.
    con = open_db(db_path)
    verdicts.upsert_verdict(
        con, verdicts.Verdict(company_id=ids[0], verdict="yes", taste_version="old", model="m")
    )
    verdicts.upsert_verdict(
        con,
        verdicts.Verdict(
            company_id=ids[1], verdict="no", taste_version="old", model=verdicts.MANUAL_MODEL
        ),
    )
    con.commit()
    con.close()

    p = client.get("/api/run/verdict/plan").json()
    assert p["scored"] == 2
    assert p["manual"] == 1
    assert p["stale"] == 1, "the model-scored verdict is on criteria that are no longer live"


def test_plan_counts_prefilter_drops_with_reasons(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    _seed(
        db_path,
        [
            ("Big", "big.com", "Remote", 5000, True),
            ("Small", "small.com", "Remote", 20, True),
        ],
    )
    client.put(
        "/api/taste-filter",
        content=json.dumps({"enabled": True, "rules": {"location": {"allowed": ["remote"], "remote_ok": True}, "headcount": {"min": 0, "max": 100}}}),
        headers={"Content-Type": "application/json"},
    )
    p = client.get("/api/run/verdict/plan").json()
    assert p["prefilter_enabled"] is True
    assert p["passes_prefilter"] < p["total"]
    assert p["dropped_by"].get("headcount_max", 0) == 1, p["dropped_by"]


def test_prefilter_preview_does_not_persist(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    _seed(
        db_path,
        [("Big", "big.com", "Remote", 5000, True), ("Small", "small.com", "Remote", 20, True)],
    )
    client.put(
        "/api/taste-filter",
        content=json.dumps({"enabled": False, "rules": {}}),
        headers={"Content-Type": "application/json"},
    )

    r = client.post(
        "/api/taste-filter/preview",
        content=json.dumps({"rules": {"location": {"allowed": ["remote"], "remote_ok": True}, "headcount": {"min": 0, "max": 100}}}),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3  # Acme + Big + Small
    assert body["kept"] < body["total"]
    assert body["dropped_by"].get("headcount_max", 0) == 1

    # The saved filter is untouched — a preview must never write.
    saved = client.get("/api/taste-filter").json()
    assert saved["enabled"] is False
    assert saved["rules"].get("headcount", {}).get("max", 0) in (0, None)


def test_prefilter_preview_rejects_bad_rules(tmp_path, monkeypatch):
    client, _cid, _db = new_test_app(tmp_path, monkeypatch)
    r = client.post(
        "/api/taste-filter/preview",
        content=json.dumps({"rules": {"headcount": "not-an-object"}}),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 400
