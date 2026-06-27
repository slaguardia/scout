"""The link-capture flow's company resolution."""

from __future__ import annotations

import json
from dataclasses import dataclass

from scout.store import companies
from scout.store.companies import Company

from .csv import _null_str, identity_domain, null_headcount, upsert_with_merge


@dataclass
class CapturedCompany:
    """A company identified by the link-capture agent pass. domain may be empty
    (an ATS-hosted posting that never names the company's own site) — the row is
    then keyed by name and folds into a domain-bearing twin if one ever arrives.
    headcount/funding_stage carry user-typed values from the Add dialog (never
    extracted from a page)."""

    name: str = ""
    domain: str = ""  # already a bare host or ""; re-checked via identity_domain
    location: str = ""
    vertical: str = ""
    source_url: str = ""  # the captured page, kept in raw_json as provenance
    headcount: str = ""
    funding_stage: str = ""


def ensure_company(con, c: CapturedCompany) -> tuple[str, bool]:
    """Resolve a captured company to a stored row, creating one only when it isn't
    already in the list. Unlike add_manual it treats an existing row as success
    and tolerates a missing domain; existing rows are never overwritten. New rows
    go through the shared merge path so name/domain twins fold as CSV rows do.
    Returns (row id, whether a new company row was created). The validation error
    is prefixed "company " for the web layer."""
    domain = identity_domain(c.domain)
    name = c.name.strip() or domain
    if name == "":
        raise ValueError("company name or domain required")

    # Identity check first: an existing row under this identity wins untouched.
    cid = companies.company_id(domain, name)
    if companies.company_exists(con, cid):
        return cid, False

    # raw_json mirrors the captured fields plus the page the capture came from.
    raw = {"name": name}
    for k, v in {
        "website": domain,
        "location": c.location,
        "vertical": c.vertical,
        "captured_from": c.source_url,
        "headcount": c.headcount,
        "funding_stage": c.funding_stage,
    }.items():
        s = v.strip()
        if s != "":
            raw[k] = s

    company = Company(
        source="capture",
        name=name,
        domain=_null_str(domain),
        headcount=null_headcount(c.headcount),
        funding_stage=_null_str(c.funding_stage.strip()),
        location=_null_str(c.location.strip()),
        vertical=_null_str(c.vertical.strip()),
        raw_json=json.dumps(raw, sort_keys=True, ensure_ascii=False),
    )
    # The shared merge path handles both twin directions. merged=True means the
    # company already existed in some form.
    out = upsert_with_merge(con, company)
    return out.id, not out.merged
