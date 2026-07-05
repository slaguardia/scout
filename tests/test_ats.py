"""The no-LLM ATS resolver path."""

from __future__ import annotations

import contextlib
import json

import httpx
import pytest
from httpstub import http_server

from scout import capture
from scout.capture import ats
from scout.capture.capture import KIND_JOB, Fields, Request
from scout.store import companies
from scout.store.companies import Company

ASHBY_JOB_ID = "edc19899-2e86-48e1-8b61-69cced824ab2"


def _client() -> httpx.Client:
    return httpx.Client(timeout=5, follow_redirects=True)


@contextlib.contextmanager
def _tripwire():
    """A server whose every hit is recorded — assert the list is empty after."""
    calls: list = []

    def handle(req):
        calls.append((req.method, req.path))
        return 418, {}, "tripwire"

    with http_server(handle) as url:
        yield url, calls


def _ashby_board_json() -> str:
    return json.dumps(
        {
            "apiVersion": "1",
            "jobs": [
                {"id": "other-job", "title": "Founder's Associate"},
                {
                    "id": ASHBY_JOB_ID,
                    "title": "Founding Engineer",
                    "department": "Engineering",
                    "team": "Engineering",
                    "employmentType": "FullTime",
                    "location": "San Francisco",
                    "isRemote": False,
                    "workplaceType": "OnSite",
                    "publishedAt": "2026-04-14T18:01:28.407+00:00",
                    "jobUrl": f"https://jobs.ashbyhq.com/foresight-health/{ASHBY_JOB_ID}",
                    "descriptionPlain": "About us: we raised a seed round.\n\nRole: build the core clinical platform.",
                    "compensation": {
                        "compensationTierSummary": "",
                        "scrapeableCompensationSalarySummary": "$150K – $200K",
                    },
                },
            ],
        }
    )


@contextlib.contextmanager
def _ashby_board_server():
    def handle(req):
        if req.path == "/posting-api/job-board/foresight-health":
            return 200, {"Content-Type": "application/json"}, _ashby_board_json()
        return 404, {}, "not found"

    with http_server(handle) as url:
        yield url


def test_run_resolves_ashby_without_llm(db, monkeypatch):
    with (
        _ashby_board_server() as board_url,
        _tripwire() as (board_page, board_calls),
        _tripwire() as (llm_url, llm_calls),
    ):
        monkeypatch.setattr(ats, "ashby_api_base", board_url)
        monkeypatch.setattr(ats, "ashby_board_base", board_page)  # hyphenated slug → must not fetch
        # graphql detection (best-effort) goes to the board server's 404.
        from scout.capture import questions

        monkeypatch.setattr(questions, "ashby_graphql_base", board_url)
        from scout import anthropic

        c = capture.Capturer(
            db=db,
            client=anthropic.Client(api_key="k", endpoint=llm_url),
            http=_client(),
        )

        pasted = f"https://jobs.ashbyhq.com/foresight-health/{ASHBY_JOB_ID}"
        res = c.run(Request(url=pasted))

        assert res.kind == KIND_JOB and res.fetch_status == "ok"
        assert res.company_name == "Foresight Health" and res.company_created
        assert "no LLM" in res.note
        p = res.posting
        assert p is not None
        assert p.title == "Founding Engineer"
        assert p.location == "San Francisco"
        assert p.department == "Engineering"
        assert p.employment_type == "Full-time"
        assert p.workplace_type == "On-site"
        assert p.posted_at == "2026-04-14"
        assert p.comp_range == "$150K – $200K"
        assert p.source == "capture"
        assert "core clinical platform" in p.description
        # The ATS host never identifies the company — keyed by name only.
        assert res.company_id == companies.company_id("", "Foresight Health")
        # The LLM and the board page were never fetched.
        assert llm_calls == []
        assert board_calls == []

        # Same link again → refresh in place, not a duplicate.
        res2 = c.run(Request(url=pasted))
        assert not res2.company_created and res2.posting_updated and res2.posting.id == p.id


