"""Tests for scout.distill. The brain / Anthropic stubs are built on
tests/httpstub.py; each records request state so assertions happen AFTER the call,
never inside a handler thread."""

from __future__ import annotations

import json
import threading

from scout import anthropic, brainbot
from scout.distill import COMPANY_QUESTIONS, Distiller, basis_of


class _BrainStub:
    """Serves /recall with a fixed chunks payload, counting hits and recording the
    per-request k so the test can assert it after the run."""

    def __init__(self, chunks_json: str):
        self.chunks_json = chunks_json
        self.lock = threading.Lock()
        self.hits = 0
        self.ks: list[str] = []

    def handle(self, req):
        if req.path != "/recall":
            return 404, {}, b"not found"
        with self.lock:
            self.hits += 1
            self.ks.append(req.query.get("k", [""])[0])
        return 200, {"Content-Type": "application/json"}, self.chunks_json


class _AnthropicStub:
    """Records every request body (classify, then synthesize) and returns a canned
    text reply for each."""

    def __init__(self, reply: str):
        self.reply = reply
        self.lock = threading.Lock()
        self.bodies: list[str] = []

    def handle(self, req):
        with self.lock:
            self.bodies.append(req.body.decode())
        payload = json.dumps({"content": [{"type": "text", "text": self.reply}]})
        return 200, {"Content-Type": "application/json"}, payload


def _anthropic_client(base_url: str) -> anthropic.Client:
    c = anthropic.new("test-key")
    c.endpoint = base_url
    return c


CHUNKS_JSON = """{"chunks":[
    {"heading":"Target company","text":"Wants zero-to-one product companies.","score":0.5,"path":"Job Hunting/Target company"},
    {"heading":"Job Hunting","text":"Avoids fintech and crypto.","score":0.4,"path":"Job Hunting"}
]}"""

REPLY = "## Hard dealbreakers\n- Avoids fintech and crypto."


def test_distill_fan_out_classify_then_synthesize():
    from tests.httpstub import http_server

    brain = _BrainStub(CHUNKS_JSON)
    llm = _AnthropicStub(REPLY)
    with http_server(brain.handle) as brain_url, http_server(llm.handle) as llm_url:
        d = Distiller(brain=brainbot.new(brain_url), client=_anthropic_client(llm_url), k=7)
        res = d.run()

    # Fan-out: one recall per company question.
    assert brain.hits == len(COMPANY_QUESTIONS), f"recall hits = {brain.hits}"
    # The per-question k made it onto the wire.
    assert all(k == "7" for k in brain.ks), brain.ks
    # Dedup: two unique chunks despite 4x the duplicates.
    assert len(res.chunks) == 2
    # Two LLM calls: classify then synthesize.
    assert len(llm.bodies) == 2, f"anthropic calls = {len(llm.bodies)}"
    # The classify call (first) carries each unique chunk's text exactly once.
    classify = llm.bodies[0]
    assert classify.count("Wants zero-to-one product companies.") == 1, classify
    assert "Avoids fintech and crypto." in classify, classify
    # Both calls pin temperature to 0.
    for i, b in enumerate(llm.bodies):
        assert json.loads(b).get("temperature") == 0, f"call {i} should pin temperature to 0: {b}"
    # The brief is the (second) LLM reply; Items is the classify output.
    assert "Hard dealbreakers" in res.brief, res.brief
    assert res.items != ""
    # The stable version basis is derived and non-empty.
    assert res.basis != ""


def test_gather_then_synthesize_equals_distill():
    """The two-phase split is behavior-preserving: gather → synthesize yields the
    same brief AND the same basis as the one-shot distill, with no second recall."""
    from tests.httpstub import http_server

    # Two-phase: gather (recall only) then synthesize (classify+synthesize).
    g_brain = _BrainStub(CHUNKS_JSON)
    g_llm = _AnthropicStub(REPLY)
    with http_server(g_brain.handle) as brain_url, http_server(g_llm.handle) as llm_url:
        dg = Distiller(brain=brainbot.new(brain_url), client=_anthropic_client(llm_url))
        gathered, gather_basis = dg.gather()
        assert len(g_llm.bodies) == 0, f"gather must not call the LLM; saw {len(g_llm.bodies)}"
        gather_recalls = g_brain.hits
        assert gather_recalls == len(COMPANY_QUESTIONS), f"gather recalls = {gather_recalls}"
        two_phase_brief = dg.synthesize(gathered)
        # No SECOND recall fan-out.
        assert g_brain.hits == gather_recalls, "synthesize re-ran recall"

    # One-shot: distill (gather+classify+synthesize in one call).
    d_brain = _BrainStub(CHUNKS_JSON)
    d_llm = _AnthropicStub(REPLY)
    with http_server(d_brain.handle) as brain_url, http_server(d_llm.handle) as llm_url:
        dd = Distiller(brain=brainbot.new(brain_url), client=_anthropic_client(llm_url))
        one_shot_brief, one_shot_basis = dd.distill()

    assert two_phase_brief == one_shot_brief
    assert gather_basis == one_shot_basis


def test_basis_ignores_score_and_order():
    """basisOf must be independent of hybrid-search score and input order (both
    jitter run-to-run) but change when chunk content changes."""
    a = [
        brainbot.Chunk(path="P/A", heading="A", text="alpha", score=0.9),
        brainbot.Chunk(path="P/B", heading="B", text="beta", score=0.1),
    ]
    reordered_different_scores = [
        brainbot.Chunk(path="P/B", heading="B", text="beta", score=0.5),
        brainbot.Chunk(path="P/A", heading="A", text="alpha", score=0.0),
    ]
    assert basis_of(a) == basis_of(reordered_different_scores)
    changed_text = [
        brainbot.Chunk(path="P/A", heading="A", text="ALPHA CHANGED", score=0.9),
        brainbot.Chunk(path="P/B", heading="B", text="beta", score=0.1),
    ]
    assert basis_of(a) != basis_of(changed_text)


def test_distill_empty_brain_errors():
    from tests.httpstub import http_server

    brain = _BrainStub('{"chunks":[]}')
    llm = _AnthropicStub("should not be reached")
    with http_server(brain.handle) as brain_url, http_server(llm.handle) as llm_url:
        d = Distiller(brain=brainbot.new(brain_url), client=_anthropic_client(llm_url))
        try:
            d.run()
            raised = False
        except Exception:
            raised = True
    assert raised, "want an error when the brain returns no chunks"
    # Neither classify nor synthesize should run when there's nothing to distill.
    assert len(llm.bodies) == 0, f"LLM was called with no chunks to distill: {llm.bodies}"


def test_company_questions_exclude_roles():
    """The company distiller is scoped to companies only — no role/title questions."""
    for q in COMPANY_QUESTIONS:
        lower = q.lower()
        for banned in ("role", "title", "seniority"):
            assert banned not in lower, f"company question {q!r} mentions {banned!r}"
