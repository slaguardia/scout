"""Smoke coverage for the criteria editors: the typed criteria doc, the
structured pre-filter, the playbook, and the filter-options vocabularies."""

from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout import filter as filter_pkg
from scout import playbook as playbook_pkg
from scout.store import companies as companies_store
from scout.store.companies import Company

_JSON = {"Content-Type": "application/json"}


def _put(client, path, body):
    return client.put(path, content=body, headers=_JSON)


def test_criteria_doc_round_trip(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    # GET with nothing saved -> empty content, and (no brain) no active criteria.
    rec = client.get("/api/criteria")
    assert rec.status_code == 200
    body = rec.json()
    assert body["kind"] == "criteria" and body["content"] == ""
    assert "taste_source" not in body

    # PUT saves; GET reads it back; the typed doc becomes the active criteria
    # immediately (stamped with its source + folded version).
    rec = _put(client, "/api/criteria", '{"content":"only US, remote-friendly"}')
    assert rec.status_code == 200
    assert rec.json()["taste_source"] == "local:criteria + playbook"
    assert rec.json()["taste_version"]
    assert client.get("/api/criteria").json()["content"] == "only US, remote-friendly"
    assert client.get("/api/stats").json()["taste_source"] == "local:criteria + playbook"

    # Clearing it drops the active criteria again.
    assert _put(client, "/api/criteria", '{"content":""}').status_code == 200
    assert "taste_source" not in client.get("/api/criteria").json()


def test_knowledge_docs_round_trip(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    for need in ("experience", "voice", "logistics"):
        rec = client.get(f"/api/knowledge/{need}")
        assert rec.status_code == 200, need
        assert rec.json() == {"kind": "knowledge", "need": need, "content": "", "brain": []}

    rec = _put(client, "/api/knowledge/experience", '{"content":"Five years at Globex."}')
    assert rec.status_code == 200
    assert rec.json()["content"] == "Five years at Globex."
    assert client.get("/api/knowledge/experience").json()["content"] == "Five years at Globex."
    # The typed doc is a 'local' row in the sources listing.
    srcs = client.get("/api/outreach/sources").json()["sources"]
    assert [(s["need"], s["origin"], s["page_id"]) for s in srcs] == [
        ("experience", "local", "local")
    ]

    # Blank clears it; an unknown need is a 404.
    assert _put(client, "/api/knowledge/experience", '{"content":"  "}').status_code == 200
    assert client.get("/api/knowledge/experience").json()["content"] == ""
    assert client.get("/api/knowledge/hobbies").status_code == 404
    assert _put(client, "/api/knowledge/hobbies", '{"content":"x"}').status_code == 404


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
    assert (
        _put(
            client, "/api/taste-filter", json.dumps({"content": "not = valid = toml ="})
        ).status_code
        == 400
    )


def test_filter_options(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    # Seed a couple of companies with verticals + stages to count.
    con = open_db(db_path)
    companies_store.upsert_company(
        con,
        Company(
            source="test",
            name="Beta",
            domain="beta.com",
            vertical="AI infra, Software",
            funding_stage="Series A",
            raw_json="{}",
        ),
    )
    companies_store.upsert_company(
        con,
        Company(
            source="test",
            name="Gamma",
            domain="gamma.com",
            vertical="AI infra",
            funding_stage="Seed",
            raw_json="{}",
        ),
    )
    con.close()

    rec = client.get("/api/filter-options")
    assert rec.status_code == 200
    body = rec.json()
    verts = {v["value"]: v["count"] for v in body["verticals"]}
    assert verts.get("AI infra") == 2 and verts.get("Software") == 1
    # Canonical stages are always present (count >= 0); the seeded ones counted.
    stages = {s["value"]: s["count"] for s in body["stages"]}
    assert stages["Series A"] == 1 and stages["Seed"] == 1 and "Series B" in stages
