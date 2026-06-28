"""Smoke coverage for the control surface: run-stage gating,
job stream/cancel, runs, and a real multipart CSV ingest end-to-end."""

from __future__ import annotations

import json

from httpstub import http_server
from web_helpers import new_test_app, open_db

from scout import anthropic, jobs
from scout.store import companies as companies_store
from scout.store import enrichment as enrichment_store
from scout.store import verdicts as verdicts_store
from scout.web.routes.run import _needs_ok_enrichment


def test_run_gating(tmp_path, monkeypatch):
    client, _cid, _db_path = new_test_app(tmp_path, monkeypatch)

    # No runner wired -> 503 across the control surface.
    assert client.post("/api/run/enrich").status_code == 503
    assert client.post("/api/ingest").status_code == 503
    assert client.get("/api/jobs/x/stream").status_code == 503
    assert client.post("/api/jobs/x/cancel").status_code == 503

    # runs reports idle even with no runner.
    assert client.get("/api/runs").json() == {"busy_stage": ""}

    # Wire a runner: unknown stage -> 400; verdict without a key -> 412.
    client.app.state.scout.runner = jobs.Runner()
    assert client.post("/api/run/bogus").status_code == 400
    assert client.post("/api/run/verdict").status_code == 412

    # Unknown job -> 404 stream; cancel of an unknown job is a no-op false.
    assert client.get("/api/jobs/nope/stream").status_code == 404
    assert client.post("/api/jobs/nope/cancel").json() == {"canceled": False}


def test_ingest_csv_end_to_end(tmp_path, monkeypatch):
    client, _cid, db_path = new_test_app(tmp_path, monkeypatch)
    client.app.state.scout.runner = jobs.Runner()

    # Missing file field -> 400.
    assert client.post("/api/ingest").status_code == 400

    csv = b"Organization Name,Website\nNewCo,https://newco.com/\n"
    rec = client.post("/api/ingest", files={"csv": ("companies.csv", csv, "text/csv")})
    assert rec.status_code == 202, (rec.status_code, rec.text)
    job_id = rec.json()["job_id"]
    assert rec.json()["stage"] == "ingest"

    # Stream blocks until the job finishes; the run summary line is emitted.
    body = client.get(f"/api/jobs/{job_id}/stream").text
    assert "event: end" in body, body
    assert "read=1" in body, body

    # The company landed.
    con = open_db(db_path)
    assert companies_store.count_companies(con) == 2  # seeded Acme + NewCo
    con.close()


def test_needs_ok_enrichment(tmp_path, monkeypatch):
    # Returns exactly the requested companies that lack an 'ok' enrichment row,
    # in the requested order. A failed (non-'ok') row still counts as "needs it".
    _client, acme, db_path = new_test_app(tmp_path, monkeypatch)
    con = open_db(db_path)
    failed = companies_store.upsert_company(
        con, companies_store.Company(source="test", name="Timed", domain="timed.com", raw_json="{}")
    )
    bare = companies_store.upsert_company(
        con, companies_store.Company(source="test", name="Bare", domain="bare.com", raw_json="{}")
    )
    enrichment_store.upsert_enrichment(
        con, enrichment_store.Enrichment(company_id=acme, fetch_status="ok", website_summary="x")
    )
    enrichment_store.upsert_enrichment(
        con, enrichment_store.Enrichment(company_id=failed, fetch_status="timeout")
    )

    # acme is 'ok' (dropped); failed has a non-ok row; bare has none -> both kept.
    assert _needs_ok_enrichment(con, [acme, failed, bare]) == [failed, bare]
    assert _needs_ok_enrichment(con, [acme]) == []
    assert _needs_ok_enrichment(con, []) == []
    con.close()


def test_verdict_run_autoenriches_first(tmp_path, monkeypatch):
    # A targeted verdict run enriches any requested company that lacks an 'ok'
    # about-page before scoring; one that already has 'ok' is scored without a
    # re-fetch.
    client, acme, db_path = new_test_app(tmp_path, monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")  # satisfy the verdict gate
    (tmp_path / "taste.md").write_text("Prefer AI dev-tooling companies.\n")
    client.app.state.scout.runner = jobs.Runner()

    con = open_db(db_path)
    # Acme already enriched -> scored, not re-fetched. A second company with no
    # domain can't be fetched -> auto-enrich is a no-op for it, score skips it.
    enrichment_store.upsert_enrichment(
        con,
        enrichment_store.Enrichment(
            company_id=acme, fetch_status="ok", website_summary="AI developer tooling."
        ),
    )
    nodom = companies_store.upsert_company(
        con, companies_store.Company(source="test", name="NoDomain", domain="", raw_json="{}")
    )
    con.close()

    def llm(req):
        body = json.dumps(
            {
                "id": "msg_1",
                "model": "test",
                "stop_reason": "end_turn",
                "content": [
                    {"type": "text", "text": json.dumps({"verdict": "yes", "reason": "AI dev tools"})}
                ],
                "usage": {"cache_creation_input_tokens": 1, "cache_read_input_tokens": 1},
            }
        )
        return 200, {"Content-Type": "application/json"}, body

    with http_server(llm) as llm_url:
        client.app.state.scout.anthropic = anthropic.Client(api_key="test-key", endpoint=llm_url)
        rec = client.post("/api/run/verdict", json={"company_ids": [acme, nodom]})
        assert rec.status_code == 202, (rec.status_code, rec.text)
        body = client.get(f"/api/jobs/{rec.json()['job_id']}/stream").text

    assert "event: end" in body, body
    # The never-enriched company triggered an auto-enrich pass before scoring.
    assert "auto-enrich: 1 of 2" in body, body

    con = open_db(db_path)
    # Acme scored; the no-domain company stays unscored (nothing to fetch).
    assert verdicts_store.get_verdict(con, acme) is not None
    assert verdicts_store.get_verdict(con, nodom) is None
    # Acme's pre-existing 'ok' row was left untouched (not re-fetched).
    assert enrichment_store.get_enrichment(con, acme).fetch_status == "ok"
    con.close()
