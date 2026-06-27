"""The status-vocabulary web routes."""

from __future__ import annotations

from web_helpers import new_test_app

from scout.store import statuses


def test_status_config_api(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    def get(path):
        rec = client.get(path)
        assert rec.status_code == 200, (path, rec.status_code)
        return rec.json()["statuses"]

    def put(path, body):
        return client.put(
            path, content=body, headers={"Content-Type": "application/json"}
        ).status_code

    # Defaults come back when unset.
    got = get("/api/outreach-statuses")
    assert len(got) == len(statuses.DEFAULT_OUTREACH_STATUSES) and got[0] == "initial contact"
    got = get("/api/application-stages")
    assert len(got) == len(statuses.DEFAULT_APPLICATION_STAGES) and got[0] == "applied"

    # PUT replaces and GET reflects it.
    assert put("/api/application-stages", '{"statuses":["applied","onsite","offer"]}') == 200
    got = get("/api/application-stages")
    assert len(got) == 3 and got[1] == "onsite"

    # Empty list → 400.
    assert put("/api/outreach-statuses", '{"statuses":[]}') == 400
