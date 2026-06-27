"""Tests for scout.store.trace."""

from dataclasses import replace

from scout.store import trace
from scout.store.companies import Company, upsert_company
from scout.store.trace import VerdictTrace


def test_verdict_trace_round_trip(db):
    cid = upsert_company(db, Company(source="test", name="Acme Corp", raw_json="{}"))

    v1 = VerdictTrace(
        company_id=cid,
        run_id="run-1",
        model="claude-haiku-4-5",
        taste_version="v1",
        criteria_source="brain:profile@http://127.0.0.1:8100 + playbook.md",
        verdict="maybe",
        reason="adjacent ML infra",
    )
    trace.insert_verdict_trace(db, v1)
    # A later re-score appends a second row rather than overwriting.
    v2 = replace(
        v1, run_id="run-2", taste_version="v2", verdict="no", reason="fintech-leaning (excluded)"
    )
    trace.insert_verdict_trace(db, v2)

    events = trace.company_trace(db, cid)
    assert len(events) == 2
    assert events[0].taste_version == "v1" and events[1].taste_version == "v2"

    e0 = events[0]
    assert e0.run_id == "run-1" and e0.model == "claude-haiku-4-5" and e0.verdict == "maybe"
    assert e0.criteria_source == v1.criteria_source and e0.reason == "adjacent ML infra"

    other = upsert_company(db, Company(source="test", name="Nobody", raw_json="{}"))
    empty = trace.company_trace(db, other)
    assert empty == []
