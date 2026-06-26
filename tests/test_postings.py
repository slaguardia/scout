"""Port of internal/store/postings_test.go."""
import pytest

from scout.store import (
    contacts,
    errors,
    marks,
    outreach_drafts,
    posting_answers,
    postings,
    verdicts,
)
from scout.store.companies import Company, upsert_company
from scout.store.contacts import ContactInput, OutreachInput
from scout.store.outreach_drafts import (
    DRAFT_AWAITING_REVIEW,
    DRAFT_FAILED,
    DRAFT_NEEDS_WORK,
    DRAFT_NO_HOOK,
    DRAFT_RESEARCHING,
    DRAFT_SUPERSEDED,
)
from scout.store.posting_answers import DetectedQuestion
from scout.store.postings import CapturedPosting, PostingEdit, PostingTracking
from scout.store.verdicts import Verdict


def _acme(db) -> str:
    return upsert_company(db, Company(source="test", name="Acme", domain="acme.com", raw_json="{}"))


def test_postings_round_trip(db):
    cid = _acme(db)

    ps = postings.list_postings(db, cid)
    assert ps == []

    p = postings.add_posting(db, cid, "  https://acme.com/jobs/se  ", "  Solutions Engineer  ")
    assert p.id != ""
    assert p.url == "https://acme.com/jobs/se"
    assert p.title == "Solutions Engineer"
    assert p.company_id == cid and p.created_at != ""

    p2 = postings.add_posting(db, cid, "https://acme.com/jobs/pm", "")
    ps = postings.list_postings(db, cid)
    assert len(ps) == 2
    assert ps[0].id == p2.id  # newest first
    assert ps[1].title == "Solutions Engineer"


def test_add_posting_idempotent_by_url(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "")

    # Same URL again returns the existing row + backfills the blank title.
    p2 = postings.add_posting(db, cid, "https://acme.com/jobs/se", "Solutions Engineer")
    assert p2.id == p.id
    assert p2.title == "Solutions Engineer"

    # A non-blank title is never overwritten.
    p3 = postings.add_posting(db, cid, "https://acme.com/jobs/se", "Sales Engineer")
    assert p3.title == "Solutions Engineer"
    assert len(postings.list_postings(db, cid)) == 1