def test_capture_ats_posting_keyless(db, monkeypatch):
    with _ashby_board_server() as board_url, _tripwire() as (board_page, _):
        monkeypatch.setattr(ats, "ashby_api_base", board_url)
        monkeypatch.setattr(ats, "ashby_board_base", board_page)
        c = capture.Capturer(db=db, http=_client())  # no Anthropic client at all

        res = c.capture_ats_posting(
            Request(
                url=f"https://jobs.ashbyhq.com/foresight-health/{ASHBY_JOB_ID}",
                kind=KIND_JOB,
                fields=Fields(title=""),
            )
        )
        assert res is not None and res.posting is not None
        assert res.company_name == "Foresight Health" and res.company_created
        assert (
            res.posting.title == "Founding Engineer" and res.posting.comp_range == "$150K – $200K"
        )

        # A link that isn't a recognized ATS posting returns None.
        assert c.capture_ats_posting(Request(url="https://acme.com/careers/123")) is None


def test_capture_ats_posting_for_company_pins_company(db, monkeypatch):
    with _ashby_board_server() as board_url, _tripwire() as (board_page, _):
        monkeypatch.setattr(ats, "ashby_api_base", board_url)
        monkeypatch.setattr(ats, "ashby_board_base", board_page)
        cid = companies.upsert_company(
            db, Company(source="test", name="Acme Inc", domain="acme.com", raw_json="{}")
        )
        c = capture.Capturer(db=db, http=_client())  # keyless

        res = c.capture_ats_posting_for_company(
            cid,
            Request(
                url=f"https://jobs.ashbyhq.com/foresight-health/{ASHBY_JOB_ID}",
                kind=KIND_JOB,
            ),
        )
        assert res is not None and res.posting is not None
        assert res.posting.company_id == cid
        assert (
            res.posting.title == "Founding Engineer" and res.posting.comp_range == "$150K – $200K"
        )
        assert companies.count_companies(db) == 1  # no twin minted

        assert (
            c.capture_ats_posting_for_company(cid, Request(url="https://acme.com/careers/1"))
            is None
        )


def test_run_ats_user_fields_win(db, monkeypatch):
    with (
        _ashby_board_server() as board_url,
        _tripwire() as (board_page, _),
        _tripwire() as (llm_url, _),
    ):
        monkeypatch.setattr(ats, "ashby_api_base", board_url)
        monkeypatch.setattr(ats, "ashby_board_base", board_page)
        from scout.capture import questions

        monkeypatch.setattr(questions, "ashby_graphql_base", board_url)
        from scout import anthropic

        c = capture.Capturer(
            db=db,
            client=anthropic.Client(api_key="k", endpoint=llm_url),
            http=_client(),
        )

        res = c.run(
            Request(
                url=f"https://jobs.ashbyhq.com/foresight-health/{ASHBY_JOB_ID}",
                kind=KIND_JOB,
                fields=Fields(name="Foresight", title="Founding Engineer (Platform)"),
            )
        )
        assert res.company_name == "Foresight"
        assert res.posting.title == "Founding Engineer (Platform)"
        # The board's fields still fill everything the user didn't type.
        assert res.posting.department == "Engineering" and res.posting.posted_at == "2026-04-14"


def test_resolve_ashby_reads_board_name(monkeypatch):
    jid = "11111111-2222-3333-4444-555555555555"

    def handle(req):
        if req.path == "/posting-api/job-board/chaidiscovery":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps(
                    {
                        "apiVersion": "1",
                        "jobs": [
                            {"id": jid, "title": "Software Engineer", "descriptionPlain": "Build."}
                        ],
                    }
                ),
            )
        if req.path == "/chaidiscovery":
            return (
                200,
                {"Content-Type": "text/html"},
                (
                    '<html><head><meta property="og:title" content="Chai Discovery Jobs">'
                    "<title>Chai Discovery Jobs</title></head><body></body></html>"
                ),
            )
        return 404, {}, "not found"

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "ashby_board_base", url)
        job = ats.resolve_ashby(_client(), url, "chaidiscovery", jid)
        assert job.company_name == "Chai Discovery"  # board title, not slugName("chaidiscovery")


