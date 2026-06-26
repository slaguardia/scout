"""Application-question detection. Port of internal/capture/questions.go.

A posting link → the free-text essay questions on its application form. Mirrors
ats.py's structure: dispatch on the recognized ATS target, resolve through the
platform's API, normalize. Two no-LLM platform resolvers (Greenhouse's official
?questions=true, Ashby's unofficial GraphQL applicationForm) cover the bulk;
everything else falls to a single Haiku pass over the page text, or honestly
reports "unsupported". Status is always load-bearing.
"""
from __future__ import annotations

import json
import re
import urllib.parse
from dataclasses import dataclass, field

import httpx

from scout import anthropic, enrich

from .ats import ATS_CALL_TIMEOUT, ATSError, ats_target_for, fetch_ats_json

# Detection statuses. ok: questions found. none: a readable form with no essay
# questions. unsupported: a platform we can't read. unreachable: the form
# API/page couldn't be fetched. Never empty.
QUESTIONS_OK = "ok"
QUESTIONS_NONE = "none"
QUESTIONS_UNSUPPORTED = "unsupported"
QUESTIONS_UNREACHABLE = "unreachable"

# questionPageRunes bounds the page text handed to the LLM fallback. Larger than
# the capture extractor's window: forms list questions further down the page.
QUESTION_PAGE_RUNES = 9000

LLM_MAX_TOKENS = 400

# Shared with the capture extractor parser.
_re_json_block = re.compile(r"\{.*\}", re.S)


@dataclass
class AppQuestion:
    """One free-text essay question on an application form."""

    prompt: str = ""  # the question text shown to the applicant
    key: str = ""  # ATS field id/path; "" when unknown
    max_length: int = 0  # declared char limit; 0 = unknown


@dataclass
class QuestionScan:
    """The result of detecting a posting's application questions. status is
    load-bearing for honest UI; source names the resolver that answered."""

    questions: list[AppQuestion] = field(default_factory=list)
    status: str = ""
    source: str = ""


def detect_questions(httpc: httpx.Client, raw_url: str) -> QuestionScan:
    """Resolve a posting link's essay questions through the platform's API — no
    LLM, no page fetch beyond the API call. Any non-ATS link returns
    "unsupported", so the caller can decide whether to try the HTML+LLM fallback."""
    t = ats_target_for(raw_url)
    if t is None:
        return QuestionScan(status=QUESTIONS_UNSUPPORTED)
    if t.ats == "greenhouse":
        return _detect_greenhouse_questions(httpc, t.base, t.org, t.id)
    if t.ats == "ashby":
        return _detect_ashby_questions(httpc, t.org, t.id)
    if t.ats == "rippling":
        return _detect_rippling_questions(httpc, t.base, t.org, t.id)
    if t.ats == "dover":
        return _detect_dover_questions(httpc, t.base, t.id)
    # Lever surfaces no public application-form API — apply on the site.
    return QuestionScan(status=QUESTIONS_UNSUPPORTED)


# --- Greenhouse (official) ---------------------------------------------------

