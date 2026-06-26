"""Port of internal/store/companies_test.go."""
import pytest

from scout.store import companies, detail, enrichment, overrides, postings, trace, verdicts
from scout.store import errors, outreach_drafts
from scout.store.companies import Company, EditableCompany, company_id, upsert_company
from scout.store.enrichment import Enrichment
from scout.store.verdicts import Verdict
from scout.store.trace import VerdictTrace
from scout.store.overrides import VerdictOverride

from helpers import mk_company


def test_company_id_pinned():
    """The deterministic UUIDv5 scheme matches Go's uuid.NewSHA1 byte-for-byte."""
    assert company_id("acme.com", "Acme") == "79517ca0-4cf4-51a9-a41a-71141a11d5ad"
    assert company_id("", "Acme") == "ff0d9751-c6f0-5f03-ba1a-56ba9330cae1"


def test_upsert_company_dedup_cross_source(db):
    id1 = upsert_company(db, mk_company("crunchbase", "Acme", "acme.com"))
    assert id1 == company_id("acme.com", "Acme")

    # Same domain, different source and name → same row, overwritten.
    id2 = upsert_company(db, mk_company("manual", "Acme Inc", "acme.com"))
    assert id2 == id1

    assert companies.count_companies(db) == 1

    d = detail.get_company_detail(db, id1)
    assert d is not None
    assert d.source == "manual" and d.name == "Acme Inc"


def test_upsert_company_domainless_name_fallback(db):
    a = upsert_company(db, mk_company("manual", "Globex", ""))
    b = upsert_company(db, mk_company("manual", "globex", ""))  # case-only difference
    assert a == b
    c = upsert_company(db, mk_company("manual", "Initech", ""))
    assert c != a
    assert companies.count_companies(db) == 2


def test_merge_company_collapses_name_key_into_domain_key(db):
    old_id = upsert_company(db, mk_company("manual", "Acme", ""))
    assert old_id == company_id("", "Acme")
    enrichment.upsert_enrichment(db, Enrichment(company_id=old_id, fetch_status="ok"))
    postings.add_posting(db, old_id, "https://acme.com/jobs", "SE")

    new_id = upsert_company(db, mk_company("crunchbase", "Acme", "acme.com"))
    assert new_id != old_id

    companies.merge_company(db, old_id, new_id)

    assert companies.count_companies(db) == 1
    assert not companies.company_exists(db, old_id)

    d = detail.get_company_detail(db, new_id)
    assert d is not None
    assert d.has_enrichment
    assert len(d.postings) == 1 and d.postings[0].url == "https://acme.com/jobs"


def test_delete_company_removes_everything(db):
    cid = upsert_company(db, mk_company("crunchbase", "Acme", "acme.com"))

    enrichment.upsert_enrichment(db, Enrichment(company_id=cid, fetch_status="ok"))
    verdicts.upsert_verdict(db, Verdict(company_id=cid, verdict="yes", reason="fits", model="manual"))
    trace.insert_verdict_trace(db, VerdictTrace(company_id=cid, model="haiku", verdict="yes"))
    overrides.insert_verdict_override(db, VerdictOverride(company_id=cid, to_verdict="yes"))
    p = postings.add_posting(db, cid, "https://acme.com/jobs", "SE")
    outreach_drafts.create_outreach_draft(db, p.id)

    companies.delete_company(db, cid)

    assert companies.count_companies(db) == 0
    assert not companies.company_exists(db, cid)
    for table in companies.COMPANY_CHILD_TABLES:
        n = db.execute(f"SELECT COUNT(1) FROM {table}").fetchone()[0]
        assert n == 0, f"{table} still has rows"
    drafts = db.execute("SELECT COUNT(1) FROM outreach_drafts").fetchone()[0]
    assert drafts == 0

    with pytest.raises(errors.NotFound):
        companies.delete_company(db, "does-not-exist")


def test_company_delete_cascades(db):
    cid = upsert_company(db, mk_company("crunchbase", "Acme", "acme.com"))
    enrichment.upsert_enrichment(db, Enrichment(company_id=cid, fetch_status="ok"))
    db.execute("DELETE FROM companies WHERE id = ?", (cid,))
    rows = db.execute("SELECT COUNT(1) FROM enrichment WHERE company_id = ?", (cid,)).fetchone()[0]
    assert rows == 0


