"""The chat engine's custom tool registry, wired to the store + capture pass.

Each tool implementation parses the model-supplied input dict and returns a result
string (the tool_result content). A raised exception is surfaced to the model as an
is_error tool_result, so the model can adapt.
"""

from __future__ import annotations

import functools
import json

from scout import capture
from scout.anthropic import ToolDef, new_web_search_tool
from scout.store import companies, detail, errors, postings, triage, verdicts
from scout.store.postings import PostingTracking
from scout.store.verdicts import MANUAL_MODEL, Verdict


def register_tools(e) -> None:
    """Build the eight-tool registry: seven custom tools wired to the store +
    capture pass, plus the hosted web_search server tool (no client execution — the
    API runs it). Tool descriptions are prescriptive about WHEN to call."""
    defs = [
        (
            ToolDef(
                name="capture_link",
                description="Add a job posting or company to scout from a pasted URL. Call this FIRST whenever the user says they applied to, found, or is looking at a job/company with a link — it resolves the company and posting (idempotent by URL) and returns their ids. After capturing an application, follow up with track_application to set the application stage.",
                input_schema=obj_schema(
                    {"url": str_prop("The job posting or company URL the user pasted.")}, "url"
                ),
            ),
            _tool_capture_link,
        ),
        (
            ToolDef(
                name="track_application",
                description="Update a posting's application-tracking fields. Call this when the user reports applying or advancing a stage (heard back / screening / interview / offer / rejected). Passing `stage` sets the posting's current application stage. Only the fields you pass are changed; omit the rest. Get the posting_id from capture_link or search.",
                input_schema=obj_schema(
                    {
                        "posting_id": str_prop("The posting id (from capture_link or search)."),
                        "stage": str_prop(
                            'The current application stage (e.g. applied, screening, interview, offer, rejected — whatever stage the user names). Set "" to clear it.'
                        ),
                        "notes": str_prop("Free-form note on this posting."),
                    },
                    "posting_id",
                ),
            ),
            _tool_track_application,
        ),
        (
            ToolDef(
                name="search",
                description="Search scout's saved companies and job postings by name/title. Call this to check whether something is already tracked (\"did I already add Ramp?\") or to find an entity's id before reading or updating it. Returns matching companies and postings with their ids and verdicts.",
                input_schema=obj_schema(
                    {
                        "query": str_prop(
                            "Case-insensitive substring to match against company names and posting titles."
                        )
                    },
                    "query",
                ),
            ),
            _tool_search,
        ),
        (
            ToolDef(
                name="get_company",
                description="Fetch a company's full detail: facts, verdict + reasoning, enriched website summary, notes, and its postings. Call this to answer questions about a specific saved company.",
                input_schema=obj_schema(
                    {"company_id": str_prop("The company id (from search or capture_link).")},
                    "company_id",
                ),
            ),
            _tool_get_company,
        ),
        (
            ToolDef(
                name="get_posting",
                description="Fetch one job posting's detail: title, location, comp, full description, and its tracking state. Call this to answer questions about a specific role.",
                input_schema=obj_schema(
                    {"posting_id": str_prop("The posting id (from search or capture_link).")},
                    "posting_id",
                ),
            ),
            _tool_get_posting,
        ),
        (
            ToolDef(
                name="set_notes",
                description="Replace a company's free-form notes (a human scratchpad). Call this when the user asks you to jot something down about a company. This overwrites existing notes — read them with get_company first if you mean to append.",
                input_schema=obj_schema(
                    {
                        "company_id": str_prop("The company id."),
                        "notes": str_prop("The note text to store (replaces existing notes)."),
                    },
                    "company_id",
                    "notes",
                ),
            ),
            _tool_set_notes,
        ),
        (
            ToolDef(
                name="set_verdict",
                description="Hand-set a company's fit verdict (yes/maybe/no) with a reason. Call this only when the user explicitly asks you to mark or override a verdict. It is recorded as a sticky manual override.",
                input_schema=obj_schema(
                    {
                        "company_id": str_prop("The company id."),
                        "verdict": enum_prop("The fit verdict.", "yes", "maybe", "no"),
                        "reason": str_prop("Short reason for the verdict."),
                    },
                    "company_id",
                    "verdict",
                ),
            ),
            _tool_set_verdict,
        ),
    ]

    e.tools = {}
    e.tool_wire = []
    for d, impl in defs:
        e.tools[d.name] = functools.partial(impl, e)
        e.tool_wire.append(d)
    # The hosted web_search server tool — the API executes it; no client impl.
    e.tool_wire.append(new_web_search_tool(5))


# --- tool implementations -------------------------------------------------


def _tool_capture_link(e, inp: dict) -> str:
    url = inp.get("url") or ""
    if url.strip() == "":
        raise ValueError("url is required")
    try:
        res = e.capturer.run(capture.Request(url=url))
    except capture.FetchError as fe:
        raise RuntimeError(f"could not fetch the page (status {fe.status}) — nothing was added")
    out = {
        "kind": res.kind,
        "fetch_status": res.fetch_status,
        "company_id": res.company_id,
        "company_name": res.company_name,
        "company_created": res.company_created,
        "note": res.note,
    }
    if res.posting is not None:
        out["posting_id"] = res.posting.id
        out["posting_title"] = res.posting.title
        out["posting_updated"] = res.posting_updated
    return json_string(out)