def _detect_greenhouse_questions(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> QuestionScan:
    url = (api_base + "/v1/boards/" + urllib.parse.quote(org, safe="") + "/jobs/"
           + urllib.parse.quote(job_id, safe="") + "?questions=true")
    try:
        payload = fetch_ats_json(httpc, url)
    except Exception:
        return QuestionScan(status=QUESTIONS_UNREACHABLE, source="greenhouse")

    qs: list[AppQuestion] = []
    for q in payload.get("questions") or []:
        fields = q.get("fields") or []
        types = [f.get("type", "") for f in fields]
        label = q.get("label", "") or ""
        if not _greenhouse_is_essay(label, types):
            continue
        # Key off the textarea field's stable name so re-detection dedupes even
        # if the label is edited.
        key = ""
        for f in fields:
            if f.get("type") == "textarea" and f.get("name"):
                key = f.get("name")
                break
        p = clean_prompt(label)
        if p != "":
            qs.append(AppQuestion(prompt=p, key=key))  # Greenhouse exposes no length cap
    return _scan_from(qs, "greenhouse")


def _greenhouse_is_essay(label: str, field_types: list[str]) -> bool:
    """Keep only content-bearing free-text fields: a textarea (essays and the
    standalone Cover Letter), or a question-like input_text."""
    if is_identity_label(label):
        return False
    has_textarea = "textarea" in field_types
    has_input_text = "input_text" in field_types
    if has_textarea:
        return True
    return has_input_text and looks_like_question(label)


# --- Ashby (unofficial GraphQL) ----------------------------------------------

# The apply-page GraphQL host (NOT the posting-api host in ats.py). A test seam.
ashby_graphql_base = "https://jobs.ashbyhq.com"

# The application-form query, captured from a live Ashby apply page. Unofficial —
# treat its breakage as expected. `field` is a JSON! scalar, decoded as raw JSON.
_ashby_application_form_query = """query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    id
    title
    applicationForm {
      fieldEntries {
        field
        isRequired
      }
    }
  }
}"""


def _detect_ashby_questions(httpc: httpx.Client, org: str, job_id: str) -> QuestionScan:
    """Resolve the application form through Ashby's non-user-graphql endpoint. Any
    schema drift degrades to "unsupported" rather than crashing capture."""
    req_body = json.dumps({
        "operationName": "ApiJobPosting",
        "variables": {"organizationHostedJobsPageName": org, "jobPostingId": job_id},
        "query": _ashby_application_form_query,
    }).encode()

    try:
        resp = _post_ats_graphql(httpc, ashby_graphql_base + "/api/non-user-graphql", req_body)
    except Exception:
        return QuestionScan(status=QUESTIONS_UNREACHABLE, source="ashby")

    errors = resp.get("errors") or []
    data = resp.get("data") or {}
    jp = data.get("jobPosting")
    form = jp.get("applicationForm") if isinstance(jp, dict) else None
    if errors or jp is None or form is None:
        return QuestionScan(status=QUESTIONS_UNSUPPORTED, source="ashby")

    qs: list[AppQuestion] = []
    for e in form.get("fieldEntries") or []:
        f = e.get("field")
        if not isinstance(f, dict):
            continue
        path = f.get("path", "") or ""
        title = f.get("title", "") or ""
        ftype = f.get("type", "") or ""
        # LongText is Ashby's only multi-line free-text type; _systemfield_ paths
        # are name/email/resume.
        if ftype != "LongText" or path.startswith("_systemfield_"):
            continue
        p = clean_prompt(title)
        if p != "":
            qs.append(AppQuestion(prompt=p, key=path))  # Ashby exposes no length cap
    return _scan_from(qs, "ashby")


# --- Rippling (public board API) ---------------------------------------------

def _detect_rippling_questions(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> QuestionScan:
    url = (api_base + "/platform/api/ats/v1/board/" + urllib.parse.quote(org, safe="")
           + "/jobs/" + urllib.parse.quote(job_id, safe=""))
    try:
        payload = fetch_ats_json(httpc, url)
    except Exception:
        return QuestionScan(status=QUESTIONS_UNREACHABLE, source="rippling")
    aja = payload.get("activeJobApplication")
    cq = aja.get("customQuestions") if isinstance(aja, dict) else None
    if not isinstance(aja, dict) or not isinstance(cq, dict):
        # No application form attached — apply on the site.
        return QuestionScan(status=QUESTIONS_UNSUPPORTED, source="rippling")

    qs: list[AppQuestion] = []
    for f in cq.get("fields") or []:
        if not _rippling_is_essay(f.get("fieldType", "") or "", f.get("title", "") or ""):
            continue
        p = clean_prompt(f.get("title", "") or "")
        if p != "":
            qs.append(AppQuestion(prompt=p, key=f.get("oid", "") or ""))  # no length cap
    return _scan_from(qs, "rippling")


def _rippling_is_essay(field_type: str, title: str) -> bool:
    """Keep only content-bearing free-text questions. Structured types and
    identity labels are never essays; a SHORT_ANSWER counts only when its title
    reads like a question. A long-form type is admitted on type alone."""
    if is_identity_label(title):
        return False
    ft = field_type.upper()
    if ft in ("FILE", "PRONOUN", "PHONE_NUMBER"):
        return False
    if "PARAGRAPH" in ft or "LONG" in ft or "ESSAY" in ft or "MULTILINE" in ft:
        return True
    if ft == "SHORT_ANSWER":
        return looks_like_question(title)
    return False


# --- Dover (public apply-portal API) -----------------------------------------

def _detect_dover_questions(httpc: httpx.Client, api_base: str, job_id: str) -> QuestionScan:
    url = api_base + "/api/v1/inbound/application-portal-job/" + urllib.parse.quote(job_id, safe="")
    try:
        payload = fetch_ats_json(httpc, url)
    except Exception:
        return QuestionScan(status=QUESTIONS_UNREACHABLE, source="dover")

    qs: list[AppQuestion] = []
    for q in payload.get("application_questions") or []:
        if q.get("hidden") or not _dover_is_essay(
            q.get("input_type", "") or "", q.get("question_type", "") or "", q.get("question", "") or ""
        ):
            continue
        p = clean_prompt(q.get("question", "") or "")
        if p != "":
            qs.append(AppQuestion(prompt=p, key=q.get("id", "") or ""))  # no length cap
    return _scan_from(qs, "dover")


def _dover_is_essay(input_type: str, question_type: str, title: str) -> bool:
    """Keep only recruiter-authored free-text questions: a CUSTOM, non-identity
    field whose input is free text (SHORT_ANSWER or a long-form type)."""
    if question_type.strip().upper() != "CUSTOM":
        return False
    if is_identity_label(title):
        return False
    it = input_type.strip().upper()
    return it == "SHORT_ANSWER" or "LONG" in it or "PARAGRAPH" in it or "TEXTAREA" in it


# --- HTML + LLM fallback -----------------------------------------------------

def detect_questions_llm(client: anthropic.Client, model: str, httpc: httpx.Client, raw_url: str) -> QuestionScan:
    """Fetch the page and run one Haiku pass to pull essay questions out of
    server-rendered application forms. A fetch failure reports its status and
    stores nothing; the model is best-effort and never invents."""
    text, _, status = enrich.fetch_page(httpc, raw_url, QUESTION_PAGE_RUNES)
    if status != "ok" and status != "low_content":
        return QuestionScan(status=status, source="html-llm")
    model = model or anthropic.DEFAULT_MODEL
    try:
        resp = client.send(anthropic.Request(
            model=model,
            system=_questions_contract,
            max_tokens=LLM_MAX_TOKENS,
            messages=[anthropic.Message(role="user", content="Application page text (truncated):\n" + text + "\n\nReturn the JSON now.")],
        ))
    except Exception:
        return QuestionScan(status=QUESTIONS_UNREACHABLE, source="html-llm")
    qs, ok = parse_questions_json(resp.text())
    if not ok:
        # The model returned nothing parseable — honest "unsupported".
        return QuestionScan(status=QUESTIONS_UNSUPPORTED, source="html-llm")
    return _scan_from(qs, "html-llm")


_questions_contract = """You are Scout's application-form question detector. You are given the visible text of a job application page. Extract ONLY the free-text essay / short-answer questions the applicant must write prose answers to.

INCLUDE: open-ended written questions ("Why do you want to work here?", "Describe a project you're proud of", "What interests you about this role?"), and a standalone "Cover letter" free-text field (use the prompt "Cover letter").
EXCLUDE: name, email, phone, address; links (LinkedIn / website / GitHub / portfolio); resume / CV upload; yes/no and multiple-choice / dropdown questions; work-authorization and visa-sponsorship questions; and ALL demographic / EEO / diversity / gender / race / veteran / disability questions.

Reply ONLY with valid JSON, no preamble, no markdown fences, exactly:
{"questions": [{"prompt": "<the exact question text>", "max_length": <integer character limit the page states, else 0>}]}

If the page shows no essay questions, or is not an application form, return {"questions": []}. Never invent a question that is not on the page."""


def parse_questions_json(s: str) -> tuple[list[AppQuestion], bool]:
    """Pull the {questions:[...]} object out of the model's text (tolerant of
    fences/prose) and normalize each entry. ok is False only when no JSON object
    is present at all — an empty list is a valid "none" answer."""
    s = s.strip()
    candidates = [s]
    m = _re_json_block.search(s)
    if m:
        candidates.insert(0, m.group(0))
    for cand in candidates:
        try:
            out = json.loads(cand)
        except (ValueError, json.JSONDecodeError):
            continue
        if not isinstance(out, dict):
            continue
        res: list[AppQuestion] = []
        for q in out.get("questions") or []:
            if not isinstance(q, dict):
                continue
            p = clean_prompt(q.get("prompt", "") or "")
            if p != "":
                ml = q.get("max_length", 0) or 0
                if not isinstance(ml, int) or ml < 0:
                    ml = 0
                res.append(AppQuestion(prompt=p, max_length=ml))
        return res, True
    return [], False


# --- shared helpers ----------------------------------------------------------

def _scan_from(qs: list[AppQuestion], source: str) -> QuestionScan:
    """Wrap a resolved question list with the right status: ok when any were
    found, none when the form was readable but carried no essays."""
    status = QUESTIONS_OK if qs else QUESTIONS_NONE
    return QuestionScan(questions=qs, status=status, source=source)


def _post_ats_graphql(httpc: httpx.Client, url: str, body: bytes) -> dict:
    """POST a GraphQL body and decode the JSON reply — the Ashby counterpart of
    fetch_ats_json. Only Content-Type is required for a 200."""
    resp = httpc.post(
        url, content=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=ATS_CALL_TIMEOUT,
    )
    if resp.status_code != 200:
        raise ATSError(f"http {resp.status_code}")
    return resp.json()


def clean_prompt(s: str) -> str:
    """Normalize a question label: non-breaking spaces and whitespace runs
    collapse to single spaces, trimmed."""
    s = s.replace(" ", " ")
    return " ".join(s.split())


def is_identity_label(label: str) -> bool:
    """Whether a form label is a standard identity / contact / link field to drop,
    never an essay question. Cover Letter is deliberately NOT here."""
    l = label.strip().lower()
    if l in {
        "first name", "last name", "full name", "name", "preferred name",
        "email", "email address", "phone", "phone number", "mobile",
        "location", "current location", "city", "pronouns", "gender", "race",
        "ethnicity", "veteran status", "disability status",
    }:
        return True
    # Substring matches catch the common variants.
    for s in ("resume", "linkedin", "github", "website", "portfolio", "curriculum vitae"):
        if s in l:
            return True
    # "cv" only as a standalone token.
    for w in l.split():
        if w == "cv":
            return True
    return False


def looks_like_question(label: str) -> bool:
    """Whether an input_text label reads like a real open-ended question."""
    l = label.strip().lower()
    if l.endswith("?"):
        return True
    for kw in ("why ", "describe", "tell us", "tell me", "what ", "how ", "share ", "explain", "would you", "your experience", "in your own words"):
        if kw in l:
            return True
    return False
