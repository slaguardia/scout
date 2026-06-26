"""The link-capture agent pass and the direct posting-add + posting sub-resource
edits.

Faithful port of internal/web/capture.go:
  - POST /api/capture            — the one-fetch + at-most-one-LLM capture pass.
  - POST /api/postings           — add one posting from a link, no LLM (ATS links
                                   auto-resolve keyless; else a bare insert).
  - PUT|POST /api/postings/{id}/{details,url,company,next-up} — hand edits to a
    posting's content / identity / queue mark.

(GET /api/postings, PUT /api/postings/{id} tracking, DELETE, and recapture are in
core.py; the outreach / outreach-log / answers sub-routes are part 2A.)
"""
from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from starlette.responses import Response

from scout import capture as capture_pkg
from scout import ingest
from scout.store import detail as detail_store
from scout.store import postings as postings_store

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response
from .core import _s, decode_json, raw_body

router = APIRouter()


# --- POST /api/capture -------------------------------------------------------


@router.post("/api/capture")
def capture(raw: bytes = Depends(raw_body), con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    """Run the link-capture agent pass on one pasted URL: fetch, classify, upsert.
    Synchronous (one fetch + at most one LLM call). The key is required only for
    links the ATS resolver can't handle — an ATS posting link captures keyless."""
    body = decode_json(raw)
    url = _s(body, "url")
    kind = _s(body, "kind")
    if kind not in ("", capture_pkg.KIND_JOB, capture_pkg.KIND_COMPANY):
        return json_error("kind must be job_posting or company_page", 400)

    fields_body = body.get("fields") or {}
    if not isinstance(fields_body, dict):
        fields_body = {}

    # The key precondition only guards the LLM path: an ATS-resolvable posting link
    # (not pinned as a company page) never touches the model, so it works keyless.
    ats_no_llm = kind != capture_pkg.KIND_COMPANY and capture_pkg.is_ats_posting(url)
    if state.ensure_anthropic_key(con) == "" and not ats_no_llm:
        return json_error(
            "capture needs an Anthropic API key (set one in Settings, or ANTHROPIC_API_KEY "
            "in the server environment)",
            412,
        )

    c = capture_pkg.Capturer(db=con, client=state.anthropic)
    req = capture_pkg.Request(
        url=url,
        kind=kind,
        fields=capture_pkg.Fields(
            name=_s(fields_body, "name"),
            location=_s(fields_body, "location"),
            headcount=_s(fields_body, "headcount"),
            funding_stage=_s(fields_body, "funding_stage"),
            vertical=_s(fields_body, "vertical"),
            title=_s(fields_body, "title"),
        ),
    )
    try:
        res = c.run(req)  # ValueError("url …") -> 400 via the global handler
    except capture_pkg.FetchError as fe:
        return json_response({"error": str(fe), "fetch_status": fe.status}, 422)
    return json_response(res)


# --- POST /api/postings (add a posting from a link, no agent pass) -----------


@router.post("/api/postings")
def add_posting(raw: bytes = Depends(raw_body), con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    """Add one posting from just a link. A supported-ATS posting link resolves
    keyless through the platform API first (auto-fills the details); otherwise a
    bare insert, with the company resolved from the typed name and/or the link's
    own host. Neither identifies a company → 400, no write."""
    body = decode_json(raw)
    raw_url = _s(body, "url").strip()
    title = _s(body, "title")

    parsed = urlparse(raw_url) if raw_url else None
    if raw_url == "" or parsed is None or parsed.scheme not in ("http", "https"):
        return json_error("url must be http(s)", 400)

    # A supported-ATS posting link auto-fills via the platform API (no LLM, no key);
    # a resolve miss falls through to the plain insert so the link still tracks.
    if capture_pkg.is_ats_posting(raw_url):
        c = capture_pkg.Capturer(db=con, client=state.anthropic)
        res = c.capture_ats_posting(
            capture_pkg.Request(
                url=raw_url,
                kind=capture_pkg.KIND_JOB,
                fields=capture_pkg.Fields(name=_s(body, "company").strip(), title=title),
            )
        )
        if res is not None and res.posting is not None:
            return json_response(res)

    name = _s(body, "company").strip()
    domain = capture_pkg.company_domain_from_url(raw_url)
    if name == "" and domain == "":
        return json_error(
            "can't tell the company from this link — type a company name, or let scout read the page", 400
        )
    company_id, created = ingest.ensure_company(
        con, ingest.CapturedCompany(name=name, domain=domain, source_url=raw_url)
    )
    p = postings_store.add_posting(con, company_id, raw_url, title)
    cname, _ = detail_store.get_company_name(con, p.company_id)
    return json_response(
        {"posting": p, "company_id": p.company_id, "company_name": cname, "company_created": created}
    )


# --- posting sub-resources: details / url / company / next-up ----------------


@router.api_route("/api/postings/{posting_id}/details", methods=["PUT", "POST"])
def posting_details(posting_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Edit a posting's hand-editable content (title, location, comp, description,
    …). A direct write — no capture/LLM. NotFound -> 404 via the global handler."""
    body = decode_json(raw)
    e = postings_store.PostingEdit(
        title=_s(body, "title"),
        location=_s(body, "location"),
        employment_type=_s(body, "employment_type"),
        workplace_type=_s(body, "workplace_type"),
        department=_s(body, "department"),
        comp_range=_s(body, "comp_range"),
        description=_s(body, "description"),
    )
    return json_response(postings_store.update_posting_details(con, posting_id, e))


@router.api_route("/api/postings/{posting_id}/url", methods=["PUT", "POST"])
def posting_url(posting_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Change a posting's link (its identity). A bad/empty url is a 400
    (ValueError "url …"); NotFound -> 404 — both via the global handlers."""
    body = decode_json(raw)
    return json_response(postings_store.update_posting_url(con, posting_id, _s(body, "url")))


@router.api_route("/api/postings/{posting_id}/company", methods=["PUT", "POST"])
def posting_company(posting_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Re-link a posting to a different existing company. An unknown/blank target is
    a 400 (UnknownCompany), an unknown posting a 404 — never a silent create."""
    body = decode_json(raw)
    p = postings_store.update_posting_company(con, posting_id, _s(body, "company_id"))
    cname, _ = detail_store.get_company_name(con, p.company_id)
    return json_response({"posting": p, "company_id": p.company_id, "company_name": cname})


@router.api_route("/api/postings/{posting_id}/next-up", methods=["PUT", "POST"])
def posting_next_up(posting_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Queue/unqueue a posting as "next up for outreach". NotFound -> 404."""
    body = decode_json(raw)
    return json_response(postings_store.set_posting_next_up(con, posting_id, bool(body.get("next_up"))))
