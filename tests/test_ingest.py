"""Tests for scout.ingest — CSV parsing, dedup, and company-ensure."""

from __future__ import annotations

import uuid

import pytest

from scout import ingest
from scout.ingest import csv as ingest_csv
from scout.store import companies, detail, enrichment, triage
from scout.store.companies import company_id
from scout.store.enrichment import Enrichment

# --- helpers ---


def run_ingest(db, tmp_path, source, content):
    p = tmp_path / f"in-{uuid.uuid4().hex}.csv"
    p.write_text(content, encoding="utf-8", newline="")
    return ingest.CSV(source, db).run(str(p))


def get_detail_by_name(db, name):
    for r in triage.triage_rows(db):
        if r.name == name:
            d = detail.get_company_detail(db, r.company_id)
            assert d is not None, f"no detail for {name!r}"
            return d
    raise AssertionError(f"company {name!r} not ingested")


def seed_enrichment(db, cid):
    enrichment.upsert_enrichment(db, Enrichment(company_id=cid, fetch_status="ok"))


# --- CSV parsing ---

CRUNCHBASE_CSV = "\ufeff" + (
    "Organization Name,Industries,Headquarters Location,Number of Employees,Last Funding Type,Website,Organization Name URL\n"
    'Acme AI,Artificial Intelligence,"San Francisco, California, United States",11-50,Series A,https://acme.ai/,https://www.crunchbase.com/organization/acme-ai\n'
    'Globex,Fintech,"New York, New York, United States",1001-5000,Series C,www.globex.com,https://www.crunchbase.com/organization/globex\n'
    "NoSite,Developer Tools,Remote,,Seed,,https://www.crunchbase.com/organization/nosite\n"
)


def test_crunchbase_header_mapping(db, tmp_path):
    res = run_ingest(db, tmp_path, "crunchbase", CRUNCHBASE_CSV)
    assert res.read == 3 and res.upserted == 3, f"errors={res.errors}"

    acme = get_detail_by_name(db, "Acme AI")
    assert acme.vertical == "Artificial Intelligence"
    assert acme.location == "San Francisco, California, United States"
    assert acme.headcount == 50  # range 11-50 → upper bound
    assert acme.funding_stage == "Series A"
    assert acme.domain == "acme.ai"  # https:// + trailing slash stripped

    globex = get_detail_by_name(db, "Globex")
    assert globex.domain == "globex.com"  # www. stripped
    assert globex.headcount == 5000

    nosite = get_detail_by_name(db, "NoSite")
    assert nosite.domain == ""
    assert nosite.headcount == 0
    assert nosite.location == "Remote"


def test_ingest_reports_merged_count(db, tmp_path):
    csv = (
        "Organization Name,Website,Organization Name URL\n"
        "Acme,https://acme.ai/,https://www.crunchbase.com/organization/acme\n"
        "Globex,www.globex.com,https://www.crunchbase.com/organization/globex\n"
        "Acme (Relisted),http://acme.ai,https://www.crunchbase.com/organization/acme-2\n"
    )
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert (res.read, res.upserted, res.merged) == (3, 3, 1), f"errors={res.errors}"
    assert companies.count_companies(db) == 2

    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert res.merged == 3
    assert companies.count_companies(db) == 2


def test_ingest_auto_merges_domainless_into_domain(db, tmp_path):
    res = run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,\n")
    assert (res.read, res.upserted, res.merged) == (1, 1, 0)

    name_key = company_id("", "Acme")
    seed_enrichment(db, name_key)

    res = run_ingest(
        db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,https://acme.com/\n"
    )
    assert (res.read, res.upserted, res.merged) == (1, 1, 1)

    assert companies.count_companies(db) == 1
    domain_key = company_id("acme.com", "Acme")
    d = detail.get_company_detail(db, domain_key)
    assert d is not None and d.domain == "acme.com"
    assert d.has_enrichment


