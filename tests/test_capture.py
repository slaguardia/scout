"""The generic fetch + Haiku capture path."""

from __future__ import annotations

import contextlib
import json
from urllib.parse import urlparse

import httpx
import pytest
from httpstub import http_server

from scout import anthropic, capture, ingest
from scout import enrich as enrich_pkg
from scout.capture.capture import (
    DESC_CAP_RUNES,
    KIND_COMPANY,
    KIND_JOB,
    KIND_OTHER,
    MAX_PAGE_RUNES,
    Fields,
    Request,
    company_domain_from_text,
    domain_reads_as_name,
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
        auto_enrich=False,
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

        no_key = capture.Capturer(
            db=db,
            http=httpx.Client(timeout=5, follow_redirects=True),
            auto_enrich=False,
        )
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


# --- the hiring company's own domain, when the posting isn't on its site ------


def test_company_domain_from_text():
    cases = [
        # The plain case: the JD links the company's own site.
        ("We're hiring. See https://ramp.com/careers for more.", "Ramp", "ramp.com"),
        # A bare "www." host in prose, no scheme.
        ("Read more at www.palantir.com today.", "Palantir", "palantir.com"),
        # The JD links the blog, not the root — the identity is the registrable domain.
        ("Our writeup: https://blog.roboflow.com/vlm", "Roboflow", "roboflow.com"),
        # A name the domain only partly contains, in both directions.
        ("Apply at https://withpersona.com/careers", "Persona", "withpersona.com"),
        ("See https://applied.co/about", "Applied Intuition", "applied.co"),
        # Everything a JD links that ISN'T the company: the investor, a compliance
        # site, the ATS it's posted on, its own LinkedIn.
        (
            "Backed by https://lsvp.com. E-Verify: https://e-verify.gov. "
            "Apply: https://jobs.lever.co/acme/1 or https://linkedin.com/company/acme",
            "Acme",
            "",
        ),
        # A marketplace host that shares nothing with the name is not the company.
        ("Posted via https://www.paraform.com/share/palantir/x", "Palantir", ""),
        # Too short a root matches too loosely — "ai" must not claim "Skild AI".
        ("Docs at https://ai.dev/guide", "Skild AI", ""),
        # A bare host with neither scheme nor "www." is not read as a link at all —
        # prose is full of "Node.js" and "e.g." and none of them are domains.
        ("We are Ramp. Find us at ramp.com.", "Ramp", ""),
        # No name to verify against means no candidate can be verified.
        ("https://ramp.com", "", ""),
    ]
    for text, name, want in cases:
        assert company_domain_from_text(text, name) == want, (name, text)


def test_domain_reads_as_name():
    assert domain_reads_as_name("runpulse.com", "Pulse")
    assert domain_reads_as_name("secondfront.com", "Second Front Systems")
    assert domain_reads_as_name("applied.co", "Applied Intuition")
    assert not domain_reads_as_name("paraform.com", "Palantir")
    assert not domain_reads_as_name("acme.com", "")


def test_job_on_a_marketplace_host_takes_the_domain_the_body_names(db):
    """A posting hosted somewhere that is not the hiring company: the page's own
    host must not become the company's identity when the body names the real one.
    The stub serves on 127.0.0.1, which reads as no company at all — exactly the
    recruiting-marketplace shape."""
    body = "<p>Palantir builds decision platforms. See www.palantir.com. </p>" * 20

    def handle(req):
        return 200, {"Content-Type": "text/html"}, f"<html><body>{body}</body></html>"

    with http_server(handle) as page, _fake_anthropic(
        _ext(kind=KIND_JOB, company_name="Palantir", job_title="FDE")
    ) as llm:
        res = _capturer(db, llm).run(Request(url=page + "/share/palantir/1"))
        assert res.company_name == "Palantir"
        assert res.company_id == companies.company_id("palantir.com", "Palantir")


def test_extracted_domain_survives_when_it_reads_as_nothing(db):
    """The fallback must never DEMOTE a stated domain. "about.google" reads as no
    company, and nothing in the body corroborates one — so it stands."""
    body = "<p>Google builds search. </p>" * 40

    def handle(req):
        return 200, {"Content-Type": "text/html"}, f"<html><body>{body}</body></html>"

    with http_server(handle) as page, _fake_anthropic(
        _ext(kind=KIND_JOB, company_name="Google", company_domain="about.google", job_title="SWE")
    ) as llm:
        res = _capturer(db, llm).run(Request(url=page + "/jobs/1"))
        assert res.company_id == companies.company_id("about.google", "Google")


# --- auto-enrich a company that arrived through a job link -------------------


def test_autoenrich_fetches_a_new_company_about_page(db, monkeypatch):
    """A company that arrives through a job link lands enriched, instead of waiting
    for a verdict run to notice it was never fetched."""
    paths = []

    def handle(req):
        paths.append(req.path)
        if req.path != "/about":
            return 404, {}, "not found"
        return (
            200,
            {"Content-Type": "text/html"},
            "<html><body><p>Acme builds AI infrastructure for ML teams. </p>"
            + "<p>We are hiring across the whole stack. </p>" * 30
            + "</body></html>",
        )

    with http_server(handle) as site:
        host = urlparse(site).netloc
        # The enricher fetches over https in production; point it at the stub.
        real = enrich_pkg.Enricher
        monkeypatch.setattr(
            enrich_pkg, "Enricher", lambda **kw: real(scheme="http", **kw)
        )

        # Insert directly: a host:port isn't a valid identity domain, so the normal
        # capture path would drop it. The enrich tests bind their stub the same way.
        cid = "c-autoenrich"
        db.execute(
            "INSERT INTO companies (id, source, name, domain, raw_json) "
            "VALUES (?, 'test', 'Acme', ?, '{}')",
            (cid, host),
        )
        assert enrichment.get_enrichment(db, cid) is None

        c = capture.Capturer(db=db, http=httpx.Client(timeout=5, follow_redirects=True))
        c._autoenrich(cid, host)

        rec = enrichment.get_enrichment(db, cid)
        assert rec is not None and rec.fetch_status == "ok"
        assert "/about" in paths

        # Already enriched → a later capture of the same company re-fetches nothing.
        paths.clear()
        c._autoenrich(cid, host)
        assert paths == []


def test_autoenrich_skips_a_company_with_no_domain(db):
    """No domain is the whole reason enrichment used to be impossible — it stays a
    no-op rather than writing a "no_domain" row the capture flow can't act on."""
    c = capture.Capturer(db=db, http=httpx.Client(timeout=5))
    cid, _ = ingest.ensure_company(db, ingest.CapturedCompany(name="Stealth Co"))
    c._autoenrich(cid, "")
    assert enrichment.get_enrichment(db, cid) is None
