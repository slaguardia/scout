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

    # The editable middle is composed between the protected applied/rejected
    # anchors; the anchors typed inline are stripped and re-added.
    statuses.set_application_stages(db, ["applied", "phone screen", "onsite", "offer"])
    got = statuses.application_stages(db)
    assert got == ["applied", "phone screen", "onsite", "offer", "rejected"]


def test_application_stage_builtins_protected(db):
    # "applied" and "rejected" are always present as front/terminal anchors even
    # when the user's list omits them; "archived" is reserved and never a stage.
    statuses.set_application_stages(db, ["screening", "final"])
    assert statuses.application_stages(db) == ["applied", "screening", "final", "rejected"]

    # Reserved built-ins typed into the middle are dropped (case-insensitively),
    # not duplicated.
    statuses.set_application_stages(db, ["Applied", "screening", "ARCHIVED", "rejected"])
    assert statuses.application_stages(db) == ["applied", "screening", "rejected"]

    # An empty middle is allowed — the pipeline is just applied → rejected.
    statuses.set_application_stages(db, [])
    assert statuses.application_stages(db) == ["applied", "rejected"]


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
