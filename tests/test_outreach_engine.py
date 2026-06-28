"""The whole outreach pipeline driven by the fake Anthropic FIFO server."""

from __future__ import annotations

import json

import pytest

from scout.store import outreach_drafts, postings, prompt_overrides
from scout.store.postings import CapturedPosting
from tests.httpstub import http_server
from tests.outreach_fakes import (
    VERBATIM_LINE,
    FakeAnthropic,
    make_engine,
    seed_experience,
    seed_posting_draft,
)

RESEARCH_JSON = (
    '{"company":"Acme","what_they_do":"infra","customer":"enterprises","stage":"Series B",'
    '"headcount_est":"80","role":{"title":"Backend Engineer","jd_quotes":["deploy into customer '
    'environments"]},"hooks":[{"type":"jd","quote":"deploy into customer environments",'
    '"source_url":"https://acme.invalid","context":"customer-embedded"}],'
    '"disambiguation":"the infra Acme","confidence":"high"}'
)

HOOK_TEXT = "You ship into customer environments, the forward-deployed work I did at Globex."
CLOSER_TEXT = "Open to a quick call about the Backend Engineer role?"

NO_SEND_REPLY = '{"no_send": true, "reason": "nothing specific connects to my work"}'
HONESTY_PASS = '{"verdict":"pass","violations":[]}'
HONESTY_FAIL = (
    '{"verdict":"fail","violations":[{"claim":"led the program","why":"doc says led a team"}]}'
)


def fill_reply(hook: str, closer: str) -> str:
    return json.dumps({"fills": {"hook": hook, "closer": closer}})


def humanize_reply(hook: str, closer: str) -> str:
    return json.dumps({"hook": hook, "closer": closer})