@pytest.mark.parametrize(
    "head,status,want",
    [
        (
            '<meta property="og:title" content="Chai Discovery Jobs"><title>x</title>',
            200,
            "Chai Discovery",
        ),
        ("<title>Acme Robotics Careers</title>", 200, "Acme Robotics"),
        ("<title>Stripe</title>", 200, "Stripe"),
        ("<title>Foo Corp | Jobs</title>", 200, "Foo Corp"),
        ("<title>whatever</title>", 500, ""),
    ],
)
def test_fetch_board_name(head, status, want):
    def handle(req):
        return status, {"Content-Type": "text/html"}, f"<html><head>{head}</head></html>"

    with http_server(handle) as url:
        assert ats.fetch_board_name(_client(), url) == want


def test_resolve_greenhouse():
    def handle(req):
        if req.path == "/v1/boards/acme/jobs/123":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps(
                    {
                        "title": "Staff Engineer",
                        "absolute_url": "https://boards.greenhouse.io/acme/jobs/123",
                        "location": {"name": "Remote - US"},
                        "first_published": "2026-03-02T09:00:00-04:00",
                        "departments": [{"name": "No Department"}, {"name": "Platform"}],
                        "content": "&lt;p&gt;Build &amp;amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;",
                        "pay_input_ranges": [
                            {"min_cents": 15000000, "max_cents": 20000000, "currency_type": "USD"}
                        ],
                    }
                ),
            )
        if req.path == "/v1/boards/acme":
            return 200, {"Content-Type": "application/json"}, json.dumps({"name": "Acme Corp"})
        return 404, {}, "not found"

    with http_server(handle) as url:
        job = ats.resolve_greenhouse(_client(), url, "acme", "123")
        assert job.company_name == "Acme Corp"  # board-stated, not slug-derived
        assert (
            job.title == "Staff Engineer"
            and job.location == "Remote - US"
            and job.posted_at == "2026-03-02"
        )
        assert job.department == "Platform"  # "No Department" placeholder skipped
        assert job.comp_range == "$150K – $200K / year"
        assert job.description == "Build & ship.\n\n- Go\n- SQL"


def test_resolve_lever():
    def handle(req):
        if req.path == "/v0/postings/acme/abc":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps(
                    {
                        "text": "Backend Engineer",
                        "hostedUrl": "https://jobs.lever.co/acme/abc",
                        "createdAt": 1769904000000,
                        "workplaceType": "hybrid",
                        "categories": {
                            "commitment": "Full-time",
                            "department": "Eng",
                            "location": "NYC",
                        },
                        "descriptionPlain": "We build things.",
                        "lists": [
                            {
                                "text": "<b>Requirements</b>",
                                "content": "<li>Go</li><li>Postgres</li>",
                            }
                        ],
                        "salaryRange": {
                            "min": 140000,
                            "max": 180000,
                            "currency": "USD",
                            "interval": "per-year-salary",
                        },
                    }
                ),
            )
        return 404, {}, "not found"

    with http_server(handle) as url:
        job = ats.resolve_lever(_client(), url, "acme", "abc")
        assert job.title == "Backend Engineer" and job.department == "Eng"
        assert job.employment_type == "Full-time" and job.workplace_type == "Hybrid"
        assert job.posted_at == "2026-02-01"
        assert job.comp_range == "$140K – $180K / year"
        assert job.description == "We build things.\n\nRequirements\n- Go\n- Postgres"