def test_next_up_clears_when_outreach_goes_out(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")

    p = postings.set_posting_next_up(db, p.id, True)
    assert p.next_up

    # A tracking write that does NOT bump outreach keeps the mark.
    p = postings.update_posting_tracking(db, p.id, PostingTracking(outreach_status="initial contact"))
    assert p.next_up

    contact = contacts.create_contact(db, cid, ContactInput(email="jane@acme.com"))
    contacts.log_outreach(db, p.id, contact.id, OutreachInput())
    p = postings._read_posting(db, p.id)
    assert not p.next_up

    p = postings.set_posting_next_up(db, p.id, True)
    p = postings.set_posting_next_up(db, p.id, False)
    assert not p.next_up

    with pytest.raises(errors.NotFound):
        postings.set_posting_next_up(db, "nope", True)


def test_add_posting_validation(db):
    cid = _acme(db)

    with pytest.raises(ValueError, match="url required"):
        postings.add_posting(db, cid, "   ", "title")

    for bad in ("javascript:alert(1)", "data:text/html,x", "ftp://acme.com/x"):
        with pytest.raises(ValueError) as exc:
            postings.add_posting(db, cid, bad, "")
        assert str(exc.value).startswith("url ")

    # http(s) urls still pass scheme validation.
    postings.add_posting(db, cid, "http://acme.com/jobs", "")

    with pytest.raises(errors.NotFound):
        postings.add_posting(db, "no-such-company-uuid", "https://x.com/job", "")


def test_upsert_captured_posting(db):
    cid = _acme(db)

    p, updated = postings.upsert_captured_posting(db, CapturedPosting(
        company_id=cid, url="https://acme.com/jobs/se", pasted_url="https://acme.co/r/123",
        title="Solutions Engineer", location="SF / remote", description="Pre-sales eng.", fetch_status="ok",
    ))
    assert not updated
    assert (p.source == "capture" and p.title == "Solutions Engineer" and p.location == "SF / remote"
            and p.description == "Pre-sales eng." and p.fetch_status == "ok" and p.captured_at != "")

    p2, updated = postings.upsert_captured_posting(db, CapturedPosting(
        company_id=cid, url="https://acme.com/jobs/se", title="Senior Solutions Engineer", fetch_status="ok",
    ))
    assert updated and p2.id == p.id and p2.title == "Senior Solutions Engineer"

    p3, updated = postings.upsert_captured_posting(db, CapturedPosting(
        company_id=cid, url="https://acme.com/jobs/se-final", pasted_url="https://acme.com/jobs/se",
        title="SE", fetch_status="ok",
    ))
    assert updated and p3.id == p.id and p3.url == "https://acme.com/jobs/se-final"
    assert len(postings.list_postings(db, cid)) == 1

    hand = postings.add_posting(db, cid, "https://acme.com/jobs/pm", "")
    h2, updated = postings.upsert_captured_posting(db, CapturedPosting(
        company_id=cid, url="https://acme.com/jobs/pm", title="PM", fetch_status="ok",
    ))
    assert updated and h2.id == hand.id and h2.source == "capture" and h2.title == "PM"

    with pytest.raises(ValueError) as exc:
        postings.upsert_captured_posting(db, CapturedPosting(company_id=cid, url="javascript:x"))
    assert str(exc.value).startswith("url ")
    with pytest.raises(errors.NotFound):
        postings.upsert_captured_posting(db, CapturedPosting(company_id="nope", url="https://x.com/j"))


def test_list_job_rows(db):
    assert postings.list_job_rows(db) == []

    cid = _acme(db)
    verdicts.upsert_verdict(db, Verdict(company_id=cid, verdict="yes", reason="fit", taste_version="v1", model="m"))
    marks.set_flagged(db, cid, True)
    postings.upsert_captured_posting(db, CapturedPosting(
        company_id=cid, url="https://acme.com/jobs/se", title="SE", location="SF", fetch_status="ok",
    ))

    rows = postings.list_job_rows(db)
    assert len(rows) == 1
    r = rows[0]
    assert (r.company == "Acme" and r.company_id == cid and r.title == "SE" and r.location == "SF"
            and r.verdict == "yes" and r.source == "capture" and r.flagged and not r.reviewed)
    assert r.outreach_draft_status == ""

    d1 = outreach_drafts.create_outreach_draft(db, r.posting_id)
    outreach_drafts.set_outreach_draft_result(db, d1.id, DRAFT_NO_HOOK, "", "", "tpl", "[]", "", "", "")
    rows = postings.list_job_rows(db)
    assert len(rows) == 1
    assert rows[0].outreach_draft_status == DRAFT_NO_HOOK


def test_update_posting_tracking(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")

    assert (p.application_status == "" and p.outreach_count == 0
            and p.last_outreach_at == "" and p.outreach_status == "")

    got = postings.update_posting_tracking(db, p.id, PostingTracking(
        application_status="interview", outreach_status="initial contact"))
    assert (got.application_status == "interview" and got.outreach_status == "initial contact"
            and got.outreach_count == 0 and got.last_outreach_at == "")

    got = postings.update_posting_tracking(db, p.id, PostingTracking())
    assert got.application_status == "" and got.outreach_status == "" and got.outreach_count == 0

    postings.update_posting_tracking(db, p.id, PostingTracking(application_status="interview", outreach_status="replied"))
    rows = postings.list_job_rows(db)
    assert len(rows) == 1
    r = rows[0]
    assert (r.application_status == "interview" and r.outreach_status == "replied"
            and r.outreach_count == 0 and r.last_outreach_at == "")

    with pytest.raises(ValueError) as exc:
        postings.update_posting_tracking(db, p.id, PostingTracking(outreach_status="x" * 100))
    assert str(exc.value).startswith("outreach_status ")
    with pytest.raises(errors.NotFound):
        postings.update_posting_tracking(db, "no-such-posting", PostingTracking())


def test_update_posting_details(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "Wrong Title")

    got = postings.update_posting_details(db, p.id, PostingEdit(
        title="  Staff Engineer  ", location="Remote", employment_type="Full-time",
        workplace_type="Remote", department="Eng", comp_range="$200k-$250k", description="long description",
    ))
    assert (got.title == "Staff Engineer" and got.location == "Remote" and got.employment_type == "Full-time"
            and got.workplace_type == "Remote" and got.department == "Eng"
            and got.comp_range == "$200k-$250k" and got.description == "long description")
    assert got.url == "https://acme.com/jobs/se"

    got = postings.update_posting_details(db, p.id, PostingEdit(title="Just a Title"))
    assert (got.title == "Just a Title" and got.location == "" and got.department == ""
            and got.comp_range == "" and got.description == "")

    with pytest.raises(errors.NotFound):
        postings.update_posting_details(db, "no-such-posting", PostingEdit())


def test_update_posting_url(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "Staff Engineer")

    got = postings.update_posting_url(db, p.id, "  https://acme.com/jobs/staff-se  ")
    assert got.url == "https://acme.com/jobs/staff-se"
    assert got.title == "Staff Engineer"

    with pytest.raises(ValueError):
        postings.update_posting_url(db, p.id, "  ")
    with pytest.raises(ValueError):
        postings.update_posting_url(db, p.id, "ftp://acme.com/jobs")

    with pytest.raises(errors.NotFound):
        postings.update_posting_url(db, "no-such-posting", "https://x.com/j")


def test_reap_stuck_outreach_drafts(db):
    cid = upsert_company(db, Company(source="test", name="Acme", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.test/j", "X")
    d = outreach_drafts.create_outreach_draft(db, p.id)

    assert outreach_drafts.reap_stuck_outreach_drafts(db, 30) == 0
    assert outreach_drafts.reap_stuck_outreach_drafts(db, 0) == 1
    got = outreach_drafts.get_outreach_draft(db, d.id)
    assert got.status == DRAFT_FAILED and got.fail_reason != ""
    # The posting is unblocked.
    outreach_drafts.create_outreach_draft(db, p.id)


def test_posting_notes(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")

    got = postings.update_posting_tracking(db, p.id, PostingTracking(notes="  referred by Dana; mentions on-call  "))
    assert got.notes == "referred by Dana; mentions on-call"

    postings.update_posting_details(db, p.id, PostingEdit(title="Senior SE", description="new JD"))
    again = postings.get_posting(db, p.id)
    assert again is not None and again.notes == "referred by Dana; mentions on-call"

    rows = postings.list_job_rows(db)
    assert len(rows) == 1 and rows[0].notes == "referred by Dana; mentions on-call"

    got = postings.update_posting_tracking(db, p.id, PostingTracking())
    assert got.notes == ""


def test_delete_posting_removes_everything(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")
    outreach_drafts.create_outreach_draft(db, p.id)
    posting_answers.upsert_detected_questions(db, p.id, [DetectedQuestion(prompt="Why us?")], "ok")

    postings.delete_posting(db, p.id)

    assert postings.get_posting(db, p.id) is None
    for table in ("outreach_drafts", "posting_answers"):
        n = db.execute(f"SELECT COUNT(1) FROM {table} WHERE posting_id = ?", (p.id,)).fetchone()[0]
        assert n == 0
    from scout.store import companies
    assert companies.company_exists(db, cid)

    with pytest.raises(errors.NotFound):
        postings.delete_posting(db, "does-not-exist")


def test_regenerate_outreach_draft(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")

    d1 = outreach_drafts.create_outreach_draft(db, p.id)
    research = '{"company":"Acme","hooks":[]}'
    outreach_drafts.set_outreach_draft_result(db, d1.id, DRAFT_AWAITING_REVIEW, research, "", "first body", "[]", "", "", "")

    with pytest.raises(ValueError):
        outreach_drafts.create_outreach_draft(db, p.id)

    d2 = outreach_drafts.regenerate_outreach_draft(db, p.id)
    assert d2.id != d1.id and d2.status == DRAFT_RESEARCHING
    assert d2.research == research

    drafts = outreach_drafts.list_outreach_drafts(db, p.id)
    assert len(drafts) == 2
    assert drafts[0].id == d2.id and drafts[0].status == DRAFT_RESEARCHING
    assert drafts[1].id == d1.id and drafts[1].status == DRAFT_SUPERSEDED
    assert drafts[1].draft == "first body"

    with pytest.raises(ValueError):
        outreach_drafts.regenerate_outreach_draft(db, p.id)


def test_needs_work_is_active(db):
    cid = _acme(db)
    p = postings.add_posting(db, cid, "https://acme.com/jobs/se", "SE")

    d1 = outreach_drafts.create_outreach_draft(db, p.id)
    critique = '{"depth":"medium","proof_tier":"adjacent","weaknesses":[],"experience_gaps":"","attempts":2}'
    outreach_drafts.set_outreach_draft_result(db, d1.id, DRAFT_NEEDS_WORK, "{}", "", "flagged body", "[]", "", critique, "")
    got = outreach_drafts.get_outreach_draft(db, d1.id)
    assert got.critique == critique

    with pytest.raises(ValueError):
        outreach_drafts.create_outreach_draft(db, p.id)

    d2 = outreach_drafts.regenerate_outreach_draft(db, p.id)
    assert d2.id != d1.id and d2.status == DRAFT_RESEARCHING
    old = outreach_drafts.get_outreach_draft(db, d1.id)
    assert old.status == DRAFT_SUPERSEDED
