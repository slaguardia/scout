"""Application classifier + company/ATS+role matching (slice 4)."""
from __future__ import annotations

from gmail_fakes import gmail_message
from httpstub import http_server
from outreach_fakes import FakeAnthropic

from scout import anthropic
from scout.gmail import classify, match
from scout.store import postings
from scout.store.companies import Company, upsert_company

STAGES = ["applied", "screening", "interview", "offer", "rejected"]


def _client(reply):
    return FakeAnthropic([reply])


def test_classify_returns_validated_label():
    fa = _client('{"status":"interview","confidence":0.9}')
    with http_server(fa.handle) as aurl:
        c = anthropic.Client(api_key="k", endpoint=aurl)
        label, conf = classify.classify_application(c, "", "Interview invite", "Can you chat Tuesday?", STAGES)
    assert label == "interview" and conf == 0.9


def test_classify_none_returns_empty():
    fa = _client('{"status":"none","confidence":0.2}')
    with http_server(fa.handle) as aurl:
        c = anthropic.Client(api_key="k", endpoint=aurl)
        label, _ = classify.classify_application(c, "", "Newsletter", "Weekly digest", STAGES)
    assert label == ""


def test_classify_unknown_label_dropped():
    fa = _client('{"status":"ghosted","confidence":0.8}')  # not in STAGES
    with http_server(fa.handle) as aurl:
        c = anthropic.Client(api_key="k", endpoint=aurl)
        label, _ = classify.classify_application(c, "", "x", "y", STAGES)
    assert label == ""


def test_match_application_by_company_domain(db):
    cid = upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/j", "Software Engineer")
    parsed = match.parse_message(
        gmail_message("a", "careers@acme.com", "me@gmail.com", "Update: Software Engineer", "...")
    )
    assert classify.match_application(db, parsed) == p.id


def test_match_application_subdomain(db):
    cid = upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/j", "SE")
    parsed = match.parse_message(gmail_message("a", "no-reply@jobs.acme.com", "me@gmail.com", "Hi", "..."))
    assert classify.match_application(db, parsed) == p.id


def test_match_application_by_name_for_ats_sender(db):
    cid = upsert_company(db, Company(source="t", name="Acme", domain="acme.com", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://acme.com/j", "Software Engineer")
    parsed = match.parse_message(
        gmail_message("a", "no-reply@greenhouse.io", "me@gmail.com",
                      "Your application to Acme", "Thanks for applying to Acme for the Software Engineer role.")
    )
    assert classify.match_application(db, parsed) == p.id


def test_match_application_unknown_company_is_empty(db):
    parsed = match.parse_message(gmail_message("a", "x@unknown-co.com", "me@gmail.com", "s", "b"))
    assert classify.match_application(db, parsed) == ""


def test_company_name_word_boundary(db):
    cid = upsert_company(db, Company(source="t", name="Ramp", domain="ramp.example", raw_json="{}"))
    p = postings.add_posting(db, cid, "https://ramp/j", "Engineer")
    # "trampoline" contains "ramp" but is not the company — must NOT match.
    parsed = match.parse_message(
        gmail_message("a", "no-reply@greenhouse.io", "me@gmail.com", "Re", "there is a trampoline here")
    )
    assert classify.match_application(db, parsed) == ""
    # The actual word "Ramp" matches.
    parsed2 = match.parse_message(
        gmail_message("b", "no-reply@greenhouse.io", "me@gmail.com", "Update from Ramp", "Thanks for applying to Ramp")
    )
    assert classify.match_application(db, parsed2) == p.id


def test_replied_label_does_not_guess():
    from scout.gmail.sync import replied_label

    assert replied_label(["initial contact", "no response", "replied", "followed up"]) == "replied"
    # No literal 'replied' in a customized vocab → "" (don't guess a positional label).
    assert replied_label(["a", "b", "c", "d"]) == ""