def test_resolve_rippling():
    def handle(req):
        if req.path == f"/platform/api/ats/v1/board/plenful/jobs/{ASHBY_JOB_ID}":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps(
                    {
                        "uuid": ASHBY_JOB_ID,
                        "name": "Product Engineer",
                        "companyName": "Plenful",
                        "url": f"https://ats.rippling.com/plenful/jobs/{ASHBY_JOB_ID}",
                        "createdOn": "2026-06-04T10:56:08.683000-07:00",
                        "description": {
                            "company": "<p>About Plenful.</p>",
                            "role": "<p>Build things.</p><ul><li>Go</li><li>SQL</li></ul>",
                        },
                        "workLocations": ["San Francisco, CA", "Hybrid (Seattle, Washington, US)"],
                        "department": {"name": "Engineering"},
                        "employmentType": {"label": "SALARIED_FT", "id": "Salaried, full-time"},
                        "payRangeDetails": [
                            {
                                "location": "US",
                                "currency": "USD",
                                "frequency": "YEAR",
                                "rangeStart": 200000,
                                "rangeEnd": 215000,
                            },
                            {
                                "location": "NY",
                                "currency": "USD",
                                "frequency": "YEAR",
                                "rangeStart": 220000,
                                "rangeEnd": 235000,
                            },
                        ],
                    }
                ),
            )
        return 404, {}, "not found"

    with http_server(handle) as url:
        job = ats.resolve_rippling(_client(), url, "plenful", ASHBY_JOB_ID)
        assert job.company_name == "Plenful"
        assert job.title == "Product Engineer" and job.department == "Engineering"
        assert job.employment_type == "Salaried, full-time" and job.posted_at == "2026-06-04"
        assert job.location == "San Francisco, CA; Hybrid (Seattle, Washington, US)"
        assert job.comp_range == "$200K – $215K / year +"
        assert job.description == "About Plenful.\n\nBuild things.\n\n- Go\n- SQL"


def test_resolve_dover():
    def handle(req):
        if req.path == f"/api/v1/inbound/application-portal-job/{ASHBY_JOB_ID}":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps(
                    {
                        "id": ASHBY_JOB_ID,
                        "client_name": "Paratus",
                        "client_domain": "getparatus.com",
                        "title": "Founding Engineer",
                        "location": None,
                        "user_provided_description": "<h3><strong>About the Role</strong></h3><p>Build the core platform &amp; ship.</p><ul><li>Go</li><li>SQL</li></ul>",
                        "created": "2026-05-27T17:21:48.217346Z",
                        "locations": [{"location_type": "IN_OFFICE", "name": "San Francisco, CA"}],
                        "compensation": {
                            "upper_bound": 200000,
                            "lower_bound": 140000,
                            "currency_code": "USD",
                            "salary_range_type": "YEARLY",
                            "employment_type": "FULL_TIME",
                        },
                    }
                ),
            )
        return 404, {}, "not found"

    with http_server(handle) as url:
        job = ats.resolve_dover(_client(), url, "Paratus", ASHBY_JOB_ID)
        assert job.company_name == "Paratus"
        assert job.title == "Founding Engineer" and job.location == "San Francisco, CA"
        assert (
            job.workplace_type == "On-site"
            and job.employment_type == "Full-time"
            and job.posted_at == "2026-05-27"
        )
        assert job.comp_range == "$140K – $200K / year"
        assert job.url == url + f"/apply/Paratus/{ASHBY_JOB_ID}"
        assert job.description == "About the Role\nBuild the core platform & ship.\n\n- Go\n- SQL"


def test_resolve_ats_recognition():
    # Unrecognized shapes must return None before any network call (client unused).
    for url in [
        "https://jobs.ashbyhq.com/foresight-health",
        "https://jobs.ashbyhq.com/org/not-a-uuid",
        "https://ats.rippling.com/plenful",
        "https://ats.rippling.com/plenful/jobs/not-uuid",
        f"https://ats.rippling.com/plenful/{ASHBY_JOB_ID}",
        "https://app.dover.com/apply/Paratus",
        "https://app.dover.com/apply/Paratus/not-a-uuid",
        f"https://app.dover.com/Paratus/{ASHBY_JOB_ID}",
        "https://jobs.lever.co/acme",
        "https://boards.greenhouse.io/acme",
        "https://boards.greenhouse.io/acme/jobs/notnum",
        "https://acme.com/careers/123",
        "https://www.linkedin.com/jobs/view/123",
        "https://greenhouse.io.evil.com/acme/jobs/123",
        f"https://jobs-ashbyhq-com.evil.com/org/{ASHBY_JOB_ID}",
    ]:
        assert ats.resolve_ats(None, url) is None, url


