"""The verdict web routes."""

from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout.store import trace, verdicts


def test_manual_verdict_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    def put(company_id, body):
        return client.put(
            f"/api/companies/{company_id}/verdict",
            content=body,
            headers={"Content-Type": "application/json"},
        )

    # Happy path: 200 + refreshed detail, stamped model "manual".
    rec = put(cid, '{"verdict":"no","reason":"crypto wallet (excluded)"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    d = rec.json()
    assert d["has_verdict"] and d["verdict"] == "no" and d["reason"] == "crypto wallet (excluded)"
    assert d["model"] == verdicts.MANUAL_MODEL

    # Verdict normalized to lower case; row overwritten in place.
    assert put(cid, '{"verdict":"YES","reason":""}').status_code == 200
    con = open_db(db_path)
    v = verdicts.get_verdict(con, cid)
    assert v is not None and v.verdict == "yes" and v.model == verdicts.MANUAL_MODEL

    # Each call appends a decision-trail row (two calls → two rows).
    events = trace.company_trace(con, cid)
    assert len(events) == 2

    # Each call also appends a durable override row.
    override_count = con.execute(
        "SELECT COUNT(1) FROM verdict_override WHERE company_id = ?", (cid,)
    ).fetchone()[0]
    assert override_count == 2

    # The latest override records the no → yes delta.
    row = con.execute(
        "SELECT COALESCE(from_verdict,''), to_verdict, COALESCE(criteria_version,'') "
        "FROM verdict_override WHERE company_id = ? ORDER BY id DESC LIMIT 1",
        (cid,),
    ).fetchone()
    con.close()
    assert row[0] == "no" and row[1] == "yes"

    # Invalid verdict value → 400.
    for bad in ('{"verdict":"strong-yes"}', '{"verdict":""}', '{"reason":"x"}'):
        assert put(cid, bad).status_code == 400, bad

    # Unknown company → 404 (no dangling verdict).
    assert put("no-such-company-uuid", '{"verdict":"yes"}').status_code == 404

    # Wrong method → 405.
    assert client.get(f"/api/companies/{cid}/verdict").status_code == 405
