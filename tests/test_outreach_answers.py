"""The logistics bundle wiring into both the answer drafter and the honesty
checker's ground truth."""

from __future__ import annotations

from scout.store import outreach_sources, posting_answers
from scout.store.outreach_sources import OutreachSource
from scout.store.posting_answers import PostingAnswer
from scout.store.postings import Posting
from tests.httpstub import http_server
from tests.outreach_fakes import make_engine


# A discovered logistics/profile bundle must reach BOTH the answer drafter's prompt
# and the honesty checker's ground truth — the wiring that stops the engine
# confabulating a location.
def test_answer_uses_logistics_bundle(db):
    fake_replies = [
        "I'm currently based in Brooklyn, NY.",  # answer_call draft
        '{"verdict":"pass","violations":[]}',  # honesty_check_text
    ]
    from tests.outreach_fakes import FakeAnthropic

    fake = FakeAnthropic(fake_replies)
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        for s in [
            OutreachSource(
                need="experience",
                page_id="e1",
                title="Exp",
                content="Five years at Globex.",
                version="v1",
            ),
            OutreachSource(
                need="logistics",
                page_id="l1",
                title="Profile",
                content="Based in Brooklyn, NY. US citizen.",
                version="v1",
            ),
        ]:
            outreach_sources.upsert_outreach_source(db, s)

        posting = Posting(title="Engineer", description="Build things.")
        ac = eng._answer_context(posting, eng._knowledge("experience"))
        assert "Brooklyn" in ac.logistics, f"logistics bundle not loaded: {ac.logistics!r}"

        q = PostingAnswer(prompt="Where are you currently located?")
        _, status, reason = eng._draft_answer(ac, q)
        assert status == posting_answers.ANSWER_READY, f"status={status} reason={reason}"

    assert fake.errors == []
    assert len(fake.reqs) == 2
    assert "Brooklyn" in fake.reqs[0], f"drafter prompt missing the logistics card:\n{fake.reqs[0]}"
    assert "Brooklyn" in fake.reqs[1] and "Applicant profile" in fake.reqs[1], (
        f"honesty ground truth missing the logistics document:\n{fake.reqs[1]}"
    )


# With no logistics bundle discovered, the honesty checker receives only the
# experience document — no empty "Applicant profile" section is appended.
def test_answer_honesty_omits_empty_logistics(db):
    from tests.outreach_fakes import FakeAnthropic

    fake = FakeAnthropic(
        [
            "[current location]",  # drafter leaves a placeholder
            '{"verdict":"pass","violations":[]}',  # honesty pass on a placeholder
        ]
    )
    with http_server(fake.handle) as base:
        eng = make_engine(db, base)
        outreach_sources.upsert_outreach_source(
            db,
            OutreachSource(
                need="experience",
                page_id="e1",
                title="Exp",
                content="Five years at Globex.",
                version="v1",
            ),
        )

        posting = Posting(title="Engineer", description="Build things.")
        ac = eng._answer_context(posting, eng._knowledge("experience"))
        assert ac.logistics == "", f"expected empty logistics, got {ac.logistics!r}"

        q = PostingAnswer(prompt="Where are you currently located?")
        _, status, reason = eng._draft_answer(ac, q)
        assert status == posting_answers.ANSWER_READY, f"status={status} reason={reason}"

    assert fake.errors == []
    assert "Applicant profile" not in fake.reqs[1], (
        f"honesty doc should not append an empty profile section:\n{fake.reqs[1]}"
    )
