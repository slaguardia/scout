"""scout.capture — link capture: ATS resolvers, JSON-LD, the Haiku pass, and
application-question detection.

Public surface (imported by the web layer's /api/capture endpoints, the chat
engine, and the CLI):
    Capturer, Request, Fields, Result, FetchError
    KIND_JOB, KIND_COMPANY, KIND_OTHER
    is_ats_posting, company_domain_from_url
    detect_questions, AppQuestion, QuestionScan
    QUESTIONS_OK, QUESTIONS_NONE, QUESTIONS_UNSUPPORTED, QUESTIONS_UNREACHABLE
"""

from .ats import is_ats_posting
from .capture import (
    KIND_COMPANY,
    KIND_JOB,
    KIND_OTHER,
    Capturer,
    FetchError,
    Fields,
    Request,
    Result,
    company_domain_from_url,
)
from .questions import (
    QUESTIONS_NONE,
    QUESTIONS_OK,
    QUESTIONS_UNREACHABLE,
    QUESTIONS_UNSUPPORTED,
    AppQuestion,
    QuestionScan,
    detect_questions,
)

__all__ = [
    "Capturer",
    "Request",
    "Fields",
    "Result",
    "FetchError",
    "KIND_JOB",
    "KIND_COMPANY",
    "KIND_OTHER",
    "is_ats_posting",
    "company_domain_from_url",
    "detect_questions",
    "AppQuestion",
    "QuestionScan",
    "QUESTIONS_OK",
    "QUESTIONS_NONE",
    "QUESTIONS_UNSUPPORTED",
    "QUESTIONS_UNREACHABLE",
]
