"""Application-question detection."""

from __future__ import annotations

import json

import httpx
import pytest
from httpstub import http_server

from scout.capture import ats, questions
from scout.capture.questions import (
    QUESTIONS_NONE,
    QUESTIONS_OK,
    QUESTIONS_UNREACHABLE,
    QUESTIONS_UNSUPPORTED,
    detect_questions,
    is_identity_label,
)

ASHBY_JOB_ID = "edc19899-2e86-48e1-8b61-69cced824ab2"


def _client() -> httpx.Client:
    return httpx.Client(timeout=5, follow_redirects=True)


def _prompts(scan) -> list[str]:
    return [q.prompt for q in scan.questions]


# --- Greenhouse --------------------------------------------------------------

GREENHOUSE_FIXTURE = json.dumps(
    {
        "title": "Software Engineer",
        "questions": [
            {
                "label": "First Name",
                "required": True,
                "fields": [{"name": "first_name", "type": "input_text"}],
            },
            {
                "label": "Last Name",
                "required": True,
                "fields": [{"name": "last_name", "type": "input_text"}],
            },
            {
                "label": "Email",
                "required": True,
                "fields": [{"name": "email", "type": "input_text"}],
            },
            {
                "label": "Phone",
                "required": False,
                "fields": [{"name": "phone", "type": "input_text"}],
            },
            {
                "label": "Resume/CV",
                "required": True,
                "fields": [
                    {"name": "resume", "type": "input_file"},
                    {"name": "resume_text", "type": "textarea"},
                ],
            },
            {
                "label": "Cover Letter",
                "required": False,
                "fields": [
                    {"name": "cover_letter", "type": "input_file"},
                    {"name": "cover_letter_text", "type": "textarea"},
                ],
            },
            {
                "label": "LinkedIn Profile",
                "required": False,
                "fields": [{"name": "question_1", "type": "input_text"}],
            },
            {
                "label": "Website",
                "required": False,
                "fields": [{"name": "question_2", "type": "input_text"}],
            },
            {
                "label": "What inspires you at work?",
                "required": True,
                "fields": [{"name": "question_4722758008", "type": "textarea"}],
            },
            {
                "label": "How would you approach our hardest problem?",
                "required": True,
                "fields": [{"name": "question_3", "type": "input_text"}],
            },
        ],
    }
)


def test_detect_greenhouse_questions(monkeypatch):
    def handle(req):
        if "/v1/boards/parasail/jobs/4092794008" not in req.path:
            return 404, {}, "not found"
        assert req.query.get("questions") == ["true"]
        return 200, {"Content-Type": "application/json"}, GREENHOUSE_FIXTURE

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "greenhouse_api_base", url)
        scan = detect_questions(
            _client(), "https://job-boards.greenhouse.io/parasail/jobs/4092794008"
        )
        assert scan.status == QUESTIONS_OK and scan.source == "greenhouse"
        got = _prompts(scan)
        want = [
            "Cover Letter",
            "What inspires you at work?",
            "How would you approach our hardest problem?",
        ]
        assert got == want
        for bad in ["First Name", "Email", "Phone", "Resume/CV", "LinkedIn Profile", "Website"]:
            assert bad not in got
        assert scan.questions[0].key == "cover_letter_text"


def test_detect_greenhouse_no_essays(monkeypatch):
    body = json.dumps(
        {
            "questions": [
                {"label": "First Name", "fields": [{"name": "first_name", "type": "input_text"}]},
                {
                    "label": "Resume/CV",
                    "fields": [
                        {"name": "resume", "type": "input_file"},
                        {"name": "resume_text", "type": "textarea"},
                    ],
                },
            ]
        }
    )

    def handle(req):
        return 200, {"Content-Type": "application/json"}, body

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "greenhouse_api_base", url)
        scan = detect_questions(_client(), "https://boards.greenhouse.io/acme/jobs/12345")
        assert scan.status == QUESTIONS_NONE
        assert len(scan.questions) == 0


def test_detect_greenhouse_unreachable(monkeypatch):
    def handle(req):
        return 500, {}, "boom"

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "greenhouse_api_base", url)
        scan = detect_questions(_client(), "https://boards.greenhouse.io/acme/jobs/12345")
        assert scan.status == QUESTIONS_UNREACHABLE


# --- Ashby -------------------------------------------------------------------

ASHBY_FIXTURE = json.dumps(
    {
        "data": {
            "jobPosting": {
                "id": "job-1",
                "title": "Engineer",
                "applicationForm": {
                    "fieldEntries": [
                        {
                            "field": {
                                "path": "_systemfield_name",
                                "title": "Full Name",
                                "type": "String",
                            },
                            "isRequired": True,
                        },
                        {
                            "field": {
                                "path": "_systemfield_resume",
                                "title": "Resume",
                                "type": "File",
                            },
                            "isRequired": True,
                        },
                        {
                            "field": {
                                "path": "49a5763f-75a4-402d-84ef-cfa1ab592efa",
                                "title": "Why are you interested in joining WRITER?",
                                "type": "LongText",
                            },
                            "isRequired": True,
                        },
                        {
                            "field": {
                                "path": "76d756ca-9d77-4727-8b47-2f44baf545e9",
                                "title": "Are you within 50 miles of an office?",
                                "type": "MultiValueSelect",
                                "selectableValues": [{"label": "SF", "value": "SF"}],
                            },
                            "isRequired": True,
                        },
                    ]
                },
            }
        }
    }
)


