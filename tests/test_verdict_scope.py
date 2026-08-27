"""The verdict run's scope rules: stale-only re-scoring, and the fact that a bulk
re-score keeps hand-set verdicts unless explicitly told not to.

A bulk run skips already-scored companies, so editing your criteria used to leave
every existing verdict silently out of date with no in-app way to refresh them.
`redo_stale` is the targeted answer (re-judge what the edit invalidated, pay for
nothing else); `include_manual` is the opt-in that lets a re-score overwrite a
verdict you set by hand.
"""

from __future__ import annotations

import json
import threading

from scout import anthropic, criteria, filter
from scout.store import companies, enrichment, verdicts
from scout.store.companies import Company
from scout.verdict import Scorer
from tests.httpstub import http_server


class _Stub:
    """Canned verdict response; counts calls so a test can assert that a skipped
    company genuinely cost nothing."""

    def __init__(self, verdict="yes", reason="fits"):
        self.payload = {
            "content": [
                {"type": "text", "text": json.dumps({"verdict": verdict, "reason": reason})}
            ],
            "usage": {"cache_creation_input_tokens": 1, "cache_read_input_tokens": 1},
        }
        self.lock = threading.Lock()
        self.calls = 0

    def handle(self, req):  # noqa: ARG002
        with self.lock:
            self.calls += 1
        return 200, {"Content-Type": "application/json"}, json.dumps(self.payload)


def _client(url):
    return anthropic.Client(api_key="k", endpoint=url)


CRITERIA_A = "Hard dealbreakers: avoid crypto."
CRITERIA_B = "Hard dealbreakers: avoid crypto and gambling."


def _seed(db, names):
    ids = []
    for name in names:
        cid = companies.upsert_company(
            db, Company(source="t", name=name, domain=f"{name.lower()}.com", raw_json="{}")
        )
        enrichment.upsert_enrichment(
            db,
            enrichment.Enrichment(
                company_id=cid,
                website_url=f"https://{name.lower()}.com",
                website_summary=f"{name} builds developer tools",
                fetch_status="ok",
            ),
        )
        ids.append(cid)
    return ids


def _scorer(db, client, text=CRITERIA_A, **kw):
    return Scorer(
        con=db,
        taste=criteria.from_text(text, "brain:brief@test"),
        filter=filter.Taste(),  # disabled → passes every company
        client=client,
        **kw,
    )


def test_stale_run_rescores_only_what_the_criteria_edit_invalidated(db):
    ids = _seed(db, ["Acme", "Beta"])
    with http_server(_Stub().handle) as url:
        assert _scorer(db, _client(url)).run().scored == 2

    # Beta is re-stamped as if it had already been scored under the NEW criteria,
    # so a stale run must leave it alone and re-score only Acme.
    block_b = criteria.from_text(CRITERIA_B, "brain:brief@test")
    v = verdicts.get_verdict(db, ids[1])
    assert v is not None
    v.taste_version = block_b.version
    verdicts.upsert_verdict(db, v)

    stub = _Stub(verdict="no", reason="rescored under new criteria")
    with http_server(stub.handle) as url:
        res = _scorer(db, _client(url), text=CRITERIA_B, redo_stale=True).run()

    assert res.scored == 1, "only the stale verdict should be re-scored"
    assert res.skipped == 1
    assert stub.calls == 1, "an up-to-date verdict must not cost an LLM call"
    assert verdicts.get_verdict(db, ids[0]).reason == "rescored under new criteria"
    assert verdicts.get_verdict(db, ids[1]).reason == "fits"


