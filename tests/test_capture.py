"""The generic fetch + Haiku capture path."""

from __future__ import annotations

import contextlib
import json

import httpx
import pytest
from httpstub import http_server

from scout import anthropic, capture
from scout.capture.capture import (
    DESC_CAP_RUNES,
    KIND_COMPANY,
    KIND_JOB,
    KIND_OTHER,
    MAX_PAGE_RUNES,
    Fields,
    Request,
    parse_extraction,
    resolve_company_domain,
)
from scout.store import companies, detail, enrichment, postings
from scout.store.companies import Company


def test_parse_extraction():
    clean = (
        '{"kind":"job_posting","company_name":"Acme","company_domain":"acme.com",'
        '"job_title":"SE","job_location":"SF","summary":"Sells things.","vertical":"AI","company_location":""}'
    )
    for name, raw in {
        "clean": clean,
        "fenced": "```json\n" + clean + "\n```",
        "preamble": "Here is the JSON:\n" + clean,
        "caps": clean.replace("job_posting", "JOB_POSTING", 1),
    }.items():
        e = parse_extraction(raw)
        assert e.kind == KIND_JOB and e.company_name == "Acme" and e.job_title == "SE", name

    for raw in {
        "empty": "",
        "prose": "I cannot classify this page.",
        "bad kind": '{"kind":"newsletter"}',
    }.values():
        with pytest.raises(ValueError):
            parse_extraction(raw)


def test_resolve_company_domain():
    cases = [
        (
            "acme.com",
            "https://boards.greenhouse.io/acme/jobs/1",
            "https://boards.greenhouse.io/acme/jobs/1",
            "acme.com",
        ),
        (
            "greenhouse.io",
            "https://boards.greenhouse.io/acme/jobs/1",
            "https://boards.greenhouse.io/acme/jobs/1",
            "",
        ),
        ("", "https://acme.com/careers/123", "https://www.acme.com/careers/123", "acme.com"),
        (
            "linkedin.com",
            "https://www.linkedin.com/jobs/view/1",
            "https://www.linkedin.com/jobs/view/1",
            "",
        ),
        (
            "acme.ashbyhq.com",
            "https://jobs.ashbyhq.com/acme/1",
            "https://jobs.ashbyhq.com/acme/1",
            "",
        ),
    ]
    for extracted, pasted, final, want in cases:
        assert resolve_company_domain(extracted, pasted, final) == want, (extracted, pasted, final)


# --- test harness ------------------------------------------------------------


def _ext(**kw) -> dict:
    base = {
        "kind": "",
        "company_name": "",
        "company_domain": "",
        "job_title": "",
        "job_location": "",
        "vertical": "",
        "company_location": "",
    }
    base.update(kw)
    return base


@contextlib.contextmanager
def _fake_anthropic(ext: dict):
    def handle(req):
        text = json.dumps(ext)
        resp = {
            "id": "msg_1",
            "model": "test",
            "content": [{"type": "text", "text": text}],
            "stop_reason": "end_turn",
        }
        return 200, {"Content-Type": "application/json"}, json.dumps(resp)

    with http_server(handle) as url:
        yield url


@contextlib.contextmanager
def _job_page():
    body = "<p>Acme builds AI infrastructure for ML platform teams. </p>" * 20

    def handle(req):
        return (
            200,
            {"Content-Type": "text/html"},
            f"<html><body><h1>Solutions Engineer</h1>{body}</body></html>",
        )

    with http_server(handle) as url:
        yield url


def _capturer(db, llm_url) -> capture.Capturer:
    return capture.Capturer(
        db=db,
        client=anthropic.Client(api_key="test-key", endpoint=llm_url),
        http=httpx.Client(timeout=5, follow_redirects=True),
    )