def test_detect_ashby_questions(monkeypatch):
    def handle(req):
        if req.method != "POST" or req.path != "/api/non-user-graphql":
            return 404, {}, "not found"
        assert req.headers.get("Content-Type") == "application/json"
        return 200, {"Content-Type": "application/json"}, ASHBY_FIXTURE

    with http_server(handle) as url:
        monkeypatch.setattr(questions, "ashby_graphql_base", url)
        scan = detect_questions(
            _client(), "https://jobs.ashbyhq.com/writer/634e0a00-dd96-4f5f-ba5f-4fa3aff4c6c9"
        )
        assert scan.status == QUESTIONS_OK and scan.source == "ashby"
        got = _prompts(scan)
        assert got == ["Why are you interested in joining WRITER?"]
        assert scan.questions[0].key == "49a5763f-75a4-402d-84ef-cfa1ab592efa"


@pytest.mark.parametrize(
    "body",
    [
        '{"data": {"jobPosting": null}}',
        '{"data": {"jobPosting": {"id": "x", "title": "t", "applicationForm": null}}}',
        '{"errors": [{"message": "schema changed"}]}',
    ],
)
def test_detect_ashby_fails_soft(monkeypatch, body):
    def handle(req):
        return 200, {"Content-Type": "application/json"}, body

    with http_server(handle) as url:
        monkeypatch.setattr(questions, "ashby_graphql_base", url)
        scan = detect_questions(
            _client(), "https://jobs.ashbyhq.com/acme/634e0a00-dd96-4f5f-ba5f-4fa3aff4c6c9"
        )
        assert scan.status == QUESTIONS_UNSUPPORTED


# --- Rippling ----------------------------------------------------------------

RIPPLING_FIXTURE = json.dumps(
    {
        "name": "Product Engineer",
        "activeJobApplication": {
            "customQuestions": {
                "fields": [
                    {
                        "title": "First name",
                        "fieldType": "SHORT_ANSWER",
                        "required": True,
                        "oid": "first_name",
                    },
                    {
                        "title": "Email",
                        "fieldType": "SHORT_ANSWER",
                        "required": True,
                        "oid": "email",
                    },
                    {
                        "title": "Current company",
                        "fieldType": "SHORT_ANSWER",
                        "required": False,
                        "oid": "current_company",
                    },
                    {
                        "title": "Location (city only)",
                        "fieldType": "SHORT_ANSWER",
                        "required": True,
                        "oid": "location",
                    },
                    {
                        "title": "Phone number",
                        "fieldType": "PHONE_NUMBER",
                        "required": True,
                        "oid": "phone_number",
                    },
                    {
                        "title": "LinkedIn link",
                        "fieldType": "SHORT_ANSWER",
                        "required": True,
                        "oid": "linkedin_link",
                    },
                    {"title": "Resume", "fieldType": "FILE", "required": True, "oid": "resume"},
                    {
                        "title": "Pronouns",
                        "fieldType": "PRONOUN",
                        "required": False,
                        "oid": "pronouns",
                    },
                    {
                        "title": "Why do you want to join Plenful?",
                        "fieldType": "SHORT_ANSWER",
                        "required": True,
                        "oid": "why_plenful",
                    },
                    {
                        "title": "Describe a project you're proud of",
                        "fieldType": "LONG_ANSWER",
                        "required": False,
                        "oid": "proud_project",
                    },
                ]
            }
        },
    }
)


def test_detect_rippling_questions(monkeypatch):
    def handle(req):
        if req.path != f"/platform/api/ats/v1/board/plenful/jobs/{ASHBY_JOB_ID}":
            return 404, {}, "not found"
        return 200, {"Content-Type": "application/json"}, RIPPLING_FIXTURE

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "rippling_api_base", url)
        scan = detect_questions(_client(), f"https://ats.rippling.com/plenful/jobs/{ASHBY_JOB_ID}")
        assert scan.status == QUESTIONS_OK and scan.source == "rippling"
        got = _prompts(scan)
        assert got == ["Why do you want to join Plenful?", "Describe a project you're proud of"]
        for bad in [
            "First name",
            "Email",
            "Current company",
            "Location (city only)",
            "LinkedIn link",
            "Resume",
            "Phone number",
            "Pronouns",
        ]:
            assert bad not in got
        assert scan.questions[0].key == "why_plenful"


def test_detect_rippling_no_essays(monkeypatch):
    body = json.dumps(
        {
            "name": "X",
            "activeJobApplication": {
                "customQuestions": {
                    "fields": [
                        {"title": "First name", "fieldType": "SHORT_ANSWER", "oid": "first_name"},
                        {"title": "Resume", "fieldType": "FILE", "oid": "resume"},
                    ]
                }
            },
        }
    )

    def handle(req):
        return 200, {"Content-Type": "application/json"}, body

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "rippling_api_base", url)
        scan = detect_questions(_client(), f"https://ats.rippling.com/plenful/jobs/{ASHBY_JOB_ID}")
        assert scan.status == QUESTIONS_NONE and scan.source == "rippling"