def test_bulk_rescore_keeps_a_hand_set_verdict(db):
    ids = _seed(db, ["Acme"])
    verdicts.upsert_verdict(
        db,
        verdicts.Verdict(
            company_id=ids[0],
            verdict="yes",
            reason="I met the founder",
            taste_version="old",
            model=verdicts.MANUAL_MODEL,
        ),
    )

    stub = _Stub(verdict="no", reason="model says no")
    for kw in ({"force": True}, {"redo_stale": True}):
        with http_server(stub.handle) as url:
            res = _scorer(db, _client(url), **kw).run()
        assert res.scored == 0, f"{kw} overwrote a manual verdict"
        assert res.skipped == 1
        v = verdicts.get_verdict(db, ids[0])
        assert v.reason == "I met the founder" and v.model == verdicts.MANUAL_MODEL
    assert stub.calls == 0, "a preserved manual verdict must not cost an LLM call"


def test_include_manual_opts_into_overwriting_it(db):
    ids = _seed(db, ["Acme"])
    verdicts.upsert_verdict(
        db,
        verdicts.Verdict(
            company_id=ids[0], verdict="yes", reason="I met the founder",
            taste_version="old", model=verdicts.MANUAL_MODEL,
        ),
    )
    with http_server(_Stub(verdict="no", reason="model says no").handle) as url:
        res = _scorer(db, _client(url), force=True, include_manual=True).run()

    assert res.scored == 1
    v = verdicts.get_verdict(db, ids[0])
    assert v.reason == "model says no" and v.model != verdicts.MANUAL_MODEL


def test_targeted_run_still_rescores_a_manual_verdict(db):
    """Pointing at one company is an explicit instruction — overrides included."""
    ids = _seed(db, ["Acme"])
    verdicts.upsert_verdict(
        db,
        verdicts.Verdict(
            company_id=ids[0], verdict="yes", reason="I met the founder",
            taste_version="old", model=verdicts.MANUAL_MODEL,
        ),
    )
    with http_server(_Stub(verdict="no", reason="model says no").handle) as url:
        res = _scorer(db, _client(url), company_ids=[ids[0]]).run()

    assert res.scored == 1
    assert verdicts.get_verdict(db, ids[0]).reason == "model says no"


def test_unstamped_verdict_counts_as_stale(db):
    """A verdict predating version stamping can't be claimed to match today's
    criteria, so a stale run picks it up."""
    ids = _seed(db, ["Acme"])
    verdicts.upsert_verdict(
        db,
        verdicts.Verdict(
            company_id=ids[0], verdict="yes", reason="old", taste_version="",
            model=anthropic.DEFAULT_MODEL,
        ),
    )
    with http_server(_Stub(verdict="no", reason="fresh").handle) as url:
        res = _scorer(db, _client(url), redo_stale=True).run()
    assert res.scored == 1
    assert verdicts.get_verdict(db, ids[0]).reason == "fresh"


def test_only_blanks_still_wins_over_stale(db):
    ids = _seed(db, ["Acme"])
    verdicts.upsert_verdict(
        db,
        verdicts.Verdict(
            company_id=ids[0], verdict="yes", reason="kept", taste_version="old",
            model=anthropic.DEFAULT_MODEL,
        ),
    )
    stub = _Stub()
    with http_server(stub.handle) as url:
        res = _scorer(db, _client(url), only_blanks=True, redo_stale=True, force=True).run()
    assert res.scored == 0 and stub.calls == 0
    assert verdicts.get_verdict(db, ids[0]).reason == "kept"


def test_scope_counts_splits_current_stale_and_manual(db):
    ids = _seed(db, ["Acme", "Beta", "Cee"])
    live = criteria.from_text(CRITERIA_A, "brain:brief@test").version
    verdicts.upsert_verdict(db, verdicts.Verdict(company_id=ids[0], verdict="yes", taste_version=live, model="m"))
    verdicts.upsert_verdict(db, verdicts.Verdict(company_id=ids[1], verdict="no", taste_version="old", model="m"))
    verdicts.upsert_verdict(
        db, verdicts.Verdict(company_id=ids[2], verdict="yes", taste_version=live, model=verdicts.MANUAL_MODEL)
    )

    c = verdicts.scope_counts(db, live)
    assert (c.scored, c.current, c.stale, c.manual) == (3, 1, 1, 1)