# (a) Happy path: research → fill → humanize → honesty pass → awaiting_review.
def test_run_happy_path(db):
    fake = FakeAnthropic(
        [
            RESEARCH_JSON,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_PASS,
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        eng.run(did, False)
    assert fake.errors == []
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_AWAITING_REVIEW, (
        f"status={d.status!r} fail={d.fail_reason!r}"
    )
    for want in [
        "Subject: [Name] | intro — Backend Engineer",
        "Hi [Name],",
        HOOK_TEXT,
        VERBATIM_LINE,
        CLOSER_TEXT,
    ]:
        assert want in d.draft, f"assembled email missing {want!r}:\n{d.draft}"
    assert d.critique == ""  # no judge → no critique
    assert fake.calls == 4  # research, fill, humanize, honesty


# (b) No-send: the fill declines → no_hook, no draft, no fail.
def test_run_no_send_means_no_email(db):
    fake = FakeAnthropic([RESEARCH_JSON, NO_SEND_REPLY])
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        eng.run(did, False)
    assert fake.errors == []
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_NO_HOOK
    assert d.draft == ""
    assert d.fail_reason == ""


# (c) Honesty fail → fill retry (with violations fed back) → pass.
def test_run_honesty_retry_passes(db):
    fake = FakeAnthropic(
        [
            RESEARCH_JSON,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_FAIL,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_PASS,
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        eng.run(did, False)
    assert fake.errors == []
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_AWAITING_REVIEW
    assert fake.calls == 7
    # The retry fill saw the honesty violations, labeled.
    retry_fill = fake.reqs[4]
    assert "A reviewer flagged these claims" in retry_fill
    assert "led the program" in retry_fill


# (d) Honesty fail twice → failed, violations saved.
def test_run_honesty_twice_fails(db):
    fake = FakeAnthropic(
        [
            RESEARCH_JSON,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_FAIL,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_FAIL,
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        eng.run(did, False)
    assert fake.errors == []
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_FAILED
    assert d.fail_reason == "honesty check failed twice"
    assert "led the program" in d.violations


# Each pipeline stage carries its DB-saved prompt override.
def test_run_uses_saved_stage_prompts(db):
    fill_marker = "FILL-MARKER-XYZZY: write it warm."
    humanize_marker = "HUMANIZE-MARKER-XYZZY: keep the voice."
    fake = FakeAnthropic(
        [
            RESEARCH_JSON,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_PASS,
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        prompt_overrides.put_prompt_override(db, "fill", fill_marker)
        prompt_overrides.put_prompt_override(db, "humanizer", humanize_marker)
        eng.run(did, False)
    assert fake.errors == []
    assert fill_marker in fake.reqs[1], f"fill request missing the saved override:\n{fake.reqs[1]}"
    assert humanize_marker in fake.reqs[2], (
        f"humanize request missing the saved override:\n{fake.reqs[2]}"
    )


# A fully-static template (no holes) short-circuits fill/honesty: one research call.
def test_run_no_holes_short_circuit(db):
    fake = FakeAnthropic([RESEARCH_JSON])
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        from scout.store import outreach_template

        outreach_template.put_outreach_template(
            db, "Hi [Name],\n\n" + VERBATIM_LINE + "\n\nThanks,\nAlex"
        )
        seed_experience(db)
        did = seed_posting_draft(db)
        eng.run(did, False)
    assert fake.errors == []
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_AWAITING_REVIEW, (
        f"status={d.status!r} fail={d.fail_reason!r}"
    )
    assert VERBATIM_LINE in d.draft
    assert d.critique == ""
    assert d.lint == "[]"
    assert fake.calls == 1


# (e) No experience cached → drafting fails loud BEFORE any LLM call.
def test_run_fails_without_experience(db):
    fake = FakeAnthropic([])  # no call should be made
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        did = seed_posting_draft(db)  # no seed_experience
        with pytest.raises(Exception):
            eng.run(did, False)
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_FAILED
    assert fake.calls == 0, "the gate must fail before any LLM call"


# (g) A stored description is used for the JD (no network fetch).
def test_run_uses_stored_description(db):
    fake = FakeAnthropic(
        [
            RESEARCH_JSON,
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_PASS,
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        d0 = outreach_drafts.get_outreach_draft(db, did)
        p = postings.get_posting(db, d0.posting_id)
        postings.upsert_captured_posting(
            db,
            CapturedPosting(
                company_id=p.company_id,
                url=p.url,
                title=p.title,
                description="Backend Engineer. Deploy into customer environments. Go, Postgres.",
                fetch_status="ok",
            ),
        )
        logs: list[str] = []
        eng.log = logs.append
        eng.run(did, False)
    assert fake.errors == []
    got = outreach_drafts.get_outreach_draft(db, did)
    assert got.status == outreach_drafts.DRAFT_AWAITING_REVIEW, (
        f"status={got.status!r} fail={got.fail_reason!r}"
    )
    assert any("stored at capture" in line for line in logs), (
        "JD did not come from the stored description; logs:\n" + "\n".join(logs)
    )


# (h) skip_research on a regenerate drops the carried-forward research and
# re-drafts with no web research (the "turn research off" control). Without the
# skip flag a regenerate reuses that research; with it, the prior research is
# discarded and no research call is made.
def test_skip_research_drops_carried_research(db):
    fake = FakeAnthropic(
        [
            fill_reply(HOOK_TEXT, CLOSER_TEXT),
            humanize_reply(HOOK_TEXT, CLOSER_TEXT),
            HONESTY_PASS,
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        seed_experience(db)
        did = seed_posting_draft(db)
        # Simulate a regenerate: the draft carries the prior run's research.
        outreach_drafts.set_outreach_draft_result(
            db, did, outreach_drafts.DRAFT_RESEARCHING, RESEARCH_JSON, "", "", "", "", "", ""
        )
        eng.run(did, True)  # skip_research=True
    assert fake.errors == []
    d = outreach_drafts.get_outreach_draft(db, did)
    assert d.status == outreach_drafts.DRAFT_AWAITING_REVIEW, f"fail={d.fail_reason!r}"
    assert "researcher skipped" in d.research  # carried research dropped
    assert "infra" not in d.research  # the RESEARCH_JSON is gone
    assert fake.calls == 3  # no research call: fill, humanize, honesty
