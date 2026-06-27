"""A tiny local HTTP server for client tests. The handler records each request
and returns a canned response, so a test asserts the request shape AFTER the call
(handler threads can't raise into the test thread) and parses the parsed response.
"""

from __future__ import annotations

import contextlib
import http.server
import threading
from urllib.parse import parse_qs, urlparse


class Request:
    """A captured request: method, path, parsed query, headers, raw body bytes."""

    def __init__(self, method: str, raw_path: str, headers, body: bytes):
        self.method = method
        parsed = urlparse(raw_path)
        self.path = parsed.path
        self.raw_query = parsed.query
        self.query = parse_qs(parsed.query, keep_blank_values=True)
        self.headers = headers
        self.body = body


@contextlib.contextmanager
def http_server(handle):
    """Spin up a 127.0.0.1 HTTP server on a random port in a daemon thread; yield
    the base URL. `handle(req) -> (status, headers_dict, body)` where body is
    str|bytes."""

    class H(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _serve(self):
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length) if length else b""
            req = Request(self.command, self.path, self.headers, body)
            status, hdrs, out = handle(req)
            if isinstance(out, str):
                out = out.encode()
            # Close after each response: no keep-alive, so the server's accept loop
            # stays responsive to shutdown().
            self.close_connection = True
            self.send_response(status)
            for k, v in (hdrs or {}).items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(out)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(out)

        do_GET = _serve
        do_POST = _serve

        def log_message(self, *args):  # silence the default stderr access log
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    srv.daemon_threads = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        yield f"http://127.0.0.1:{srv.server_address[1]}"
    finally:
        srv.shutdown()
        srv.server_close()
