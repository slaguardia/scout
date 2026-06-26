"""Port of internal/web/editcompany_test.go."""
from __future__ import annotations

from web_helpers import new_test_app


def test_edit_company_api(tmp_path, monkeypatch):
    client, cid, _db_path = new_test_app(tmp_path, monkeypatch)

    def put(company_id, body):
        return client.put(f"/api/companies/{company_id}", content=body,
                          headers={"Content-Type": "application/json"})

    # Happy path: every editable field lands, headcount parses a range, and the
    # response is the refreshed detail.
    rec = put(cid, '{"name":"Acme Robotics","headcount":"11-50","funding_stage":"Series A",'
                   '"location":"Austin, TX","vertical":"Robotics, AI"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    d = rec.json()
    assert d["name"] == "Acme Robotics" and d["headcount"] == 50
    assert d["funding_stage"] == "Series A" and d["location"] == "Austin, TX"
    assert d["vertical"] == "Robotics, AI"
    assert d["domain"] == "acme.com"

    # Full replace: blanks clear the optional fields.
    rec = put(cid, '{"name":"Acme Robotics","headcount":"","funding_stage":"","location":"","vertical":""}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    d = rec.json()
    assert d["headcount"] == 0 and d["funding_stage"] == "" and d["location"] == "" and d["vertical"] == ""

    # Blank name → 400.
    assert put(cid, '{"name":"  "}').status_code == 400

    # Unknown id → 404.
    assert put("00000000-0000-0000-0000-000000000000", '{"name":"Ghost"}').status_code == 404