def test_greenhouse_org_job():
    import urllib.parse

    cases = [
        ("https://boards.greenhouse.io/acme/jobs/4012345", "acme", "4012345"),
        ("https://job-boards.greenhouse.io/acme/jobs/4012345", "acme", "4012345"),
        ("https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345", "acme", "4012345"),
        ("https://boards.greenhouse.io/embed/job_app?for=acme", "", ""),
    ]
    for url, want_org, want_id in cases:
        u = urllib.parse.urlparse(url)
        segs = [s for s in u.path.split("/") if s]
        org, jid = ats.greenhouse_org_job(segs, urllib.parse.parse_qs(u.query))
        assert (org, jid) == (want_org, want_id), url


def test_money_range():
    cases = [
        (140000, 180000, "USD", "per-year-salary", "$140K – $180K / year"),
        (150000, 150000, "USD", "year", "$150K / year"),
        (0, 90000, "USD", "", "$90K"),
        (60, 75, "USD", "per-hour", "$60 – $75 / hour"),
        (80000, 100000, "CAD", "year", "80K – 100K CAD / year"),
        (0, 0, "USD", "year", ""),
    ]
    for lo, hi, cur, ivl, want in cases:
        assert ats.money_range(lo, hi, cur, ivl) == want


def test_slug_name():
    for slug, want in {
        "foresight-health": "Foresight Health",
        "acme": "Acme",
        "big_co": "Big Co",
    }.items():
        assert ats.slug_name(slug) == want


def test_iso_date():
    for s, want in {
        "2026-04-14T18:01:28.407+00:00": "2026-04-14",
        "2026-03-02T09:00:00-04:00": "2026-03-02",
        "2026-04-14": "2026-04-14",
        "not a date": "",
        "": "",
    }.items():
        assert ats.iso_date(s) == want


def test_ats_target_for():
    cases = [
        (
            f"https://jobs.ashbyhq.com/foresight-health/{ASHBY_JOB_ID}",
            "ashby",
            ats.ashby_api_base,
            "foresight-health",
            ASHBY_JOB_ID,
        ),
        (
            f"https://ats.rippling.com/plenful/jobs/{ASHBY_JOB_ID}",
            "rippling",
            ats.rippling_api_base,
            "plenful",
            ASHBY_JOB_ID,
        ),
        (
            f"https://app.dover.com/apply/Paratus/{ASHBY_JOB_ID}",
            "dover",
            ats.dover_api_base,
            "Paratus",
            ASHBY_JOB_ID,
        ),
        (
            f"https://jobs.lever.co/acme/{ASHBY_JOB_ID}",
            "lever",
            ats.lever_api_base,
            "acme",
            ASHBY_JOB_ID,
        ),
        (
            f"https://jobs.eu.lever.co/acme/{ASHBY_JOB_ID}",
            "lever",
            ats.lever_eu_api_base,
            "acme",
            ASHBY_JOB_ID,
        ),
        (
            "https://boards.greenhouse.io/acme/jobs/4012345",
            "greenhouse",
            ats.greenhouse_api_base,
            "acme",
            "4012345",
        ),
        (
            "https://job-boards.eu.greenhouse.io/acme/jobs/4012345",
            "greenhouse",
            ats.greenhouse_eu_api_base,
            "acme",
            "4012345",
        ),
        (
            "https://boards.eu.greenhouse.io/embed/job_app?for=acme&token=4012345",
            "greenhouse",
            ats.greenhouse_eu_api_base,
            "acme",
            "4012345",
        ),
    ]
    for url, want_ats, want_base, want_org, want_id in cases:
        got = ats.ats_target_for(url)
        assert got is not None, url
        assert (got.ats, got.base, got.org, got.id) == (want_ats, want_base, want_org, want_id), url
        assert capture.is_ats_posting(url)
    assert not capture.is_ats_posting("https://acme.com/careers/123")
