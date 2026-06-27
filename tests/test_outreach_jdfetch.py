"""Tests for scout.outreach.jdfetch — JD fetch over the ATS API hosts.

A custom httpx transport rewrites a real ATS API host to a local test server while
preserving the path/query, so the real ATS-host regexes and URL construction are
exercised.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx

from scout.outreach.jdfetch import fetch_jd


class _RewriteHost(httpx.BaseTransport):
    """Redirect requests to a single upstream host to the test server, leaving the
    path/query intact."""

    def __init__(self, host: str, target: str):
        self.host = host
        self._t = httpx.URL(target)
        self._inner = httpx.HTTPTransport()

    def handle_request(self, request):
        if request.url.host == self.host:
            request.url = request.url.copy_with(scheme="http", host=self._t.host, port=self._t.port)
        return self._inner.handle_request(request)


class _Srv:
    """A tiny one-handler HTTP server (a captured `handler(path, query) -> (status,
    body)`)."""

    def __init__(self, handler):
        self.handler = handler
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                status, body = outer.handler(self.path)
                data = body.encode() if isinstance(body, str) else body
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.srv.server_address[1]}"

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


def test_fetch_jd_greenhouse():
    seen = {}

    def handler(path):
        if "/v1/boards/acme/jobs/123" not in path:
            return 404, '{"error":"nf"}'
        seen["query"] = path
        return 200, (
            '{"title":"Backend Engineer","location":{"name":"Remote"},'
            '"content":"<p>You will deploy into customer environments &amp; own reliability.</p>"}'
        )

    srv = _Srv(handler)
    try:
        httpc = httpx.Client(transport=_RewriteHost("boards-api.greenhouse.io", srv.url))
        res = fetch_jd(httpc, "https://boards.greenhouse.io/acme/jobs/123")
    finally:
        srv.close()
    assert "content=true" in seen.get("query", ""), "greenhouse: missing content=true"
    assert res.status.startswith("ok"), f"status = {res.status!r}"
    assert "deploy into customer environments & own reliability" in res.text
    assert "Backend Engineer" in res.text and "Remote" in res.text


def test_fetch_jd_lever():
    def handler(path):
        return 200, (
            '{"text":"Platform Engineer","descriptionPlain":"Build deployment tooling for embedded '
            'teams.","categories":{"location":"NYC"}}'
        )

    srv = _Srv(handler)
    try:
        httpc = httpx.Client(transport=_RewriteHost("api.lever.co", srv.url))
        res = fetch_jd(httpc, "https://jobs.lever.co/acme/abc-123")
    finally:
        srv.close()
    assert res.status.startswith("ok"), f"status = {res.status!r}"
    assert "Build deployment tooling" in res.text


def test_fetch_jd_ashby_matches_posting():
    def handler(path):
        return 200, json.dumps(
            {
                "jobs": [
                    {
                        "id": "00000000-0000-0000-0000-000000000001",
                        "title": "Other",
                        "location": "X",
                        "descriptionPlain": "wrong one",
                    },
                    {
                        "id": "abcdef00-0000-0000-0000-000000000002",
                        "title": "Backend",
                        "location": "Remote",
                        "descriptionPlain": "the right description",
                    },
                ]
            }
        )

    srv = _Srv(handler)
    try:
        httpc = httpx.Client(transport=_RewriteHost("api.ashbyhq.com", srv.url))
        res = fetch_jd(httpc, "https://jobs.ashbyhq.com/acme/abcdef00-0000-0000-0000-000000000002")
    finally:
        srv.close()
    assert res.status.startswith("ok"), f"status = {res.status!r}"
    assert "the right description" in res.text
    assert "wrong one" not in res.text


def test_fetch_jd_plain_fallback():
    def handler(path):
        return 200, (
            "<html><head><style>.x{}</style></head><body><h1>Senior Engineer</h1>"
            "<p>Own the platform.</p><script>noise()</script></body></html>"
        )

    srv = _Srv(handler)
    try:
        res = fetch_jd(httpx.Client(), srv.url + "/careers/role")
    finally:
        srv.close()
    assert res.status.startswith("ok"), f"status = {res.status!r}"
    assert "Senior Engineer" in res.text and "Own the platform." in res.text
    assert "noise()" not in res.text and ".x{}" not in res.text


def test_fetch_jd_empty_url():
    assert fetch_jd(None, "").status == "no JD URL"
