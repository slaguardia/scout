"""JSON-LD JobPosting resolver: the keyless middle of the generic capture path.

Most job pages embed a schema.org JobPosting as a <script
type="application/ld+json"> blob (Google for Jobs requires it), so a posting on a
company careers page or a server-rendered board resolves to exact structured
fields with no LLM call. Everything here is best-effort: a missing, malformed, or
oddly-typed field stays empty, and a page with no usable JobPosting falls through
to Haiku.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass

from .ats import DESC_CAP_RUNES, iso_date, money_range, strip_html, trunc_runes


@dataclass
class JobPostingLD:
    """A schema.org JobPosting reduced to the fields a posting (and its company)
    need. company_url is the hiring org's own site (sameAs/url), used to resolve a
    real identity domain — unlike an ATS host, a careers page knows it."""

    title: str = ""
    description: str = ""
    location: str = ""
    employment_type: str = ""
    workplace_type: str = ""
    comp_range: str = ""
    posted_at: str = ""
    company_name: str = ""
    company_url: str = ""


# Matches each <script type="application/ld+json"> block, capturing its JSON body.
_re_ld_script = re.compile(
    r"<script[^>]*\btype\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.I | re.S,
)


def parse_job_posting_ld(body: str | bytes | None) -> JobPostingLD | None:
    """Scan a page's JSON-LD blocks for a schema.org JobPosting and map the first
    usable one (one with at least a title). None when none is present."""
    if body is None:
        return None
    if isinstance(body, bytes):
        body = body.decode("utf-8", "replace")
    for m in _re_ld_script.finditer(body):
        try:
            v = json.loads(m.group(1).strip())
        except (ValueError, json.JSONDecodeError):
            continue
        node = _find_job_posting_node(v)
        if node is None:
            continue
        jp = _map_job_posting_ld(node)
        if jp is not None:
            return jp
    return None


def _find_job_posting_node(v):
    """Locate the JobPosting object in a decoded JSON-LD value: the top-level
    object, an element of a top-level array, or a member of an @graph."""
    if isinstance(v, dict):
        if _ld_type_is(v.get("@type"), "JobPosting"):
            return v
        if "@graph" in v:
            return _find_job_posting_node(v["@graph"])
        return None
    if isinstance(v, list):
        for e in v:
            n = _find_job_posting_node(e)
            if n is not None:
                return n
    return None


def _ld_type_is(x, want: str) -> bool:
    """Whether a JSON-LD @type (a string or an array of strings) names the wanted
    type."""
    if isinstance(x, str):
        return x.lower() == want.lower()
    if isinstance(x, list):
        for e in x:
            if isinstance(e, str) and e.lower() == want.lower():
                return True
    return False


def _map_job_posting_ld(m: dict) -> JobPostingLD | None:
    title = _ld_str(m.get("title")).strip()
    if title == "":
        return None  # a JobPosting with no title isn't worth a write
    jp = JobPostingLD(
        title=title,
        description=trunc_runes(
            strip_html(html.unescape(_ld_str(m.get("description")))), DESC_CAP_RUNES
        ),
        employment_type=_ld_employment_label(_ld_str(m.get("employmentType"))),
        posted_at=iso_date(_ld_str(m.get("datePosted"))),
        location=_ld_job_location(m.get("jobLocation")),
        comp_range=_ld_base_salary(m.get("baseSalary")),
    )
    if _ld_str_or_name(m.get("jobLocationType")) == "TELECOMMUTE":
        jp.workplace_type = "Remote"
        if jp.location == "":
            jp.location = _ld_str_or_name(_ld_object(m.get("applicantLocationRequirements")))
    org = _ld_object(m.get("hiringOrganization"))
    if org is not None:
        jp.company_name = _ld_str(org.get("name")).strip()
        jp.company_url = _ld_str(org.get("sameAs")).strip()
        if jp.company_url == "":
            jp.company_url = _ld_str(org.get("url")).strip()
    return jp


def _ld_job_location(x) -> str:
    """Flatten a Place (or the first of several) into "Locality, Region,
    Country". address may itself be a string."""
    place = _ld_object(x)
    if place is None:
        return ""
    addr = _ld_object(place.get("address"))
    if addr is None:
        return _ld_str(place.get("address")).strip()
    parts = []
    for k in ("addressLocality", "addressRegion", "addressCountry"):
        s = _ld_str_or_name(addr.get(k))
        if s != "":
            parts.append(s)
    return ", ".join(parts)


def _ld_base_salary(x) -> str:
    """Render a MonetaryAmount → "$130K – $170K / year". A flat value prints as a
    single figure; unitText drives the interval."""
    sal = _ld_object(x)
    if sal is None:
        return ""
    currency = _ld_str_or_name(sal.get("currency")).strip()
    val = _ld_object(sal.get("value"))
    if val is None:
        n = _ld_float(sal.get("value"))
        if n > 0:
            return money_range(n, n, currency, "")
        return ""
    lo, hi = _ld_float(val.get("minValue")), _ld_float(val.get("maxValue"))
    if lo == 0 and hi == 0:
        v = _ld_float(val.get("value"))
        lo, hi = v, v
    return money_range(lo, hi, currency, _ld_str(val.get("unitText")))


def _ld_employment_label(s: str) -> str:
    """Map schema.org's employmentType enum to the human label; unknown values
    pass through trimmed."""
    return {
        "FULL_TIME": "Full-time",
        "FULLTIME": "Full-time",
        "PART_TIME": "Part-time",
        "PARTTIME": "Part-time",
        "CONTRACTOR": "Contract",
        "CONTRACT": "Contract",
        "TEMPORARY": "Temporary",
        "INTERN": "Internship",
        "INTERNSHIP": "Internship",
    }.get(s.strip().upper(), s.strip())


# --- JSON-LD value coercion (schema.org fields are polymorphic) --------------


def _ld_str(x) -> str:
    """Read a scalar string out of a JSON-LD value that may be a string, the first
    usable element of an array, or a number."""
    if isinstance(x, bool):
        return ""
    if isinstance(x, str):
        return x
    if isinstance(x, (int, float)):
        return _fmt_num(float(x))
    if isinstance(x, list):
        for e in x:
            s = _ld_str(e)
            if s != "":
                return s
    return ""


def _ld_str_or_name(x) -> str:
    """Read a value that's either a scalar or an object with a "name"."""
    s = _ld_str(x).strip()
    if s != "":
        return s
    o = _ld_object(x)
    if o is not None:
        return _ld_str(o.get("name")).strip()
    return ""


def _ld_object(x):
    """Return x as an object, or the first object in an array."""
    if isinstance(x, dict):
        return x
    if isinstance(x, list):
        for e in x:
            if isinstance(e, dict):
                return e
    return None


def _ld_float(x) -> float:
    """Read a number out of a JSON-LD value (a JSON number, or a numeric string)."""
    if isinstance(x, bool):
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        try:
            return float(x.strip())
        except ValueError:
            return 0.0
    return 0.0


def _fmt_num(n: float) -> str:
    if n == int(n):
        return str(int(n))
    return repr(n)