def test_run_captures_job_posting(db):
    with (
        _job_page() as page,
        _fake_anthropic(
            _ext(
                kind=KIND_JOB,
                company_name="Acme",
                company_domain="acme.com",
                job_title="Solutions Engineer",
                job_location="SF / remote",
                vertical="AI infra",
            )
        ) as llm,
    ):
        c = _capturer(db, llm)
        res = c.run(Request(url=page + "/jobs/1"))
        assert res.kind == KIND_JOB and res.fetch_status == "ok"
        assert res.company_id != "" and res.company_created and res.company_name == "Acme"
        assert res.posting is not None
        assert res.posting.title == "Solutions Engineer" and res.posting.location == "SF / remote"
        assert res.posting.source == "capture"
        assert "AI infrastructure" in res.posting.description
        assert res.company_id == companies.company_id("acme.com", "Acme")

        res2 = c.run(Request(url=page + "/jobs/1"))
        assert (
            not res2.company_created and res2.posting_updated and res2.posting.id == res.posting.id
        )
        assert len(postings.list_job_rows(db)) == 1


def test_capture_job_for_company_pins_company(db):
    with (
        _job_page() as page,
        _fake_anthropic(
            _ext(
                kind=KIND_JOB,
                company_name="Wrong Co",
                company_domain="wrong.com",
                job_title="Solutions Engineer",
                job_location="SF / remote",
            )
        ) as llm,
    ):
        c = _capturer(db, llm)
        cid = companies.upsert_company(
            db, Company(source="test", name="Acme Inc", domain="acme.com", raw_json="{}")
        )

        res = c.capture_job_for_company(cid, Request(url=page + "/jobs/1"))
        assert res is not None and res.posting is not None
        assert res.posting.company_id == cid
        assert res.posting.title == "Solutions Engineer" and res.posting.location == "SF / remote"
        assert "AI infrastructure" in res.posting.description
        assert companies.count_companies(db) == 1  # no twin minted

        res2 = c.capture_job_for_company(
            cid, Request(url=page + "/jobs/1", fields=Fields(title="Forward-Deployed Engineer"))
        )
        assert (
            res2 is not None
            and res2.posting is not None
            and res2.posting.title == "Forward-Deployed Engineer"
        )

        no_key = capture.Capturer(db=db, http=httpx.Client(timeout=5, follow_redirects=True))
        assert no_key.capture_job_for_company(cid, Request(url=page + "/jobs/1")) is None


def test_run_stores_full_description(db):
    body = "Acme builds AI infrastructure for ML platform teams. " * 200  # ~10.6k runes

    def handle(req):
        return (
            200,
            {"Content-Type": "text/html"},
            f"<html><body><h1>Solutions Engineer</h1><p>{body}</p></body></html>",
        )

    with (
        http_server(handle) as page,
        _fake_anthropic(
            _ext(
                kind=KIND_JOB,
                company_name="Acme",
                company_domain="acme.com",
                job_title="Solutions Engineer",
            )
        ) as llm,
    ):
        c = _capturer(db, llm)
        res = c.run(Request(url=page + "/jobs/1"))
        assert res.posting is not None
        got = len(res.posting.description)
        assert got > MAX_PAGE_RUNES
        assert got <= DESC_CAP_RUNES


def test_run_captures_company_page(db):
    with (
        _job_page() as page,
        _fake_anthropic(
            _ext(
                kind=KIND_COMPANY,
                company_name="Acme",
                company_domain="acme.com",
                vertical="AI infra",
                company_location="San Francisco",
            )
        ) as llm,
    ):
        c = _capturer(db, llm)
        res = c.run(Request(url=page + "/about"))
        assert res.kind == KIND_COMPANY and res.company_created and res.posting is None
        e = enrichment.get_enrichment(db, res.company_id)
        assert e is not None
        assert e.fetch_status == "ok" and "AI infrastructure" in (e.website_summary or "")


