"""Port of internal/capture/jsonld_test.go — the JSON-LD JobPosting resolver."""
from __future__ import annotations

import httpx

from scout import capture
from scout.capture.capture import KIND_JOB, Request
from scout.capture.jsonld import parse_job_posting_ld
from scout.store import db as db_module
from scout.store import detail

from httpstub import http_server

# A full, realistic Google-for-Jobs JobPosting blob.
JOB_POSTING_LD_FIXTURE = """{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Backend Engineer",
  "description": "<p>Build our core platform &amp; ship.</p><ul><li>Go</li><li>SQL</li></ul>",
  "datePosted": "2026-05-01T00:00:00Z",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {"@type": "Organization", "name": "Acme Robotics", "sameAs": "https://acme.com"},
  "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress",
    "addressLocality": "San Francisco", "addressRegion": "CA",
    "addressCountry": {"@type": "Country", "name": "US"}}},
  "baseSalary": {"@type": "MonetaryAmount", "currency": "USD",
    "value": {"@type": "QuantitativeValue", "minValue": 150000, "maxValue": 190000, "unitText": "YEAR"}}
}"""


def test_parse_job_posting_ld():
    html = ('<html><head><script type="application/ld+json">' + JOB_POSTING_LD_FIXTURE
            + '</script></head><body>...</body></html>')
    jp = parse_job_posting_ld(html)
    assert jp is not None
    assert jp.title == "Senior Backend Engineer"
    assert jp.employment_type == "Full-time"
    assert jp.posted_at == "2026-05-01"
    assert jp.location == "San Francisco, CA, US"
    assert jp.comp_range == "$150K – $190K / year"
    assert jp.company_name == "Acme Robotics" and jp.company_url == "https://acme.com"
    assert jp.description == "Build our core platform & ship.\n\n- Go\n- SQL"


def test_parse_job_posting_ld_graph_and_array_type():
    html = """<script type='application/ld+json'>
    {"@context":"https://schema.org","@graph":[
      {"@type":"Organization","name":"Ignore Me"},
      {"@type":["JobPosting"],"title":"Founding Designer",
       "hiringOrganization":{"name":"Beta","url":"https://beta.io"},
       "jobLocationType":"TELECOMMUTE",
       "applicantLocationRequirements":{"@type":"Country","name":"United States"}}
    ]}</script>"""
    jp = parse_job_posting_ld(html)
    assert jp is not None
    assert jp.title == "Founding Designer" and jp.company_name == "Beta" and jp.company_url == "https://beta.io"
    assert jp.workplace_type == "Remote" and jp.location == "United States"


def test_parse_job_posting_ld_flat_salary():
    html = ('<script type="application/ld+json">{"@type":"JobPosting","title":"X",'
            '"baseSalary":{"currency":"USD","value":{"value":"60","unitText":"HOUR"}}}</script>')
    jp = parse_job_posting_ld(html)
    assert jp is not None and jp.comp_range == "$60 / hour"


def test_parse_job_posting_ld_none():
    for h in [
        '<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>',
        '<script type="application/ld+json">{"@type":"JobPosting"}</script>',  # no title
        '<script type="application/ld+json">not json</script>',
        '<html><body>no ld+json here</body></html>',
    ]:
        assert parse_job_posting_ld(h) is None, h


def test_run_resolves_jsonld_without_llm(tmp_path):
    body_tail = "<p>We build robots for warehouses. </p>" * 20

    def handle(req):
        return 200, {"Content-Type": "text/html"}, (
            f'<html><head><script type="application/ld+json">{JOB_POSTING_LD_FIXTURE}</script></head>'
            f'<body><h1>Senior Backend Engineer</h1>{body_tail}</body></html>'
        )

    with http_server(handle) as page_url:
        con = db_module.open_db(str(tmp_path / "scout.db"))
        try:
            c = capture.Capturer(db=con, http=httpx.Client(timeout=5, follow_redirects=True))  # no Client: keyless
            res = c.run(Request(url=page_url + "/careers/eng"))
            assert res.kind == KIND_JOB
            assert res.company_name == "Acme Robotics" and res.company_created
            assert "no LLM" in res.note
            assert res.posting is not None
            assert res.posting.title == "Senior Backend Engineer"
            assert res.posting.location == "San Francisco, CA, US"
            assert res.posting.comp_range == "$150K – $190K / year"
            # The company was identified by the JSON-LD hiring org's own domain.
            _, domain = detail.get_company_name(con, res.company_id)
            assert domain == "acme.com"
        finally:
            con.close()
