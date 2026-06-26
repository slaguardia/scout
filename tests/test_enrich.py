"""Port of internal/enrich/*_test.go (challenge_test, notfound_test, facts_test,
run_test). The fetch tests use the threaded http stub (tests/httpstub.py) in place
of Go's httptest.NewTLSServer — the Enricher's `scheme` seam points it at http://."""
from __future__ import annotations

import threading

import httpx
import pytest

from scout import enrich
from scout.enrich import enrich as enrich_mod
from scout.enrich.facts import name_placeholder, parse_facts
from scout.store.enrichment import EnrichmentTarget

from tests.httpstub import http_server


def long_string(unit: str, n: int) -> str:
    return unit * n


# realContent is comfortably above MIN_CONTENT_RUNES so a 200 isn't flagged low_content.
REAL_CONTENT = long_string("Acme builds developer tools for AI teams. ", 20)


# --- challenge_test.go ---

def test_looks_like_challenge():
    cases = [
        ("cloudflare just a moment",
         "Just a moment... Checking your browser before accessing the site. This process is automatic. DDoS protection by Cloudflare.",
         True),
        ("perimeterx-style",
         "Please enable JavaScript and cookies to continue. Verify you are human.",
         True),
        ("ok real content",
         "Acme Corp builds AI infrastructure for machine learning platforms. We are a Series B startup based in San Francisco with a distributed team. Our open-source projects power developer tools at hundreds of companies. We're hiring senior engineers across the stack — staff, founding, and platform roles. Our customers include leading ML teams at FAANG and high-growth startups. The product is a unified orchestration layer for AI agents, with strong type safety and developer experience as our north star. Founded in 2022, latest round in 2025.",
         False),
        ("ok short but no challenge keyword", "Tiny landing page. Welcome.", False),
        ("long page incidentally mentioning challenge boilerplate",
         long_string("Welcome to our site. ", 60) + " Just a moment... ", False),
        ("empty", "", False),
    ]
    for name, text, want in cases:
        assert enrich_mod.looks_like_challenge(text) == want, name


def test_status_for_bad_code():
    cases = [
        ("cloudflare challenge on a 403", 403,
         "<html><head><style>body{display:flex}</style></head><body><h1>Just a moment...</h1><script>window._cf_chl_opt={};</script></body></html>",
         "challenge"),
        ("challenge served as a 503", 503,
         "<html><body>Checking your browser before accessing the site.</body></html>",
         "challenge"),
        ("plain forbidden, no challenge body", 403, "<html><body>forbidden</body></html>", "http_403"),
        ("empty body falls back to the code", 403, "", "http_403"),
        ("not found", 404, "<html><body>Page not found</body></html>", "http_404"),
    ]
    for name, code, body, want in cases:
        assert enrich_mod.status_for_bad_code(code, body.encode()) == want, name


# --- notfound_test.go ---

def test_looks_like_not_found():
    cases = [
        ("classic soft 404",
         "404 Error. The page you were looking for could not be found. Go back home.", True),
        ("page not found", "Oops! Page not found. Try searching instead.", True),
        ("ok real about page",
         "Acme Corp builds AI infrastructure for machine learning platforms. We are a Series B startup based in San Francisco with a distributed team. We're hiring senior engineers across the stack. Founded in 2022.",
         False),
        ("long page incidentally mentioning page not found",
         long_string("Welcome to our site. ", 60) + " page not found ", False),
        ("empty", "", False),
    ]
    for name, text, want in cases:
        assert enrich_mod.looks_like_not_found(text) == want, name


def _enricher_against(base_url: str) -> tuple[enrich.Enricher, str]:
    """Wire an Enricher to a test server, mirroring the scheme-forcing fetch_one
    does. The http stub is plain HTTP, so point scheme at http://."""
    domain = base_url[len("http://"):]
    e = enrich.Enricher(client=enrich.new_http_client(), scheme="http")
    return e, domain


def test_fetch_one_stores_final_url():
    """We store where we actually landed after a redirect, not the path we guessed."""
    def handle(req):
        if req.path == "/about":
            return 301, {"Location": "/company"}, b""
        if req.path == "/company":
            return 200, {"Content-Type": "text/html"}, "<html><body>" + REAL_CONTENT + "</body></html>"
        return 404, {"Content-Type": "text/html"}, "<html><body>404 not here</body></html>"

    with http_server(handle) as base:
        e, domain = _enricher_against(base)
        rec = e.fetch_one(EnrichmentTarget(company_id="c1", domain=domain))
    assert rec.fetch_status == "ok"
    assert rec.website_url == base + "/company"


