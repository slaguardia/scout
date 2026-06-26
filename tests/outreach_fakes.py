"""Shared fakes for the outreach engine tests — the Python analogues of the Go
fakeAnthropic / fakeBrain test servers (engine_test.go, discover_test.go).

Both are driven by tests.httpstub.http_server (a threaded 127.0.0.1 server). A
handler thread can't raise into the test, so unexpected-call errors are recorded
and asserted AFTER the run.
"""
from __future__ import annotations

import json
import sqlite3
import threading

from scout import anthropic
from scout.outreach import Engine
from scout.store import companies, outreach_drafts, outreach_template, postings
from scout.store.companies import Company

TEST_TEMPLATE = (
    "Subject: [Name] | intro — {{role}}\n\nHi [Name],\n\n"
    "{{hook: one true thing about {{company}} tied to my work}}\n\n"
    "I spent five years at Globex Systems in a forward-deployed role.\n\n"
    "{{closer: ask about the {{role}} role}}\n\nThanks,\nAlex"
)
VERBATIM_LINE = "I spent five years at Globex Systems in a forward-deployed role."


class FakeAnthropic:
    """Serves scripted text replies from a FIFO queue: each /v1/messages call pops
    the next reply and records the raw request body (so tests can assert on
    prompts). Mirrors engine_test.go's fakeAnthropic."""

    def __init__(self, replies: list[str]):
        self.replies = replies
        self.calls = 0          # successful scripted replies (the reply index)
        self.reqs: list[str] = []   # raw request body per call, in order
        self.errors: list[str] = []
        self._lock = threading.Lock()

    def handle(self, req):
        with self._lock:
            self.reqs.append(req.body.decode())
            if self.calls >= len(self.replies):
                self.errors.append(f"unexpected anthropic call #{self.calls + 1} "
                                   f"(only {len(self.replies)} scripted)")
                return 500, {}, '{"error":"no scripted reply"}'
            reply = self.replies[self.calls]
            self.calls += 1
        body = json.dumps({
            "id": "msg", "model": "test", "stop_reason": "end_turn",
            "content": [{"type": "text", "text": reply}],
        })
        return 200, {"Content-Type": "application/json"}, body


class FakeBrain:
    """Serves /map (title+path tree), /doc (whole document), and /changes (the
    cursor/changed signal) from an in-memory doc set. Mirrors discover_test.go's
    fakeBrain. docs maps id -> a dict {id,title,path,version,text}."""

    def __init__(self, docs: dict[str, dict], cursor: str = ""):
        self.docs = docs
        self.cursor = cursor

    def handle(self, req):
        hdr = {"Content-Type": "application/json"}
        if req.path == "/changes":
            since = req.query.get("since", [""])[0]
            return 200, hdr, json.dumps({"cursor": self.cursor, "changed": since != self.cursor})
        if req.path == "/map":
            sources = [{"id": d["id"], "title": d["title"], "path": d["path"],
                        "parent_id": None, "version": d["version"]} for d in self.docs.values()]
            return 200, hdr, json.dumps({"sources": sources})
        if req.path == "/doc":
            id = req.query.get("id", [""])[0]
            d = self.docs.get(id)
            if d is None:
                return 404, hdr, json.dumps({"error": "unknown id"})
            return 200, hdr, json.dumps(d)
        return 404, hdr, json.dumps({"error": "not found"})


def make_engine(con: sqlite3.Connection, base: str, model: str = "test-model") -> Engine:
    """Wire an Engine onto a fake Anthropic server (base) + a fresh DB connection,
    seeding the test template (Go's newEngine does the same)."""
    client = anthropic.Client(api_key="k", endpoint=base)
    outreach_template.put_outreach_template(con, TEST_TEMPLATE)
    return Engine(con=con, client=client, model=model)


def seed_experience(con: sqlite3.Connection) -> None:
    """Cache one experience source so the draft gate + honesty check have ground
    truth."""
    from scout.store import outreach_sources
    outreach_sources.upsert_outreach_source(con, outreach_sources.OutreachSource(
        need="experience", page_id="exp1", title="Past Experience",
        content="Five years at Globex Systems, forward-deployed, led a small infra team ~2y, Secret clearance.",
        version="v1",
    ))


def seed_posting_draft(con: sqlite3.Connection) -> int:
    """Create a company + posting + draft and return the draft id."""
    cid = companies.upsert_company(con, Company(
        source="test", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(con, cid, "https://acme.invalid/careers/backend", "Backend Engineer")
    d = outreach_drafts.create_outreach_draft(con, p.id)
    return d.id


def seed_template(con: sqlite3.Connection, tmpl: str = TEST_TEMPLATE) -> None:
    outreach_template.put_outreach_template(con, tmpl)
