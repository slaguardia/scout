"""Behavior test for scout.verdict. Exercises the module end-to-end (Scorer.run
over a stubbed Anthropic client) plus the prompt/parse helpers, asserting the
observable contract: verdict + trace writes, Result accounting, stickiness, and
targeted re-scoring."""

from __future__ import annotations

import json
import threading

from scout import anthropic, filter, taste
from scout.store import companies, enrichment, trace, verdicts
from scout.store.companies import Company
from scout.verdict import (
    Scorer,
    build_system_prompt,
    build_user_prompt,
    parse_verdict,
)
from scout.verdict.verdict import BUILTIN_RUBRIC, HARD_CONTRACT
from tests.httpstub import http_server


class _VerdictStub:
    """Records request bodies and returns a canned verdict JSON + usage."""

    def __init__(
        self,
        verdict: str = "yes",
        reason: str = "AI dev tools",
        cache_create: int = 10,
        cache_read: int = 5,
    ):
        self.payload = {
            "content": [
                {"type": "text", "text": json.dumps({"verdict": verdict, "reason": reason})}
            ],
            "usage": {
                "cache_creation_input_tokens": cache_create,
                "cache_read_input_tokens": cache_read,
            },
        }
        self.lock = threading.Lock()
        self.bodies: list[str] = []

    def handle(self, req):
        with self.lock:
            self.bodies.append(req.body.decode())
        return 200, {"Content-Type": "application/json"}, json.dumps(self.payload)


def _client(base_url: str) -> anthropic.Client:
    c = anthropic.new("test-key")
    c.endpoint = base_url
    return c


def _seed(db, cid_name_summary):
    """Seed companies + an 'ok' enrichment row each. Returns the list of ids."""
    ids = []
    for name, domain, summary in cid_name_summary:
        cid = companies.upsert_company(
            db, Company(source="test", name=name, domain=domain, raw_json="{}")
        )
        enrichment.upsert_enrichment(
            db,
            enrichment.Enrichment(
                company_id=cid,
                website_url=f"https://{domain}",
                website_summary=summary,
                fetch_status="ok",
            ),
        )
        ids.append(cid)
    return ids


# --- helpers ---


def test_parse_verdict():
    assert parse_verdict('{"verdict":"yes","reason":"AI infra"}') == ("yes", "AI infra")
    # Wrapped in prose / fences.
    assert parse_verdict('Sure:\n```json\n{"verdict":"NO","reason":"crypto (excluded)"}\n```') == (
        "no",
        "crypto (excluded)",
    )
    # maybe, tolerant of whitespace/casing.
    assert parse_verdict('{"verdict":" Maybe ","reason":" adjacent "}') == ("maybe", "adjacent")
    for bad in ("no json here", '{"verdict":"perhaps","reason":"x"}'):
        try:
            parse_verdict(bad)
            raised = False
        except ValueError:
            raised = True
        assert raised, bad


def test_build_system_prompt_layers():
    sp = build_system_prompt("", "Avoid crypto.")
    assert sp.startswith(HARD_CONTRACT)
    assert BUILTIN_RUBRIC in sp  # no playbook → builtin rubric
    assert "--- CRITERIA (what the user wants) ---" in sp
    assert sp.rstrip().endswith("Avoid crypto.")
    # A playbook supersedes the builtin rubric.
    sp2 = build_system_prompt("MY PLAYBOOK", "Avoid crypto.")
    assert "MY PLAYBOOK" in sp2 and BUILTIN_RUBRIC not in sp2


def test_build_user_prompt_omits_blanks():
    c = verdicts.VerdictCandidate(name="Acme", domain="acme.com", website_summary="builds tools")
    up = build_user_prompt(c)
    assert "Company: Acme\n" in up
    assert "Domain: acme.com\n" in up
    assert "Headcount:" not in up  # 0 omitted
    # A blank funding stage is stated explicitly (not omitted) so a weak model
    # can't fabricate a round from a valuation in the website text.
    assert "Funding stage: unknown" in up and "do NOT infer" in up
    assert up.endswith("Return the JSON verdict now.")


def test_build_user_prompt_keeps_known_stage():
    c = verdicts.VerdictCandidate(name="Acme", stage="Series B")
    up = build_user_prompt(c)
    assert "Funding stage: Series B\n" in up
    assert "unknown" not in up