def test_update_company_notes(db):
    cid = upsert_company(db, mk_company("crunchbase", "Acme", "acme.com"))

    companies.update_company_notes(db, cid, "talked to a founder; warm intro pending")
    d = detail.get_company_detail(db, cid)
    assert d is not None and d.notes == "talked to a founder; warm intro pending"

    # A re-ingest must leave the notes untouched.
    upsert_company(db, mk_company("manual", "Acme Inc", "acme.com"))
    d = detail.get_company_detail(db, cid)
    assert d.notes == "talked to a founder; warm intro pending"

    companies.update_company_notes(db, cid, "")
    d = detail.get_company_detail(db, cid)
    assert d.notes == ""

    with pytest.raises(errors.NotFound):
        companies.update_company_notes(db, "nope", "x")


def test_update_company_editable(db):
    cid = upsert_company(db, mk_company("manual", "acme.com", "acme.com"))

    companies.update_company_editable(db, cid, EditableCompany(
        name="Acme Robotics", headcount=50, funding_stage="Series A",
        location="Austin, TX", vertical="Robotics",
    ))
    d = detail.get_company_detail(db, cid)
    assert d is not None
    assert d.name == "Acme Robotics" and d.headcount == 50 and d.funding_stage == "Series A"

    key = db.execute("SELECT name_key FROM companies WHERE id = ?", (cid,)).fetchone()[0]
    assert key == "acme robotics"

    # Blanks clear (full replace).
    companies.update_company_editable(db, cid, EditableCompany(name="Acme Robotics"))
    d = detail.get_company_detail(db, cid)
    assert d.headcount == 0 and d.funding_stage == "" and d.location == "" and d.vertical == ""

    with pytest.raises(errors.NotFound):
        companies.update_company_editable(db, "nope", EditableCompany(name="x"))


def test_set_company_domain(db):
    old_id = upsert_company(db, mk_company("manual", "Acme", ""))
    assert old_id == company_id("", "Acme")
    postings.add_posting(db, old_id, "https://acme.com/jobs", "SE")

    new_id = companies.set_company_domain(db, old_id, "acme.com")
    assert new_id == company_id("acme.com", "Acme")
    assert not companies.company_exists(db, old_id)
    assert companies.count_companies(db) == 1
    d = detail.get_company_detail(db, new_id)
    assert d is not None and d.domain == "acme.com"
    assert len(d.postings) == 1 and d.postings[0].url == "https://acme.com/jobs"

    with pytest.raises(errors.NotFound):
        companies.set_company_domain(db, "nope", "x.com")


def test_set_company_domain_folds_twin(db):
    domain_id = upsert_company(db, mk_company("crunchbase", "Acme", "acme.com"))
    name_id = upsert_company(db, mk_company("manual", "Acme", ""))
    assert name_id != domain_id
    postings.add_posting(db, name_id, "https://acme.com/careers", "PM")

    got = companies.set_company_domain(db, name_id, "acme.com")
    assert got == domain_id
    assert not companies.company_exists(db, name_id)
    assert companies.count_companies(db) == 1
    d = detail.get_company_detail(db, domain_id)
    assert d is not None and len(d.postings) == 1

    # A DIFFERENT company can't steal an owned domain.
    other_id = upsert_company(db, mk_company("manual", "Globex", ""))
    with pytest.raises(errors.DomainTaken):
        companies.set_company_domain(db, other_id, "acme.com")


def test_fill_company_name_placeholder(db):
    cid = upsert_company(db, mk_company("manual", "acme.com", "acme.com"))

    assert companies.fill_company_name_placeholder(db, cid, "Acme Robotics") is True
    d = detail.get_company_detail(db, cid)
    assert d.name == "Acme Robotics"

    # A real name is sticky.
    assert companies.fill_company_name_placeholder(db, cid, "Acme Inc") is False
    d = detail.get_company_detail(db, cid)
    assert d.name == "Acme Robotics"

    # Empty extracted name is a no-op.
    assert companies.fill_company_name_placeholder(db, cid, "  ") is False


def test_vertical_tags_splits_and_dedupes(db):
    def add(name, domain, vertical):
        c = mk_company("crunchbase", name, domain)
        if vertical != "":
            c.vertical = vertical
        upsert_company(db, c)

    add("Acme", "acme.com", "AI, Cloud Computing")
    add("Bolt", "bolt.com", "SaaS, ai")  # "ai" dupes "AI"
    add("Cog", "cog.com", "  Robotics , AI ")
    add("Dud", "dud.com", "")  # NULL vertical — skipped

    got = companies.vertical_tags(db)
    assert got == ["AI", "Cloud Computing", "Robotics", "SaaS"]
