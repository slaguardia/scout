"""Tests for scout.store.statuses."""

import pytest
from helpers import seed_posting

from scout.store import postings, settings, statuses
from scout.store.postings import PostingTracking
from scout.store.statuses import (
    DEFAULT_APPLICATION_STAGES,
    DEFAULT_OUTREACH_STATUSES,
    OUTREACH_STATUSES_SETTING,
)


def test_status_list_defaults_and_round_trip(db):
    os = statuses.outreach_statuses(db)
    assert len(os) == len(DEFAULT_OUTREACH_STATUSES) and os[0] == "initial contact"
    st = statuses.application_stages(db)
    assert len(st) == len(DEFAULT_APPLICATION_STAGES) and st[0] == "applied"

    statuses.set_outreach_statuses(db, ["reached out", "ghosted", "talking"])
    got = statuses.outreach_statuses(db)
    assert len(got) == 3 and got[1] == "ghosted"

    statuses.set_application_stages(db, ["applied", "phone screen", "onsite", "offer"])
    got = statuses.application_stages(db)
    assert len(got) == 4 and got[1] == "phone screen"


def test_status_list_sanitize(db):
    statuses.set_outreach_statuses(db, ["  Replied ", "", "replied", "REPLIED", "no response"])
    got = statuses.outreach_statuses(db)
    assert got == ["Replied", "no response"]

    with pytest.raises(ValueError) as exc:
        statuses.set_outreach_statuses(db, ["", "   "])
    assert str(exc.value).startswith("statuses ")

    settings.set_setting(db, OUTREACH_STATUSES_SETTING, "not json")
    assert len(statuses.outreach_statuses(db)) == len(DEFAULT_OUTREACH_STATUSES)


def test_outreach_status_lenient_and_independent(db):
    pid = seed_posting(db)

    got = postings.update_posting_tracking(
        db, pid, PostingTracking(outreach_status="  followed up  ")
    )
    assert got.outreach_status == "followed up"

    got = postings.update_posting_tracking(
        db, pid, PostingTracking(outreach_status="followed up", application_status="interview")
    )
    assert got.outreach_status == "followed up" and got.application_status == "interview"
