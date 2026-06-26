"""Smoke coverage for the criteria editors (no Go web test): taste.md, the
structured pre-filter, the playbook, and the filter-options vocabularies."""
from __future__ import annotations

from scout import filter as filter_pkg
from scout import playbook as playbook_pkg
from scout.store import companies as companies_store
from scout.store.companies import Company

from web_helpers import new_test_app, open_db

_JSON = {"Content-Type": "application/json"}


def _put(client, path, body):
    return client.put(path, content=body, headers=_JSON)


def test_taste_file_round_trip(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    # GET an unwritten taste.md -> empty content, with the kind/path stamped.
    rec = client.get("/api/taste")
    assert rec.status_code == 200
    body = rec.json()
    assert body["kind"] == "taste" and body["content"] == ""

    # PUT writes the file; GET reads it back.
    assert _put(client, "/api/taste", '{"content":"only US, remote-friendly"}').status_code == 200
    assert client.get("/api/taste").json()["content"] == "only US, remote-friendly"


def test_playbook_round_trip(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    # GET with nothing saved -> the compiled-in default.
    rec = client.get("/api/playbook")
    assert rec.status_code == 200
    assert rec.json()["content"] == playbook_pkg.DEFAULT_PLAYBOOK

    # PUT saves; GET reads it back; a folded taste_version is stamped.
    rec = _put(client, "/api/playbook", '{"content":"score harshly on location"}')
    assert rec.status_code == 200
    assert rec.json()["content"] == "score harshly on location"
    assert client.get("/api/playbook").json()["content"] == "score harshly on location"


def test_taste_filter_round_trip(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    # GET with nothing saved -> the compiled default rules + master switch.
    rec = client.get("/api/taste-filter")
    assert rec.status_code == 200
    body = rec.json()
    assert body["kind"] == "taste-filter" and "rules" in body and isinstance(body["enabled"], bool)

    # PUT the structured form path: rules re-encode to TOML and round-trip.
    rules = {
        "location": {"allowed": ["united states"], "remote_ok": True},
        "headcount": {"min": 10, "max": 500},
        "verticals": {"allowed": ["ai infra"], "excluded": ["crypto"]},
        "funding_stage": {"allowed": ["Series A"]},
    }
    import json
    rec = _put(client, "/api/taste-filter", json.dumps({"rules": rules, "enabled": True}))
    assert rec.status_code == 200, (rec.status_code, rec.text)
    out = rec.json()
    assert out["enabled"] is True
    assert out["rules"]["location"]["allowed"] == ["united states"]
    assert out["rules"]["verticals"]["excluded"] == ["crypto"]
    # The encoded TOML parses back to the same rules.
    t = filter_pkg.parse_taste(out["content"])
    assert t.funding_stage.allowed == ["Series A"] and t.headcount.min == 10

    # Invalid TOML on the legacy content path -> 400.
    assert _put(client, "/api/taste-filter", json.dumps({"content": "not = valid = toml ="})).status_code == 400


def test_filter_options(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    # Seed a couple of companies with verticals + stages to count.
    con = open_db(db_path)
    companies_store.upsert_company(con, Company(
        source="test", name="Beta", domain="beta.com",
        vertical="AI infra, Software", funding_stage="Series A", raw_json="{}"))
    companies_store.upsert_company(con, Company(
        source="test", name="Gamma", domain="gamma.com",
        vertical="AI infra", funding_stage="Seed", raw_json="{}"))
    con.close()

    rec = client.get("/api/filter-options")
    assert rec.status_code == 200
    body = rec.json()
    verts = {v["value"]: v["count"] for v in body["verticals"]}
    assert verts.get("AI infra") == 2 and verts.get("Software") == 1
    # Canonical stages are always present (count >= 0); the seeded ones counted.
    stages = {s["value"]: s["count"] for s in body["stages"]}
    assert stages["Series A"] == 1 and stages["Seed"] == 1 and "Series B" in stages
