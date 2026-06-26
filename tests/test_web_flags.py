"""Port of internal/web/flags_test.go."""
from __future__ import annotations

from scout.store import triage

from web_helpers import new_test_app, open_db


def test_flagged_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    def put(company_id, body):
        return client.put(f"/api/companies/{company_id}/flagged", content=body,
                          headers={"Content-Type": "application/json"})

    # A fresh company starts unflagged.
    con = open_db(db_path)
    rows = triage.triage_rows(con)
    assert len(rows) == 1 and not rows[0].flagged
    con.close()

    # Flag → 200, detail and triage row reflect it.
    rec = put(cid, '{"flagged":true}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    d = rec.json()
    assert d["flagged"] and d["flagged_at"] != ""
    con = open_db(db_path)
    assert triage.triage_rows(con)[0].flagged
    con.close()

    # Unflag → cleared.
    assert put(cid, '{"flagged":false}').status_code == 200
    con = open_db(db_path)
    assert not triage.triage_rows(con)[0].flagged
    con.close()

    # Unknown company → 404.
    assert put("no-such-company-uuid", '{"flagged":true}').status_code == 404

    # Wrong method → 405.
    assert client.get(f"/api/companies/{cid}/flagged").status_code == 405


def test_reviewed_stamp_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    def stamp(company_id):
        return client.post(f"/api/companies/{company_id}/reviewed")

    # A fresh company has never been reviewed.
    con = open_db(db_path)
    assert triage.triage_rows(con)[0].reviewed_at == ""
    con.close()

    # Stamp → 200 with a reviewed_at in the detail; triage row carries it too.
    rec = stamp(cid)
    assert rec.status_code == 200, (rec.status_code, rec.text)
    assert rec.json()["reviewed_at"] != ""
    con = open_db(db_path)
    assert triage.triage_rows(con)[0].reviewed_at != ""
    con.close()

    # Stamping again still succeeds.
    assert stamp(cid).status_code == 200

    # Unknown company → 404; wrong method → 405.
    assert stamp("no-such-company-uuid").status_code == 404
    assert client.get(f"/api/companies/{cid}/reviewed").status_code == 405