def test_add_manual(db):
    for bad in ["", "   ", "https://", "notadomain"]:
        with pytest.raises(ValueError):
            ingest.add_manual(db, ingest.ManualCompany(website=bad))
    assert companies.count_companies(db) == 0

    cid = ingest.add_manual(
        db,
        ingest.ManualCompany(
            website="https://www.acme.com/careers",
            name="Acme",
            headcount="11-50",
            funding_stage="Series A",
            location="Remote",
            vertical="Developer Tools",
        ),
    )
    assert cid == company_id("acme.com", "Acme")
    d = detail.get_company_detail(db, cid)
    assert d is not None
    assert d.source == "manual" and d.domain == "acme.com" and d.headcount == 50
    assert (
        d.funding_stage == "Series A" and d.location == "Remote" and d.vertical == "Developer Tools"
    )

    # Re-adding the same domain is rejected and leaves the row intact.
    with pytest.raises(ingest.CompanyExists) as exc:
        ingest.add_manual(db, ingest.ManualCompany(website="https://acme.com", location="NYC"))
    assert exc.value.company_id == cid
    assert companies.count_companies(db) == 1
    d2 = detail.get_company_detail(db, cid)
    assert d2 is not None and d2.location == "Remote"

    gid = ingest.add_manual(db, ingest.ManualCompany(website="globex.io"))
    g = detail.get_company_detail(db, gid)
    assert g is not None and g.name == "globex.io"


# --- dedup ---


def test_aggregator_urls_do_not_collapse(db, tmp_path):
    csv = (
        "Organization Name,Website\n"
        "Acme,https://www.linkedin.com/company/acme\n"
        "Globex,https://www.linkedin.com/company/globex\n"
        "Initech,https://linkedin.com/company/initech\n"
    )
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 3, f"res={res}"
    assert res.collisions == 0
    assert get_detail_by_name(db, "Acme").domain == ""


def test_aggregator_subdomains_route_to_name(db, tmp_path):
    csv = (
        "Organization Name,Website\n"
        "Acme,https://acme.myshopify.com\n"
        "Globex,https://globex.github.io/\n"
    )
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2
    for name in ("Acme", "Globex"):
        assert get_detail_by_name(db, name).domain == ""


def test_domain_then_domainless_folds(db, tmp_path):
    csv = "Organization Name,Website\nAcme,https://acme.com/\nAcme,\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1, f"res={res}"
    assert res.merged == 1
    assert get_detail_by_name(db, "Acme").domain == "acme.com"


def test_domainless_absorbed_by_existing_domains(db, tmp_path):
    csv = "Organization Name,Website\nAcme,https://acme.com/\nAcme,https://acme.io/\nAcme,\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2, f"res={res}"


def test_domain_normalization_variants_dedup(db, tmp_path):
    csv = (
        "Organization Name,Website\n"
        "Acme,https://www.acme.com/careers\n"
        "Acme,acme.com.\n"
        "Acme,acme.com?utm=x\n"
        "Acme,acme.com:443\n"
        "Acme,//acme.com/jobs#top\n"
        "Acme,HTTP://Acme.Com\n"
    )
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1, f"res={res}"


def test_same_domain_different_name_flags_collision(db, tmp_path):
    csv = "Organization Name,Website\nAcme,acme.com\nAcme Holdings,acme.com\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1
    assert res.merged == 1 and res.collisions == 1, f"res={res}"
    assert len(res.collision_details) == 1
    d = res.collision_details[0]
    assert d.incoming_name == "Acme Holdings" and d.overwrote_name == "Acme"


def test_reingest_is_merge_not_collision(db, tmp_path):
    csv = "Organization Name,Website\nAcme,acme.com\nAcme,https://www.acme.com/\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert res.merged == 1
    assert res.collisions == 0


def test_dotless_host_routes_to_name(db, tmp_path):
    run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,acme\n")
    assert get_detail_by_name(db, "Acme").domain == ""


def test_headcount_parsing():
    cases = {
        "11-50": (True, 50),
        "1,001-5,000": (True, 5000),
        "10001+": (True, 10001),
        "10,000+": (True, 10000),
        "5000+": (True, 5000),
        "500": (True, 500),
        "  250  ": (True, 250),
        "11–50": (True, 50),  # en dash
        "Unknown": (False, 0),
        "": (False, 0),
    }
    for s, (valid, want) in cases.items():
        got = ingest_csv.null_headcount(s)
        assert (got is not None) == valid, f"null_headcount({s!r}) = {got}"
        if valid:
            assert got == want, f"null_headcount({s!r}) = {got}, want {want}"