# --- end-to-end Scorer.run ---


def _scorer(db, client, **kw):
    return Scorer(
        con=db,
        taste=taste.from_brain("Hard dealbreakers: avoid crypto.", "brain:brief@test"),
        filter=filter.Taste(),  # enabled=False → passes every company
        client=client,
        **kw,
    )


def test_run_scores_and_writes_trace(db):
    ids = _seed(
        db,
        [
            ("Acme", "acme.com", "Acme builds AI dev tools"),
            ("Beta", "beta.com", "Beta builds AI infra"),
        ],
    )
    stub = _VerdictStub(verdict="yes", reason="AI dev tools")
    with http_server(stub.handle) as url:
        s = _scorer(db, _client(url))
        res = s.run()

    assert res.considered == 2
    assert res.scored == 2
    assert res.skipped == 0
    assert res.failed == 0
    assert res.by_verdict == {"yes": 2}
    # Cache token counts aggregate across both calls.
    assert res.cache_creation_tokens == 20
    assert res.cache_read_tokens == 10

    block = taste.from_brain("Hard dealbreakers: avoid crypto.", "brain:brief@test")
    for cid in ids:
        v = verdicts.get_verdict(db, cid)
        assert v is not None and v.verdict == "yes" and v.reason == "AI dev tools"
        assert v.taste_version == block.version
        assert v.model == anthropic.DEFAULT_MODEL
        tr = trace.company_trace(db, cid)
        assert len(tr) == 1 and tr[0].verdict == "yes"
        assert tr[0].criteria_source == "brain:brief@test"

    # The system prompt carried the criteria + hard contract; the user prompt the
    # company; cached=True sends the system as one ephemeral cache block.
    body = json.loads(stub.bodies[0])
    assert isinstance(body["system"], list)
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "avoid crypto" in body["system"][0]["text"]
    assert "Company:" in body["messages"][0]["content"]


def test_run_is_sticky(db):
    _seed(db, [("Acme", "acme.com", "Acme builds AI dev tools")])
    with http_server(_VerdictStub().handle) as url:
        first = _scorer(db, _client(url)).run()
    assert first.scored == 1

    # A second default run skips the already-scored company (no LLM call needed).
    stub2 = _VerdictStub(verdict="no", reason="should not be written")
    with http_server(stub2.handle) as url:
        second = _scorer(db, _client(url)).run()
    assert second.scored == 0
    assert second.skipped == 1
    assert len(stub2.bodies) == 0  # sticky skip happens before any send
    # The original verdict is untouched.
    assert verdicts.get_verdict(db, companies.company_id("acme.com", "Acme")).verdict == "yes"


def test_targeted_run_rescores_bypassing_filter(db):
    ids = _seed(db, [("Acme", "acme.com", "Acme builds AI dev tools")])
    with http_server(_VerdictStub(verdict="yes").handle) as url:
        _scorer(db, _client(url)).run()
    assert verdicts.get_verdict(db, ids[0]).verdict == "yes"

    # A targeted re-score overwrites the sticky verdict, even with the same
    # default/force flags, and bypasses the (here pass-all) filter.
    stub = _VerdictStub(verdict="no", reason="reconsidered")
    with http_server(stub.handle) as url:
        res = _scorer(db, _client(url), company_ids=ids).run()
    assert res.scored == 1
    assert len(stub.bodies) == 1  # the targeted company WAS re-sent
    assert verdicts.get_verdict(db, ids[0]).verdict == "no"


def test_run_records_parse_failure(db):
    _seed(db, [("Acme", "acme.com", "Acme builds AI dev tools")])

    class _GarbageStub:
        def __init__(self):
            self.payload = {
                "content": [{"type": "text", "text": "not json"}],
                "usage": {"cache_creation_input_tokens": 3, "cache_read_input_tokens": 1},
            }

        def handle(self, req):
            return 200, {"Content-Type": "application/json"}, json.dumps(self.payload)

    with http_server(_GarbageStub().handle) as url:
        res = _scorer(db, _client(url)).run()
    assert res.failed == 1
    assert res.scored == 0
    # Cache tokens are still aggregated on a parse failure.
    assert res.cache_creation_tokens == 3
    assert res.cache_read_tokens == 1
    # No verdict row written on a failed parse.
    assert verdicts.get_verdict(db, companies.company_id("acme.com", "Acme")) is None