def test_detect_rippling_no_form(monkeypatch):
    def handle(req):
        return 200, {"Content-Type": "application/json"}, '{"name":"X","activeJobApplication":null}'

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "rippling_api_base", url)
        scan = detect_questions(_client(), f"https://ats.rippling.com/plenful/jobs/{ASHBY_JOB_ID}")
        assert scan.status == QUESTIONS_UNSUPPORTED


# --- Dover -------------------------------------------------------------------

DOVER_QUESTIONS_FIXTURE = json.dumps(
    {
        "id": "job",
        "client_name": "Paratus",
        "title": "Founding Engineer",
        "application_questions": [
            {
                "id": "q-essay",
                "question": "In two sentences, tell us why you want to work at Paratus",
                "input_type": "SHORT_ANSWER",
                "question_type": "CUSTOM",
                "hidden": False,
            },
            {
                "id": "q-choice",
                "question": "Are you a U.S. citizen and eligible to obtain a U.S. security clearance?",
                "input_type": "MULTIPLE_CHOICE",
                "question_type": "CUSTOM",
                "multiple_choice_options": ["Yes", "No"],
                "hidden": False,
            },
            {
                "id": "q-resume",
                "question": "Resume Upload",
                "input_type": "FILE_UPLOAD",
                "question_type": "RESUME",
                "hidden": False,
            },
            {
                "id": "q-linkedin",
                "question": "LinkedIn Profile URL",
                "input_type": "SHORT_ANSWER",
                "question_type": "LINKEDIN_URL",
                "hidden": False,
            },
            {
                "id": "q-phone",
                "question": "Phone",
                "input_type": "SHORT_ANSWER",
                "question_type": "PHONE_NUMBER",
                "hidden": False,
            },
            {
                "id": "q-hidden",
                "question": "Internal hidden question",
                "input_type": "SHORT_ANSWER",
                "question_type": "CUSTOM",
                "hidden": True,
            },
        ],
    }
)


def test_detect_dover_questions(monkeypatch):
    def handle(req):
        if req.path != f"/api/v1/inbound/application-portal-job/{ASHBY_JOB_ID}":
            return 404, {}, "not found"
        return 200, {"Content-Type": "application/json"}, DOVER_QUESTIONS_FIXTURE

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "dover_api_base", url)
        scan = detect_questions(_client(), f"https://app.dover.com/apply/Paratus/{ASHBY_JOB_ID}")
        assert scan.status == QUESTIONS_OK and scan.source == "dover"
        got = _prompts(scan)
        assert got == ["In two sentences, tell us why you want to work at Paratus"]
        for bad in [
            "Are you a U.S. citizen and eligible to obtain a U.S. security clearance?",
            "Resume Upload",
            "LinkedIn Profile URL",
            "Phone",
            "Internal hidden question",
        ]:
            assert bad not in got
        assert scan.questions[0].key == "q-essay"


def test_detect_dover_no_essays(monkeypatch):
    body = json.dumps(
        {
            "id": "job",
            "application_questions": [
                {
                    "id": "q-resume",
                    "question": "Resume Upload",
                    "input_type": "FILE_UPLOAD",
                    "question_type": "RESUME",
                    "hidden": False,
                },
                {
                    "id": "q-phone",
                    "question": "Phone",
                    "input_type": "SHORT_ANSWER",
                    "question_type": "PHONE_NUMBER",
                    "hidden": False,
                },
            ],
        }
    )

    def handle(req):
        return 200, {"Content-Type": "application/json"}, body

    with http_server(handle) as url:
        monkeypatch.setattr(ats, "dover_api_base", url)
        scan = detect_questions(_client(), f"https://app.dover.com/apply/Paratus/{ASHBY_JOB_ID}")
        assert scan.status == QUESTIONS_NONE and scan.source == "dover"


# --- dispatch ----------------------------------------------------------------


def test_detect_unsupported_host():
    from scout import enrich

    httpc = enrich.new_http_client(0)
    for u in [
        "https://www.linkedin.com/jobs/view/123456",
        "https://example.com/careers/role",
        "not a url",
    ]:
        scan = detect_questions(httpc, u)
        assert scan.status == QUESTIONS_UNSUPPORTED, u
        assert len(scan.questions) == 0, u


def test_identity_label_filtering():
    for drop in [
        "First Name",
        "Email",
        "Phone",
        "Resume/CV",
        "Resume / CV",
        "CV",
        "cv",
        "CV File",
        "Upload your CV",
        "Curriculum Vitae",
        "LinkedIn Profile",
        "Personal Website",
        "GitHub URL",
        "Portfolio",
    ]:
        assert is_identity_label(drop), drop
    for keep in [
        "Why us?",
        "Describe a project you're proud of",
        "Cover Letter",
        "What inspires you at work?",
        "Tell us about yourself",
    ]:
        assert not is_identity_label(keep), keep