def test_add_manual_rejects_aggregator_url(db):
    for bad in ["https://www.linkedin.com/company/acme", "https://x.com/acme", "acme.github.io"]:
        with pytest.raises(ValueError) as exc:
            ingest.add_manual(db, ingest.ManualCompany(website=bad, name="Acme"))
        assert str(exc.value).startswith("website ")
    assert companies.count_companies(db) == 0

    ingest.add_manual(db, ingest.ManualCompany(website="acme.com", name="Acme"))
    with pytest.raises(ingest.CompanyExists):
        ingest.add_manual(db, ingest.ManualCompany(website="acme.com"))


def test_aggregator_reingest_stable(db, tmp_path):
    csv = "Organization Name,Website\nAcme,https://linkedin.com/company/acme\nGlobex,globex.com\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    n1 = companies.count_companies(db)
    run_ingest(db, tmp_path, "crunchbase", csv)
    n2 = companies.count_companies(db)
    assert n1 == n2


# --- dedup (round 2) ---


def test_bare_tld_and_junk_route_to_name(db, tmp_path):
    csv = "Organization Name,Website\nFoo,.com\nBaz,.com\nQux,.io\nQuux,..\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 4, f"res={res}"


def test_leading_dots_dedup(db, tmp_path):
    csv = "Organization Name,Website\nAcme,acme.com\nAcme,.acme.com\nAcme,...acme.com\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1


def test_reverse_fold_non_ascii_name(db, tmp_path):
    csv = "Organization Name,Website\nCAFÉ,https://cafe.com/\nCAFÉ,\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1, f"res={res}"
    assert res.merged == 1


def test_reverse_fold_case_variant_absorbed(db, tmp_path):
    csv = "Organization Name,Website\nCAFÉ,https://cafe1.com/\nCafé,https://cafe2.com/\nCafé,\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2, f"res={res}"


def test_share_hosts_route_to_name(db, tmp_path):
    csv = (
        "Organization Name,Website\n"
        "Acme,https://youtu.be/aaa\n"
        "Globex,https://youtu.be/bbb\n"
        "Initech,https://lnkd.in/xyz\n"
    )
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 3


def test_userinfo_normalizes_to_bare_host(db, tmp_path):
    assert ingest_csv.normalize_domain("http://user@www.acme.com") == "acme.com"
    csv = "Organization Name,Website\nAcme,http://www.acme.com\nAcme,http://user@www.acme.com\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1


def test_unterminated_quote_skipped_with_error(db, tmp_path):
    csv = 'Organization Name,Website\n"Acme,acme.com\nGlobex,globex.com\n'
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert len(res.errors) > 0, f"res={res}"
    for r in triage.triage_rows(db):
        assert "\n" not in r.name and "Globex" not in r.name


def test_legit_multiline_cell_ingested(db, tmp_path):
    csv = 'Organization Name,Website,Description\nAcme,acme.com,"We build widgets.\nFounded 2019."\nGlobex,globex.com,one-liner\n'
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2
    d = get_detail_by_name(db, "Acme")
    assert d.domain == "acme.com"
    assert "Founded 2019" in d.raw_json["Description"]


def test_missing_name_column_errors(db, tmp_path):
    with pytest.raises(ValueError) as exc:
        run_ingest(db, tmp_path, "crunchbase", "Org,Website\nAcme,acme.com\n")
    assert "name" in str(exc.value)


def test_duplicate_header_first_wins(db, tmp_path):
    csv = "Organization Name,Website,Website\nAcme,acme.com,bit.ly/acme-track\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert get_detail_by_name(db, "Acme").domain == "acme.com"


def test_repeated_header_row_skipped(db, tmp_path):
    csv = "Organization Name,Website\nAcme,acme.com\nOrganization Name,Website\nGlobex,globex.com\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2, f"res={res}"
    for r in triage.triage_rows(db):
        assert r.name != "Organization Name"


def test_duplicate_header_raw_json_preserves_all(db, tmp_path):
    csv = "Organization Name,Note,Note,Website\nAcme,first,second,acme.com\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    raw = get_detail_by_name(db, "Acme").raw_json
    assert raw["Note"] == "first" and raw["Note (2)"] == "second", raw