def test_run_other_kind_writes_nothing(db):
    with _job_page() as page, _fake_anthropic(_ext(kind=KIND_OTHER)) as llm:
        c = _capturer(db, llm)
        res = c.run(Request(url=page))
        assert res.kind == KIND_OTHER and res.company_id == "" and res.note != ""
        assert companies.count_companies(db) == 0


def test_run_pinned_kind_overrides_classifier(db):
    with _job_page() as page, _fake_anthropic(_ext(kind=KIND_OTHER)) as llm:
        c = _capturer(db, llm)
        res = c.run(
            Request(
                url=page + "/jobs/1",
                kind=KIND_JOB,
                fields=Fields(name="Acme", title="Solutions Engineer"),
            )
        )
        assert res.kind == KIND_JOB and res.company_id != "" and res.company_created
        assert res.posting is not None and res.posting.title == "Solutions Engineer"


def test_run_user_fields_win_over_extraction(db):
    with (
        _job_page() as page,
        _fake_anthropic(
            _ext(
                kind=KIND_COMPANY,
                company_name="Acme Robotics",
                company_domain="acme.com",
                vertical="robots",
                company_location="Austin",
            )
        ) as llm,
    ):
        c = _capturer(db, llm)
        res = c.run(
            Request(
                url=page + "/about",
                kind=KIND_COMPANY,
                fields=Fields(
                    name="Acme",
                    location="NYC",
                    vertical="AI infra",
                    headcount="250",
                    funding_stage="Series B",
                ),
            )
        )
        assert res.company_name == "Acme"
        d = detail.get_company_detail(db, res.company_id)
        assert d is not None
        assert (
            d.location == "NYC"
            and d.vertical == "AI infra"
            and d.headcount == 250
            and d.funding_stage == "Series B"
        )


def test_run_fetch_failure(db):
    def handle(req):
        return 403, {"Content-Type": "text/html"}, "<html><body>forbidden</body></html>"

    with http_server(handle) as page, _fake_anthropic(_ext(kind=KIND_JOB)) as llm:
        c = _capturer(db, llm)
        with pytest.raises(capture.FetchError) as ei:
            c.run(Request(url=page + "/jobs/1"))
        assert ei.value.status == "http_403"
        assert ei.value.result is not None and ei.value.result.fetch_status == "http_403"


def test_run_fetch_failure_company_fallback(db):
    def handle(req):
        # A Cloudflare-style challenge body so the status classifies as "challenge".
        return 403, {"Content-Type": "text/html"}, "<html><body>Just a moment...</body></html>"

    with http_server(handle) as page, _fake_anthropic(_ext(kind=KIND_OTHER)) as llm:
        c = _capturer(db, llm)
        res = c.run(
            Request(
                url=page + "/",
                kind=KIND_COMPANY,
                fields=Fields(name="Persona", funding_stage="Series C"),
            )
        )
        assert res.company_id != "" and res.company_created
        assert res.company_name == "Persona"
        assert res.fetch_status == "challenge"
        assert res.note != ""
        d = detail.get_company_detail(db, res.company_id)
        assert d is not None and d.funding_stage == "Series C"
        # No page text means no enrichment seed.
        assert enrichment.get_enrichment(db, res.company_id) is None


def test_add_bare_company_unidentifiable(db):
    with _fake_anthropic(_ext(kind=KIND_OTHER)) as llm:
        c = _capturer(db, llm)
        url = "https://boards.greenhouse.io/some/job"
        res, ok = c._add_bare_company(Request(url=url, kind=KIND_COMPANY), url, url, "challenge")
        assert res is None and ok is False
        assert companies.count_companies(db) == 0


def test_run_bad_url(db):
    with _fake_anthropic(_ext(kind=KIND_OTHER)) as llm:
        c = _capturer(db, llm)
        for bad in ["", "   ", "javascript:alert(1)", "ftp://x.com/j", "not a url"]:
            with pytest.raises(ValueError) as ei:
                c.run(Request(url=bad))
            assert str(ei.value).startswith("url "), bad
