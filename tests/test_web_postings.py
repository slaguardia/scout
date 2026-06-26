"""Port of internal/web/postings_test.go."""
from __future__ import annotations

from scout.store import postings

from web_helpers import new_test_app, open_db


def test_postings_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    def post(company_id, body):
        return client.post(f"/api/companies/{company_id}/postings", content=body,
                           headers={"Content-Type": "application/json"})

    # Happy path: 200 + the created posting.
    rec = post(cid, '{"url":"https://acme.com/jobs/se","title":"SE"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    p = rec.json()
    assert p["id"] and p["url"] == "https://acme.com/jobs/se" and p["title"] == "SE"

    # Empty url → 400.
    assert post(cid, '{"url":"  "}').status_code == 400

    # Non-http(s) scheme → 400, not 500.
    for bad in ("javascript:alert(1)", "data:text/html,x", "ftp://x.com/job"):
        rec = post(cid, '{"url":"' + bad + '"}')
        assert rec.status_code == 400, (bad, rec.status_code, rec.text)

    # Unknown company → 404.
    assert post("no-such-company-uuid", '{"url":"https://x.com/job"}').status_code == 404

    # GET wrong method on the postings route → 405.
    assert client.get(f"/api/companies/{cid}/postings").status_code == 405

    # Detail payload carries the posting.
    det = client.get(f"/api/companies/{cid}")
    assert det.status_code == 200
    detail = det.json()
    assert len(detail["postings"]) == 1
    assert detail["postings"][0]["url"] == "https://acme.com/jobs/se"


def test_posting_recapture(tmp_path, monkeypatch):
    # Force the no-key state regardless of the ambient env.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    con = open_db(db_path)
    p = postings.add_posting(con, cid, "https://acme.com/jobs/se", "SE")
    con.close()

    # Unknown posting → 404.
    assert client.post("/api/postings/no-such-id/recapture").status_code == 404

    # Wrong method → 405.
    assert client.get(f"/api/postings/{p.id}/recapture").status_code == 405

    # A non-ATS link with no key can't run the LLM pass → 412.
    assert client.post(f"/api/postings/{p.id}/recapture").status_code == 412