def test_headcount_round2():
    cases = {
        "11 to 50": (True, 50),
        "100 to 200 employees": (True, 200),
        "1.5k": (True, 1500),
        "2.5M": (True, 2500000),
        "$1.2M": (True, 1200000),
        "500k": (True, 500000),
        "50-10": (True, 50),
        "-50": (True, 50),
        "5000+": (True, 5000),
        "10001+": (True, 10001),
    }
    for s, (valid, want) in cases.items():
        got = ingest_csv.null_headcount(s)
        assert (got is not None) == valid, f"null_headcount({s!r}) = {got}"
        if valid:
            assert got == want, f"null_headcount({s!r}) = {got}, want {want}"


def test_forward_fold_still_works_and_carries_children(db, tmp_path):
    run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,\n")
    seed_enrichment(db, company_id("", "Acme"))
    res = run_ingest(
        db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,https://acme.com/\n"
    )
    assert res.merged == 1, f"res={res}"
    assert companies.count_companies(db) == 1
    d = get_detail_by_name(db, "Acme")
    assert d.domain == "acme.com" and d.has_enrichment


# --- dedup (round 3) ---


def test_add_manual_folds_name_keyed_twin(db, tmp_path):
    run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,\n")
    seed_enrichment(db, company_id("", "Acme"))
    cid = ingest.add_manual(db, ingest.ManualCompany(website="acme.com", name="Acme"))
    assert companies.count_companies(db) == 1
    assert cid == company_id("acme.com", "Acme")
    d = get_detail_by_name(db, "Acme")
    assert d.domain == "acme.com" and d.has_enrichment


def test_domain_overwrite_folds_renamed_twin(db, tmp_path):
    csv = "Organization Name,Website\nAcme Holdings,acme.com\nAcme,\nAcme,acme.com\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1, f"res={res}"
    d = get_detail_by_name(db, "Acme")
    assert d is not None and d.domain == "acme.com"


def test_reverse_fold_backfills_blanks(db, tmp_path):
    csv = (
        "Organization Name,Website,Number of Employees,Headquarters Location\n"
        "Acme,acme.com,,\n"
        "Acme,,11-50,Boston\n"
    )
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1, f"res={res}"
    d = get_detail_by_name(db, "Acme")
    assert d.headcount == 50 and d.location == "Boston"


def test_looks_like_domain_label_validation(db, tmp_path):
    good = ["acme.com", "sub.acme.co.uk", "xn--mnchen-3ya.de", "a-b.io", "123.example.com"]
    bad = [
        "acme.com (verified)",
        "ac me.com",
        "com",
        "localhost",
        "-acme.com",
        "acme-.com",
        "a..b.com",
        "acme.c_m",
    ]
    for h in good:
        assert ingest_csv.looks_like_domain(h), h
    for h in bad:
        assert not ingest_csv.looks_like_domain(h), h
    run_ingest(
        db,
        tmp_path,
        "crunchbase",
        "Organization Name,Website\nAcme,acme.com\nAcme,acme.com (verified)\n",
    )
    assert companies.count_companies(db) == 1


def test_single_column_header_name_not_dropped(db, tmp_path):
    run_ingest(db, tmp_path, "crunchbase", "Organization Name\nOrganization Name\nAcme\n")
    assert companies.count_companies(db) == 2


def test_surplus_cells_preserved(db, tmp_path):
    run_ingest(
        db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,acme.com,extra1,extra2\n"
    )
    raw = get_detail_by_name(db, "Acme").raw_json
    assert raw["__extra_2"] == "extra1" and raw["__extra_3"] == "extra2", raw


def test_row_as_map_collision_proof():
    header = ["Website", "Website (2)", "Website"]
    row = ["primary.com", "literal2.com", "dup.com"]
    m = ingest_csv.row_as_map(header, row)
    vals = set(m.values())
    for want in ("primary.com", "literal2.com", "dup.com"):
        assert want in vals, m
    assert len(m) == 3, m


def test_headcount_round3():
    cases = {
        "1k-5k": (True, 5000),
        "10k-50k": (True, 50000),
        "1.5k-3k": (True, 3000),
        "1k to 5k": (True, 5000),
        "500k-1m": (True, 1000000),
        "2.5": (True, 2),
        "v2.0": (True, 2),
        "10000000000b": (False, 0),
        "99999999999999999999": (False, 0),
    }
    for s, (valid, want) in cases.items():
        got = ingest_csv.null_headcount(s)
        assert (got is not None) == valid, f"null_headcount({s!r}) = {got}"
        if valid:
            assert got == want, f"null_headcount({s!r}) = {got}, want {want}"


