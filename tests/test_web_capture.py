"""Port of internal/web/capture_test.go — the link-capture pass, direct posting
add, and the posting sub-resource edits (details / company / + url / next-up
smoke)."""
from __future__ import annotations

import json

from scout import anthropic
from scout.store import companies as companies_store
from scout.store import postings as postings_store

from httpstub import http_server
from web_helpers import new_test_app, open_db

_JSON = {"Content-Type": "application/json"}


def _post(client, path, body=""):
    return client.post(path, content=body, headers=_JSON if body else {})


def _put(client, path, body):
    return client.put(path, content=body, headers=_JSON)


# --- POST /api/capture -------------------------------------------------------


def test_capture_needs_api_key(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)  # no key in env
    rec = _post(client, "/api/capture", '{"url":"https://acme.com/jobs/1"}')
    assert rec.status_code == 412, (rec.status_code, rec.text)


def test_capture_rejects_bad_kind(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)
    rec = _post(client, "/api/capture", '{"url":"https://acme.com","kind":"newsletter"}')
    assert rec.status_code == 400, (rec.status_code, rec.text)


def test_capture_end_to_end(tmp_path, monkeypatch):
    client, cid, _db_path = new_test_app(tmp_path, monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")  # resolver supplies the gate key

    page_body = "<p>Acme builds AI infrastructure. </p>" * 30

    def page(req):
        return 200, {"Content-Type": "text/html"}, f"<html><body><h1>Platform Engineer</h1>{page_body}</body></html>"

    ext = {
        "kind": "job_posting", "company_name": "Acme", "company_domain": "acme.com",
        "job_title": "Platform Engineer", "job_location": "NYC", "summary": "Infra role.",
        "vertical": "AI infra", "company_location": "",
    }

    def llm(req):
        body = json.dumps({
            "id": "msg_1", "model": "test", "stop_reason": "end_turn",
            "content": [{"type": "text", "text": json.dumps(ext)}],
        })
        return 200, {"Content-Type": "application/json"}, body

    with http_server(page) as page_url, http_server(llm) as llm_url:
        client.app.state.scout.anthropic = anthropic.Client(api_key="test-key", endpoint=llm_url)

        # Bad URL -> 400.
        assert _post(client, "/api/capture", '{"url":"javascript:alert(1)"}').status_code == 400

        # Happy path: attaches to the seeded company (no duplicate), echoes the result.
        rec = _post(client, "/api/capture", json.dumps({"url": page_url + "/jobs/1"}))
        assert rec.status_code == 200, (rec.status_code, rec.text)
        res = rec.json()
        assert res["kind"] == "job_posting" and not res["company_created"]
        assert res["company_id"] == cid
        assert res["posting"]["title"] == "Platform Engineer"

        # The jobs view serves the captured posting joined with its company.
        jobs = client.get("/api/postings").json()
        assert jobs["count"] == 1
        row = jobs["rows"][0]
        assert row["company"] == "Acme" and row["title"] == "Platform Engineer" and row["source"] == "capture"


def test_capture_fetch_failure_is_422(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")  # gate passes; fetch fails first

    def dead(req):
        return 403, {"Content-Type": "text/html"}, "<html><body>forbidden</body></html>"

    with http_server(dead) as dead_url:
        client.app.state.scout.anthropic = anthropic.Client(api_key="test-key", endpoint="http://unused.invalid")
        rec = _post(client, "/api/capture", json.dumps({"url": dead_url + "/jobs/1"}))
        assert rec.status_code == 422, (rec.status_code, rec.text)
        assert rec.json()["fetch_status"] == "http_403"


# --- POST /api/postings (direct add) -----------------------------------------


def test_add_posting_direct(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    # Own-site link: the host identifies the company, attaches to the seeded row.
    rec = _post(client, "/api/postings", '{"url":"https://acme.com/careers/123","title":"SE"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    res = rec.json()
    assert res["company_id"] == cid and not res["company_created"] and res["posting"]["title"] == "SE"
    first_id = res["posting"]["id"]

    # Idempotent by URL: the same link returns the same posting.
    rec = _post(client, "/api/postings", '{"url":"https://acme.com/careers/123"}')
    assert rec.status_code == 200
    assert rec.json()["posting"]["id"] == first_id

    # An ATS host the resolver doesn't cover (workable): plain insert, typed company
    # creates the company by name.
    rec = _post(client, "/api/postings", '{"url":"https://apply.workable.com/widgets/j/ABC123","company":"Widgets"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    res = rec.json()
    assert res["company_created"] and res["company_name"] == "Widgets"

    # The same kind of link with no company named is rejected, writing nothing.
    con = open_db(db_path)
    before = companies_store.count_companies(con)
    con.close()
    assert _post(client, "/api/postings", '{"url":"https://apply.workable.com/mystery/j/DEF456"}').status_code == 400
    con = open_db(db_path)
    assert companies_store.count_companies(con) == before
    con.close()

    # A bad URL is rejected before any write.
    assert _post(client, "/api/postings", '{"url":"javascript:alert(1)","company":"Evil"}').status_code == 400
    con = open_db(db_path)
    assert companies_store.count_companies(con) == before
    con.close()


# --- posting sub-resource edits ----------------------------------------------


def test_posting_details_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    p = postings_store.add_posting(con, cid, "https://acme.com/jobs/se", "Wrong Title")
    con.close()

    rec = _put(client, f"/api/postings/{p.id}/details", '{"title":"Staff Engineer","location":"Remote","comp_range":"$200k"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    got = rec.json()
    assert got["title"] == "Staff Engineer" and got["location"] == "Remote" and got["comp_range"] == "$200k"
    assert got["url"] == "https://acme.com/jobs/se"  # URL stays the posting's identity

    assert _put(client, "/api/postings/nope/details", '{"title":"x"}').status_code == 404
    assert client.get(f"/api/postings/{p.id}/details").status_code == 405


def test_posting_tracking_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    p = postings_store.add_posting(con, cid, "https://acme.com/jobs/se", "SE")
    con.close()

    rec = _put(client, f"/api/postings/{p.id}", '{"application_status":"screening","outreach_status":"initial contact"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    got = rec.json()
    assert got["application_status"] == "screening" and got["outreach_status"] == "initial contact"
    assert got["outreach_count"] == 0  # derived from the (empty) log

    assert _put(client, f"/api/postings/{p.id}", '{"outreach_status":"' + "x" * 100 + '"}').status_code == 400
    assert _put(client, "/api/postings/nope", "{}").status_code == 404
    assert client.get(f"/api/postings/{p.id}").status_code == 405

    rows = client.get("/api/postings").json()["rows"]
    assert len(rows) == 1
    assert rows[0]["application_status"] == "screening" and rows[0]["outreach_status"] == "initial contact"


def test_posting_company_api(tmp_path, monkeypatch):
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)

    # A second company to relink to.
    rec = _post(client, "/api/companies", '{"website":"https://automat.ai","name":"Automat AI"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    added = rec.json()["company_id"]
    assert added

    con = open_db(db_path)
    p = postings_store.add_posting(con, cid, "https://acme.com/jobs/se", "SE")
    con.close()

    rec = _put(client, f"/api/postings/{p.id}/company", '{"company_id":"' + added + '"}')
    assert rec.status_code == 200, (rec.status_code, rec.text)
    got = rec.json()
    assert got["company_id"] == added and got["posting"]["company_id"] == added
    assert got["company_name"] == "Automat AI"

    # Persisted.
    con = open_db(db_path)
    gp = postings_store.get_posting(con, p.id)
    con.close()
    assert gp is not None and gp.company_id == added

    # Unknown / blank target -> 400; unknown posting -> 404.
    assert _put(client, f"/api/postings/{p.id}/company", '{"company_id":"does-not-exist"}').status_code == 400
    assert _put(client, f"/api/postings/{p.id}/company", '{"company_id":""}').status_code == 400
    assert _put(client, "/api/postings/nope/company", '{"company_id":"' + added + '"}').status_code == 404
    assert client.get(f"/api/postings/{p.id}/company").status_code == 405


def test_posting_next_up_and_url(tmp_path, monkeypatch):
    """Smoke coverage for the two sub-routes with no Go web test."""
    client, cid, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    p = postings_store.add_posting(con, cid, "https://acme.com/jobs/se", "SE")
    con.close()

    # next-up toggles the queue mark.
    assert _put(client, f"/api/postings/{p.id}/next-up", '{"next_up":true}').json()["next_up"] is True
    assert _put(client, f"/api/postings/{p.id}/next-up", '{"next_up":false}').json()["next_up"] is False
    assert _put(client, "/api/postings/nope/next-up", '{"next_up":true}').status_code == 404
    assert client.get(f"/api/postings/{p.id}/next-up").status_code == 405

    # url changes the posting's link (validated).
    rec = _put(client, f"/api/postings/{p.id}/url", '{"url":"https://acme.com/jobs/new"}')
    assert rec.status_code == 200 and rec.json()["url"] == "https://acme.com/jobs/new"
    assert _put(client, f"/api/postings/{p.id}/url", '{"url":"javascript:alert(1)"}').status_code == 400
    assert _put(client, "/api/postings/nope/url", '{"url":"https://x.com/y"}').status_code == 404
    assert client.get(f"/api/postings/{p.id}/url").status_code == 405
