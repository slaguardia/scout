"""Core read/triage + company/posting routes.

Faithful port of internal/web/server.go and me.go (plus the handlePostings GET,
handlePosting PUT/DELETE, and handlePostingRecapture dispatch from capture.go).
Go's prefix handlers that parse sub-paths/methods become explicit FastAPI routes
here. Each handler is a sync `def` taking a per-request connection from get_db
(and AppState from get_state where it needs the clients / taste cache).
"""
from __future__ import annotations

import json
import sys

from fastapi import APIRouter, Depends, Header, Request
from starlette.responses import PlainTextResponse, Response

from scout import capture as capture_pkg
from scout import ingest
from scout.store import (
    detail as detail_store,
    marks,
    overrides,
    postings as postings_store,
    trace as trace_store,
    triage,
    verdicts,
)
from scout.store._helpers import null
from scout.store.companies import EditableCompany

from ..deps import AppState, get_db, get_state
from ..responses import json_error, json_response

router = APIRouter()


# --- request-body helpers ----------------------------------------------------


async def raw_body(request: Request) -> bytes:
    """Read the request body bytes in the event loop, so the sync endpoint (run in
    the threadpool) can decode them without awaiting."""
    return await request.body()


def decode_json(raw: bytes) -> dict:
    """Parse a JSON object body, mirroring Go's json.Decoder: a malformed/empty
    body is a 400 with an "invalid JSON" message (ValueError → 400 handler)."""
    try:
        data = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"invalid JSON: {e}")
    if not isinstance(data, dict):
        raise ValueError("invalid JSON: expected an object")
    return data


def _s(body: dict, key: str) -> str:
    """A string field from a decoded body, "" when absent/null."""
    v = body.get(key)
    return v if isinstance(v, str) else ""


def _detail_or_404(con, company_id: str) -> Response:
    d = detail_store.get_company_detail(con, company_id)
    if d is None:
        return json_error("not found", 404)
    return json_response(d)


# --- misc --------------------------------------------------------------------


@router.get("/healthz")
def healthz() -> Response:
    return PlainTextResponse("ok\n")


@router.get("/api/me")
def me(x_auth_request_email: str | None = Header(default=None)) -> Response:
    """Echo the signed-in identity from the trusted edge header; {} when none.
    Always 200 — "no identity" is a normal local-dev state."""
    if not x_auth_request_email:
        return json_response({})
    return json_response({"email": x_auth_request_email})


