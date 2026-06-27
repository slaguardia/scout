"""Smoke coverage for the control surface: run-stage gating,
job stream/cancel, runs, and a real multipart CSV ingest end-to-end."""

from __future__ import annotations

from web_helpers import new_test_app, open_db

from scout import jobs
from scout.store import companies as companies_store


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
