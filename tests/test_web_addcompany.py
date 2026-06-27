"""The add-company web route."""

from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout.store import companies, detail
from scout.store.companies import Company, upsert_company


def test_add_company_api(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    def post(body):
        return client.post(
            "/api/companies", content=body, headers={"Content-Type": "application/json"}
        )

    # Happy path → 200, and the row is retrievable by the returned id.
    rec = post('{"website":"https://www.globex.io/","name":"Globex","vertical":"Fintech"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    company_id = rec.json()["company_id"]
    assert company_id

    con = open_db(db_path)
    d = detail.get_company_detail(con, company_id)
    assert d is not None and d.domain == "globex.io" and d.source == "manual"
    con.close()

    # Missing website → 400, not 500.
    assert post('{"name":"No Website"}').status_code == 400

    # Re-add the same domain → 409, and the message names the existing company.
    rec = post('{"website":"globex.io","location":"NYC"}')
    assert rec.status_code == 409, (rec.status_code, rec.text)
    body = rec.text
    assert "Globex" in body and "globex.io" in body

    # A domain already present from another source (the seed) is also rejected.
    assert post('{"website":"acme.com","name":"Acme Reborn"}').status_code == 409

    # Wrong method on the collection route → 405.
    assert client.delete("/api/companies").status_code == 405

    # GET still lists companies; the seed + two adds collapse to 2 distinct.
    assert client.get("/api/companies").status_code == 200
    con = open_db(db_path)
    assert companies.count_companies(con) == 2
    con.close()


def test_delete_company_api(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    add = client.post(
        "/api/companies",
        content='{"website":"globex.io","name":"Globex"}',
        headers={"Content-Type": "application/json"},
    )
    assert add.status_code == 200, (add.status_code, add.text)
    added_id = add.json()["company_id"]

    # Delete the real company → 200, and it's no longer retrievable.
    assert client.delete(f"/api/companies/{added_id}").status_code == 200
    con = open_db(db_path)
    assert detail.get_company_detail(con, added_id) is None
    assert companies.count_companies(con) == 1
    con.close()

    # Unknown id → 404, not a silent success.
    assert client.delete("/api/companies/does-not-exist").status_code == 404


def test_facets_api(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)

    con = open_db(db_path)

    def seed(name, domain, vertical, stage):
        upsert_company(
            con,
            Company(
                source="test",
                name=name,
                domain=domain,
                vertical=vertical or None,
                funding_stage=stage or None,
                raw_json="{}",
            ),
        )

    seed(
        "Vapi", "vapi.com", "Artificial Intelligence (AI), Developer Platform, Software", "Series B"
    )
    seed(
        "Armada", "armada.ai", "Artificial Intelligence (AI), Cloud Computing, Software", "Series A"
    )
    con.close()

    rec = client.get("/api/facets")
    assert rec.status_code == 200, (rec.status_code, rec.text)
    f = rec.json()
    want_v = ["Artificial Intelligence (AI)", "Cloud Computing", "Developer Platform", "Software"]
    assert f["verticals"] == want_v
    assert f["funding_stages"] == ["Series A", "Series B"]