def _tool_track_application(e, inp: dict) -> str:
    posting_id = inp.get("posting_id") or ""
    if posting_id.strip() == "":
        raise ValueError("posting_id is required")
    # Read current state so omitted fields are preserved (the store update is
    # full-state; we overlay only what the model passed).
    cur = postings.get_posting(e.con, posting_id)
    if cur is None:
        raise RuntimeError(f'no posting with id "{posting_id}" (use search to find it)')
    t = PostingTracking(
        application_status=cur.application_status,
        outreach_status=cur.outreach_status,
        notes=cur.notes,
    )
    if inp.get("stage") is not None:
        t.application_status = inp["stage"].strip()
    if inp.get("notes") is not None:
        t.notes = inp["notes"]
    try:
        p = postings.update_posting_tracking(e.con, posting_id, t)
    except errors.NotFound:
        raise RuntimeError(f'no posting with id "{posting_id}"')
    # Validation errors (ValueError) surface to the model unchanged.
    return json_string(
        {
            "posting_id": p.id,
            "title": p.title,
            "stage": p.application_status,
            "outreach_count": p.outreach_count,
            "last_outreach": p.last_outreach_at,
        }
    )


def _tool_search(e, inp: dict) -> str:
    q = (inp.get("query") or "").strip().lower()
    if q == "":
        raise ValueError("query is required")

    max_hits = 20
    companies_out: list[dict] = []
    for r in triage.triage_rows(e.con):
        if len(companies_out) >= max_hits:
            break
        if q in r.name.lower() or (r.domain != "" and q in r.domain.lower()):
            companies_out.append(
                {
                    "company_id": r.company_id,
                    "name": r.name,
                    "domain": r.domain,
                    "verdict": r.verdict,
                    "location": r.location,
                }
            )

    postings_out: list[dict] = []
    for j in postings.list_job_rows(e.con):
        if len(postings_out) >= max_hits:
            break
        if q in j.title.lower() or q in j.company.lower():
            postings_out.append(
                {
                    "posting_id": j.posting_id,
                    "company_id": j.company_id,
                    "company": j.company,
                    "title": j.title,
                    "stage": j.application_status,
                }
            )

    return json_string({"companies": companies_out, "postings": postings_out})


def _tool_get_company(e, inp: dict) -> str:
    d = detail.get_company_detail(e.con, (inp.get("company_id") or "").strip())
    if d is None:
        raise RuntimeError(
            f'no company with id "{inp.get("company_id") or ""}" (use search to find it)'
        )
    postings_out = [
        {"posting_id": p.id, "title": p.title, "url": p.url, "stage": p.application_status}
        for p in d.postings
    ]
    return json_string(
        {
            "company_id": d.company_id,
            "name": d.name,
            "domain": d.domain,
            "location": d.location,
            "vertical": d.vertical,
            "headcount": d.headcount,
            "funding_stage": d.funding_stage,
            "verdict": d.verdict,
            "reason": d.reason,
            "website_summary": d.website_summary,
            "notes": d.notes,
            "postings": postings_out,
        }
    )


def _tool_get_posting(e, inp: dict) -> str:
    p = postings.get_posting(e.con, (inp.get("posting_id") or "").strip())
    if p is None:
        raise RuntimeError(f'no posting with id "{inp.get("posting_id") or ""}"')
    try:
        name, _ = detail.get_company_name(e.con, p.company_id)
    except errors.NotFound:
        name = ""
    return json_string(
        {
            "posting_id": p.id,
            "company_id": p.company_id,
            "company": name,
            "title": p.title,
            "url": p.url,
            "location": p.location,
            "employment_type": p.employment_type,
            "workplace_type": p.workplace_type,
            "department": p.department,
            "comp_range": p.comp_range,
            "description": p.description,
            "stage": p.application_status,
            "outreach_count": p.outreach_count,
            "notes": p.notes,
        }
    )


def _tool_set_notes(e, inp: dict) -> str:
    company_id = inp.get("company_id") or ""
    if company_id.strip() == "":
        raise ValueError("company_id is required")
    try:
        companies.update_company_notes(e.con, company_id, (inp.get("notes") or "").strip())
    except errors.NotFound:
        raise RuntimeError(f'no company with id "{company_id}"')
    return json_string({"company_id": company_id, "saved": True})


def _tool_set_verdict(e, inp: dict) -> str:
    company_id = inp.get("company_id") or ""
    v = (inp.get("verdict") or "").strip().lower()
    if v not in ("yes", "maybe", "no"):
        raise ValueError("verdict must be yes, maybe, or no")
    # Reject an unknown company up front so a bad id can't create a dangling verdict.
    try:
        detail.get_company_name(e.con, company_id)
    except errors.NotFound:
        raise RuntimeError(f'no company with id "{company_id}"')
    verdicts.upsert_verdict(
        e.con,
        Verdict(
            company_id=company_id,
            verdict=v,
            reason=(inp.get("reason") or "").strip(),
            model=MANUAL_MODEL,  # sticky manual override (a verdict run won't overwrite)
        ),
    )
    return json_string({"company_id": company_id, "verdict": v})


# --- schema + result helpers ----------------------------------------------


def obj_schema(props: dict, *required: str) -> dict:
    s: dict = {"type": "object", "properties": props}
    if required:
        s["required"] = list(required)
    return s


def str_prop(desc: str) -> dict:
    return {"type": "string", "description": desc}


def enum_prop(desc: str, *values: str) -> dict:
    return {"type": "string", "description": desc, "enum": list(values)}


def json_string(v) -> str:
    """Marshal a tool result to a compact JSON string for the model, with sorted
    keys so the output is stable across calls."""
    return json.dumps(v, separators=(",", ":"), sort_keys=True)


def tool_result(tool_use_id: str, content: str, is_err: bool) -> dict:
    """Build a tool_result content block for the next user turn."""
    b: dict = {"type": "tool_result", "tool_use_id": tool_use_id, "content": content}
    if is_err:
        b["is_error"] = True
    return b