def test_fetch_one_skips_soft_404():
    """A 200-with-not-found-body candidate is skipped and leaves nothing behind."""
    def handle(req):
        if req.path in ("/about", "/about-us", "/company"):
            return 200, {"Content-Type": "text/html"}, "<html><body>Page not found. Try our homepage.</body></html>"
        return 200, {"Content-Type": "text/html"}, "<html><body>" + REAL_CONTENT + "</body></html>"

    with http_server(handle) as base:
        e, domain = _enricher_against(base)
        rec = e.fetch_one(EnrichmentTarget(company_id="c1", domain=domain))
    assert rec.fetch_status == "ok"
    assert rec.website_url == base + "/"
    assert "page not found" not in (rec.website_summary or "").lower()


def test_fetch_one_all_soft_404():
    """Every candidate a soft 404 → store no URL at all."""
    def handle(req):
        return 200, {"Content-Type": "text/html"}, "<html><body>404 Error. Page not found.</body></html>"

    with http_server(handle) as base:
        e, domain = _enricher_against(base)
        rec = e.fetch_one(EnrichmentTarget(company_id="c1", domain=domain))
    assert rec.website_url is None
    assert rec.fetch_status == "soft_404"


def test_fetch_one_skips_low_content():
    """A thin JS-shell candidate doesn't end the walk: the homepage must win."""
    def handle(req):
        if req.path in ("/about", "/about-us", "/company"):
            return 200, {"Content-Type": "text/html"}, "<html><head><title>undefined | Acme</title></head><body></body></html>"
        return 200, {"Content-Type": "text/html"}, "<html><body>" + REAL_CONTENT + "</body></html>"

    with http_server(handle) as base:
        e, domain = _enricher_against(base)
        rec = e.fetch_one(EnrichmentTarget(company_id="c1", domain=domain))
    assert rec.fetch_status == "ok"
    assert rec.website_url == base + "/"


def test_fetch_one_all_low_content():
    """Every candidate a thin shell → record low_content and cache the residual."""
    def handle(req):
        return 200, {"Content-Type": "text/html"}, "<html><head><title>undefined | Acme</title></head><body></body></html>"

    with http_server(handle) as base:
        e, domain = _enricher_against(base)
        rec = e.fetch_one(EnrichmentTarget(company_id="c1", domain=domain))
    assert rec.fetch_status == "low_content"
    assert rec.website_url is not None
    assert rec.website_summary != ""


# --- facts_test.go ---

def test_parse_facts():
    f = parse_facts('{"name":"Acme","vertical":"Robotics, AI","location":"Austin, TX","headcount":120,"funding_stage":"Series A"}')
    assert f.name == "Acme" and f.vertical == "Robotics, AI" and f.headcount == 120 and f.funding_stage == "Series A"

    f = parse_facts('Here you go:\n```json\n{"name": " Acme ", "headcount": -3}\n```')
    assert f.name == "Acme"  # trimmed
    assert f.headcount == 0  # negative clamps to 0

    with pytest.raises(ValueError):
        parse_facts("no json here")


def test_name_placeholder():
    cases = [
        ("", "acme.com", True),
        ("acme.com", "acme.com", True),
        ("ACME.COM ", "acme.com", True),
        ("Acme", "acme.com", False),
    ]
    for name, domain, want in cases:
        assert name_placeholder(name, domain) == want, (name, domain)


# --- run_test.go ---

def test_run_emits_parallel_progress(db):
    """Run announces the worker count up front and emits a 'picked up' line per
    company — the cues that make the completion feed legibly parallel."""
    def handle(req):
        return 200, {"Content-Type": "text/html"}, "<html><body>" + REAL_CONTENT + "</body></html>"

    with http_server(handle) as base:
        domain = base[len("http://"):]
        names = ["Acme", "Beta", "Gamma"]
        for i, name in enumerate(names):
            db.execute(
                "INSERT INTO companies (id, source, name, domain, raw_json) VALUES (?, 'test', ?, ?, '{}')",
                (f"c{i}", name, domain),
            )

        lock = threading.Lock()
        lines: list[str] = []

        def progress(s):
            with lock:
                lines.append(s)

        e = enrich.Enricher(
            con=db,
            client=enrich.new_http_client(),
            scheme="http",
            workers=2,
            progress=progress,
        )
        e.run(force=True)

    joined = "\n".join(lines)
    assert "enriching 3 companies · 2 workers in parallel" in joined, joined
    for name in names:
        assert f"· {name}…" in joined, joined