# --- dedup (round 4) ---


def test_last_column_unterminated_quote_skipped(db, tmp_path):
    csv = 'Organization Name,Website\nAcme,"acme.com\nGlobex,globex.com\nInitech,initech.com\n'
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert len(res.errors) > 0, f"res={res}"
    for r in triage.triage_rows(db):
        assert not any(ch in r.name for ch in "\n\r") and "Globex" not in r.name


def test_balanced_multiline_still_ingests(db, tmp_path):
    csv = 'Organization Name,Website,Description\nAcme,acme.com,"Line one.\nLine two."\n'
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 1, f"res={res}"


def test_fold_into_enriched_target_no_pk_conflict(db, tmp_path):
    run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nOther,acme.com\n")
    seed_enrichment(db, company_id("acme.com", "Other"))
    run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,\n")
    seed_enrichment(db, company_id("", "Acme"))
    res = run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,acme.com\n")
    assert res.errors == [], f"fold errored: {res.errors}"
    assert companies.count_companies(db) == 1
    d = get_detail_by_name(db, "Acme")
    assert d is not None and d.has_enrichment and d.domain == "acme.com"
    run_ingest(db, tmp_path, "crunchbase", "Organization Name,Website\nAcme,acme.com\n")
    assert companies.count_companies(db) == 1


def test_ipv4_literal_not_an_identity(db, tmp_path):
    assert not ingest_csv.looks_like_domain("203.0.113.7")
    csv = "Organization Name,Website\nAcme,http://203.0.113.7/\nGlobex,https://203.0.113.7:8080/path\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2


def test_headcount_overflow_boundary():
    for s in ["9223372036854775808", "9223372036854775807", "99999999999999999999"]:
        assert ingest_csv.null_headcount(s) is None, s
    assert ingest_csv.null_headcount("9000000000000000000") == 9000000000000000000


def test_ambiguous_domainless_absorbed(db, tmp_path):
    csv = "Organization Name,Website\nAcme,acme.io\nAcme,acme.com\nAcme,\nAcme,acme.com\n"
    res = run_ingest(db, tmp_path, "crunchbase", csv)
    assert companies.count_companies(db) == 2, f"res={res}"


def test_reingest_idempotent_with_ambiguous_name(db, tmp_path):
    csv = "Organization Name,Website\nAcme,acme.io\nAcme,\nAcme,acme.com\n"
    run_ingest(db, tmp_path, "crunchbase", csv)
    n1 = companies.count_companies(db)
    run_ingest(db, tmp_path, "crunchbase", csv)
    n2 = companies.count_companies(db)
    assert n1 == n2
    assert n1 == 2


# --- ensure_company ---


def test_ensure_company_creates_and_resolves(db):
    cid, created = ingest.ensure_company(
        db,
        ingest.CapturedCompany(
            name="Acme", domain="acme.com", vertical="AI infra", source_url="https://acme.com/about"
        ),
    )
    assert created
    assert cid == company_id("acme.com", "Acme")

    cid2, created = ingest.ensure_company(
        db, ingest.CapturedCompany(name="Acme Inc", domain="acme.com")
    )
    assert not created and cid2 == cid

    name, _ = companies.company_name_by_id(db, cid)
    assert name == "Acme"  # the existing row was not overwritten


def test_ensure_company_name_keyed(db):
    cid, created = ingest.ensure_company(db, ingest.CapturedCompany(name="Stealth Co"))
    assert created
    assert cid == company_id("", "Stealth Co")

    want, _ = ingest.ensure_company(db, ingest.CapturedCompany(name="Acme", domain="acme.com"))
    got, created = ingest.ensure_company(db, ingest.CapturedCompany(name="Acme"))
    assert not created and got == want

    with pytest.raises(ValueError) as exc:
        ingest.ensure_company(db, ingest.CapturedCompany(domain="linkedin.com"))
    assert "company" in str(exc.value)


def test_ensure_company_folds_name_twin(db):
    twin, _ = ingest.ensure_company(db, ingest.CapturedCompany(name="Acme"))
    cid, created = ingest.ensure_company(db, ingest.CapturedCompany(name="Acme", domain="acme.com"))
    assert not created
    assert not companies.company_exists(db, twin)
    assert companies.company_exists(db, cid)