@router.get("/api/meta")
def meta(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    """Capabilities, so the UI can gate buttons. A dashboard-stored key flips the
    call-time flags (verdict/capture) without a restart."""
    _, key_source = state.active_anthropic_key(con)
    has_key = key_source != ""
    return json_response(
        {
            "control": state.runner is not None,
            "brain": state.brain_healthy(),
            "verdict": has_key,
            "capture": has_key,
            "chat": state.chat is not None,
            "outreach": state.outreach is not None,
            "answers": state.answers is not None,
            "key_source": key_source or None,
            "source": state.config.ingest_source,
        }
    )


@router.get("/api/stats")
def stats(con=Depends(get_db), state: AppState = Depends(get_state)) -> Response:
    version, source = "", ""
    tb = state.current_taste()
    if tb is not None:
        version, source = tb.version, tb.source
    return json_response(detail_store.get_stats(con, version, source))


@router.get("/api/facets")
def facets(con=Depends(get_db)) -> Response:
    """Distinct funding stages + verticals for the Add-company dropdowns."""
    from scout.store import companies as companies_store

    return json_response(
        {
            "funding_stages": companies_store.distinct_values(con, "funding_stage"),
            "verticals": companies_store.vertical_tags(con),
        }
    )


# --- companies collection ----------------------------------------------------


@router.get("/api/companies")
def list_companies(con=Depends(get_db)) -> Response:
    rows = triage.triage_rows(con)
    return json_response({"rows": rows, "count": len(rows)})


@router.post("/api/companies")
def add_company(raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Add one hand-entered company (source "manual"). Website is the only required
    field. 409 (named) on a domain already present; 400 on a bad website."""
    body = decode_json(raw)
    try:
        cid = ingest.add_manual(
            con,
            ingest.ManualCompany(
                website=_s(body, "website"),
                name=_s(body, "name"),
                headcount=_s(body, "headcount"),
                funding_stage=_s(body, "funding_stage"),
                location=_s(body, "location"),
                vertical=_s(body, "vertical"),
            ),
        )
    except ingest.CompanyExists as e:
        return json_error(_already_in_list_msg(con, e.company_id), 409)
    return json_response({"company_id": cid})


def _already_in_list_msg(con, company_id: str) -> str:
    """The 409 body for a duplicate manual add, naming the company collided with."""
    try:
        name, domain = detail_store.get_company_name(con, company_id)
    except Exception:  # noqa: BLE001
        return "company already in the list"
    if not name:
        return "company already in the list"
    if domain:
        return f"{name} ({domain}) is already in the list"
    return f"{name} is already in the list"


# --- one company + sub-resources ---------------------------------------------


@router.get("/api/companies/{company_id}")
def company_detail(company_id: str, con=Depends(get_db)) -> Response:
    return _detail_or_404(con, company_id)


@router.put("/api/companies/{company_id}")
def company_edit(company_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Full-replace edit of the hand-editable fields (blanks clear); name required.
    The website/domain is identity and is not editable here."""
    body = decode_json(raw)
    name = _s(body, "name").strip()
    if name == "":
        return json_error("name is required", 400)
    from scout.store import companies as companies_store

    companies_store.update_company_editable(
        con,
        company_id,
        EditableCompany(
            name=name,
            headcount=ingest.parse_headcount(_s(body, "headcount")),
            funding_stage=null(_s(body, "funding_stage").strip()),
            location=null(_s(body, "location").strip()),
            vertical=null(_s(body, "vertical").strip()),
        ),
    )
    return _detail_or_404(con, company_id)


@router.delete("/api/companies/{company_id}")
def company_delete(company_id: str, con=Depends(get_db)) -> Response:
    """Permanently remove a company and everything attached (cascades). 404 unknown."""
    from scout.store import companies as companies_store

    companies_store.delete_company(con, company_id)
    return json_response({"company_id": company_id, "deleted": True})


@router.api_route("/api/companies/{company_id}/reviewed", methods=["POST", "PUT"])
def company_reviewed(company_id: str, con=Depends(get_db)) -> Response:
    """Stamp the company reviewed now (no body). Returns the refreshed detail."""
    marks.touch_reviewed(con, company_id)
    return _detail_or_404(con, company_id)


@router.api_route("/api/companies/{company_id}/flagged", methods=["PUT", "POST"])
def company_flagged(company_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    body = decode_json(raw)
    marks.set_flagged(con, company_id, bool(body.get("flagged")))
    return _detail_or_404(con, company_id)


@router.api_route("/api/companies/{company_id}/verdict", methods=["PUT", "POST"])
def company_verdict(
    company_id: str,
    raw: bytes = Depends(raw_body),
    con=Depends(get_db),
    state: AppState = Depends(get_state),
) -> Response:
    """Set a verdict by hand: stamped model "manual" (sticky), with a durable
    override row + a decision-trail row appended. Returns the refreshed detail."""
    body = decode_json(raw)
    v = _s(body, "verdict").strip().lower()
    if v not in ("yes", "maybe", "no"):
        return json_error('verdict must be "yes", "maybe", or "no"', 400)
    # Reject an unknown company up front (NotFound → 404) so a bad id can't create
    # a dangling verdict.
    detail_store.get_company_name(con, company_id)

    from_verdict = ""
    prev = verdicts.get_verdict(con, company_id)
    if prev is not None:
        from_verdict = prev.verdict

    reason = _s(body, "reason").strip()
    version = state.current_taste_version()
    verdicts.upsert_verdict(
        con,
        verdicts.Verdict(
            company_id=company_id, verdict=v, reason=reason,
            taste_version=version, model=verdicts.MANUAL_MODEL,
        ),
    )
    # Durable override log (record of intent); a failure must not sink the write.
    try:
        overrides.insert_verdict_override(
            con,
            overrides.VerdictOverride(
                company_id=company_id, from_verdict=from_verdict, to_verdict=v,
                reason=reason, criteria_version=version,
            ),
        )
    except Exception as e:  # noqa: BLE001
        print(f"verdict override log {company_id}: {e}", file=sys.stderr)
    # Best-effort trail row, mirroring the scorer.
    try:
        trace_store.insert_verdict_trace(
            con,
            trace_store.VerdictTrace(
                company_id=company_id, model=verdicts.MANUAL_MODEL, taste_version=version,
                criteria_source="manual override", verdict=v, reason=reason,
            ),
        )
    except Exception:  # noqa: BLE001
        pass
    return _detail_or_404(con, company_id)


@router.get("/api/companies/{company_id}/trace")
def company_trace(company_id: str, con=Depends(get_db)) -> Response:
    return json_response({"events": trace_store.company_trace(con, company_id)})


@router.put("/api/companies/{company_id}/domain")
def company_domain(company_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Attach/change a company's website/domain — re-keys the row (and folds a
    twin). Returns the refreshed detail under the (possibly new) id. 409 when a
    different company already owns the domain."""
    body = decode_json(raw)
    new_id = ingest.set_company_domain(con, company_id, _s(body, "website"))
    return _detail_or_404(con, new_id)


@router.put("/api/companies/{company_id}/notes")
def company_notes(company_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Set the free-form human-only notes (blank clears). Returns refreshed detail."""
    from scout.store import companies as companies_store

    body = decode_json(raw)
    companies_store.update_company_notes(con, company_id, _s(body, "notes").strip())
    return _detail_or_404(con, company_id)


@router.post("/api/companies/{company_id}/postings")
def company_add_posting(
    company_id: str,
    raw: bytes = Depends(raw_body),
    con=Depends(get_db),
    state: AppState = Depends(get_state),
) -> Response:
    """Add a job-posting link to a company, pinned to THIS company. An ATS link
    resolves keyless; any other fetchable link gets the one-shot LLM pass when a
    key is set; otherwise a bare insert so the link always tracks."""
    body = decode_json(raw)
    url = _s(body, "url")
    title = _s(body, "title")

    if capture_pkg.is_ats_posting(url.strip()):
        c = capture_pkg.Capturer(db=con, client=state.anthropic)
        res = c.capture_ats_posting_for_company(
            company_id,
            capture_pkg.Request(url=url, kind=capture_pkg.KIND_JOB, fields=capture_pkg.Fields(title=title)),
        )
        if res is not None and res.posting is not None:
            return json_response(res.posting)
        # resolve missed — fall through to the bare insert
    elif state.ensure_anthropic_key(con) != "":
        c = capture_pkg.Capturer(db=con, client=state.anthropic)
        res = c.capture_job_for_company(
            company_id, capture_pkg.Request(url=url, fields=capture_pkg.Fields(title=title))
        )
        if res is not None and res.posting is not None:
            return json_response(res.posting)
        # unfetchable / no extraction — fall through to the bare insert

    p = postings_store.add_posting(con, company_id, url, title)
    return json_response(p)


# --- postings (jobs view + tracking) -----------------------------------------


@router.get("/api/postings")
def list_postings(con=Depends(get_db)) -> Response:
    """The jobs view: every posting across companies, joined with company info."""
    rows = postings_store.list_job_rows(con)
    return json_response({"rows": rows, "count": len(rows)})


@router.api_route("/api/postings/{posting_id}", methods=["PUT", "POST"])
def posting_tracking(posting_id: str, raw: bytes = Depends(raw_body), con=Depends(get_db)) -> Response:
    """Update one posting's application-lifecycle fields (the tracker half of the
    jobs view). Returns the refreshed posting."""
    body = decode_json(raw)
    t = postings_store.PostingTracking(
        application_status=_s(body, "application_status"),
        outreach_status=_s(body, "outreach_status"),
        notes=_s(body, "notes"),
    )
    p = postings_store.update_posting_tracking(con, posting_id, t)
    return json_response(p)


@router.delete("/api/postings/{posting_id}")
def posting_delete(posting_id: str, con=Depends(get_db)) -> Response:
    postings_store.delete_posting(con, posting_id)
    return json_response({"posting_id": posting_id, "deleted": True})


@router.api_route("/api/postings/{posting_id}/recapture", methods=["POST", "PUT"])
def posting_recapture(
    posting_id: str, con=Depends(get_db), state: AppState = Depends(get_state)
) -> Response:
    """Re-run the capture/enrich pass on a posting's stored link. The ATS path is
    keyless; the LLM path needs a key (412 without one)."""
    p = postings_store.get_posting(con, posting_id)
    if p is None:
        return json_error("not found", 404)
    if state.ensure_anthropic_key(con) == "" and not capture_pkg.is_ats_posting(p.url):
        return json_error(
            "re-enrich needs an Anthropic API key for this link (set one in Settings, "
            "or ANTHROPIC_API_KEY in the server environment)",
            412,
        )
    name, _ = detail_store.get_company_name(con, p.company_id)
    c = capture_pkg.Capturer(db=con, client=state.anthropic)
    try:
        res = c.run(
            capture_pkg.Request(
                url=p.url, kind=capture_pkg.KIND_JOB,
                fields=capture_pkg.Fields(name=name, title=p.title),
            )
        )
    except capture_pkg.FetchError as fe:
        return json_response({"error": str(fe), "fetch_status": fe.status}, 422)
    if res.posting is None:
        msg = res.note or "nothing to re-enrich from that link"
        return json_response({"error": msg, "fetch_status": res.fetch_status}, 422)
    return json_response(res.posting)
