"""ATS resolvers: the no-LLM capture path. Port of internal/capture/ats.go.

Ashby, Greenhouse, Lever, Rippling and Dover all publish their job boards as
public JSON APIs, so a posting link on one of those hosts resolves to exact
structured fields with one unauthenticated GET — no page fetch, no model call.
Links the resolvers don't recognize (or that fail to resolve) fall through to
the generic fetch + Haiku path in `Capturer.run`.
"""
from __future__ import annotations

import html
import re
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

# Test seams: the resolvers hit these bases so tests can point them at a local
# server. Greenhouse and Lever run separate EU instances with their own API
# hosts; the posting URL's host picks the base.
ashby_api_base = "https://api.ashbyhq.com"
ashby_board_base = "https://jobs.ashbyhq.com"  # board page host — carries the org's display name
greenhouse_api_base = "https://boards-api.greenhouse.io"
greenhouse_eu_api_base = "https://boards-api.eu.greenhouse.io"
lever_api_base = "https://api.lever.co"
lever_eu_api_base = "https://api.eu.lever.co"
rippling_api_base = "https://api.rippling.com"
# Dover's apply portal and its public API share one origin.
dover_api_base = "https://app.dover.com"

ATS_CALL_TIMEOUT = 15.0  # seconds
ATS_MAX_BODY = 8 << 20  # a whole Ashby board rides one response; cap it
# desc_cap_runes bounds the stored description — postings run a few KB, anything
# past this is boilerplate.
DESC_CAP_RUNES = 12000

_re_uuid = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class ATSError(Exception):
    """A resolver couldn't fetch or read the platform API."""


@dataclass
class ATSJob:
    """A posting as the platform's own API states it. company_name is the board's
    name when the API provides one (Greenhouse/Rippling/Dover) and a slug-derived
    fallback otherwise — user-typed input still wins over both."""

    ats: str = ""  # "ashby" | "greenhouse" | "lever" | "rippling" | "dover"
    url: str = ""  # canonical posting URL
    company_name: str = ""
    title: str = ""
    location: str = ""
    department: str = ""
    employment_type: str = ""
    workplace_type: str = ""
    comp_range: str = ""
    posted_at: str = ""  # "YYYY-MM-DD"
    description: str = ""  # plain text


@dataclass
class ATSTarget:
    """A recognized ATS posting URL, routed: which platform, which regional API
    base, and the org/job identifiers the resolver needs."""

    ats: str = ""
    base: str = ""
    org: str = ""
    id: str = ""


def ats_target_for(raw_url: str) -> ATSTarget | None:
    """Recognize a job-posting URL on a supported ATS host — pure URL-shape
    parsing, no network. None means the link doesn't route to a resolver."""
    try:
        u = urllib.parse.urlparse(raw_url.strip())
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    segs = [s for s in u.path.split("/") if s]

    if host == "jobs.ashbyhq.com":
        if len(segs) >= 2 and _re_uuid.match(segs[1]):
            return ATSTarget("ashby", ashby_api_base, segs[0], segs[1])
    elif host == "ats.rippling.com":
        # ats.rippling.com/{org}/jobs/{uuid}
        if len(segs) >= 3 and segs[1] == "jobs" and _re_uuid.match(segs[2]):
            return ATSTarget("rippling", rippling_api_base, segs[0], segs[2])
    elif host == "app.dover.com":
        # app.dover.com/apply/{org}/{uuid}
        if len(segs) >= 3 and segs[0] == "apply" and _re_uuid.match(segs[2]):
            return ATSTarget("dover", dover_api_base, segs[1], segs[2])
    elif host in ("jobs.lever.co", "jobs.eu.lever.co"):
        if len(segs) >= 2 and _re_uuid.match(segs[1]):
            base = lever_eu_api_base if host == "jobs.eu.lever.co" else lever_api_base
            return ATSTarget("lever", base, segs[0], segs[1])
    elif host in (
        "boards.greenhouse.io", "job-boards.greenhouse.io",
        "boards.eu.greenhouse.io", "job-boards.eu.greenhouse.io",
    ):
        org, jid = greenhouse_org_job(segs, urllib.parse.parse_qs(u.query))
        if org != "":
            base = greenhouse_eu_api_base if ".eu." in host else greenhouse_api_base
            return ATSTarget("greenhouse", base, org, jid)
    return None


def is_ats_posting(raw_url: str) -> bool:
    """Whether a pasted link is a posting on a supported ATS — i.e. capture can
    resolve it through the platform's API with no LLM call. URL-shape only."""
    return ats_target_for(raw_url) is not None


def resolve_ats(httpc: httpx.Client, raw_url: str) -> ATSJob | None:
    """Recognize a job-posting URL on a supported ATS host and resolve it through
    that platform's public API. None means "not this path" — an unrecognized
    link, a board index, or a resolve failure — so the caller falls through to the
    generic fetch + LLM capture."""
    t = ats_target_for(raw_url)
    if t is None:
        return None
    try:
        if t.ats == "ashby":
            job = resolve_ashby(httpc, t.base, t.org, t.id)
        elif t.ats == "greenhouse":
            job = resolve_greenhouse(httpc, t.base, t.org, t.id)
        elif t.ats == "lever":
            job = resolve_lever(httpc, t.base, t.org, t.id)
        elif t.ats == "rippling":
            job = resolve_rippling(httpc, t.base, t.org, t.id)
        elif t.ats == "dover":
            job = resolve_dover(httpc, t.base, t.org, t.id)
        else:
            return None
    except Exception:
        return None  # resolve failed — the generic capture path still applies
    if job.url == "":
        job.url = raw_url.strip()
    job.description = trunc_runes(job.description, DESC_CAP_RUNES)
    return job


def greenhouse_org_job(segs: list[str], q: dict) -> tuple[str, str]:
    """Pull the board slug and numeric job id out of the two URL shapes Greenhouse
    serves: /{org}/jobs/{id} on the board hosts, and the embed form
    /embed/job_app?for={org}&token={id}."""
    def is_num(s: str) -> bool:
        return s != "" and s.isascii() and s.isdigit()

    if len(segs) >= 3 and segs[1] == "jobs" and is_num(segs[2]):
        return segs[0], segs[2]
    if len(segs) >= 2 and segs[0] == "embed" and segs[1] == "job_app":
        forv = (q.get("for") or [""])[0]
        token = (q.get("token") or [""])[0]
        if forv != "" and is_num(token):
            return forv, token
    return "", ""


# --- Ashby -----------------------------------------------------------------

def resolve_ashby(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> ATSJob:
    """Read the org's whole public board (Ashby has no per-posting endpoint) and
    pick the pasted job out of it."""
    url = api_base + "/posting-api/job-board/" + urllib.parse.quote(org, safe="") + "?includeCompensation=true"
    board = fetch_ats_json(httpc, url)
    for j in board.get("jobs") or []:
        if (j.get("id", "") or "").lower() != job_id.lower():
            continue
        workplace = {"OnSite": "On-site"}.get(j.get("workplaceType", ""), j.get("workplaceType", "") or "")
        if workplace == "" and j.get("isRemote"):
            workplace = "Remote"
        comp = j.get("compensation") or {}
        comp_range = comp.get("scrapeableCompensationSalarySummary", "") or ""
        if comp_range == "":
            comp_range = comp.get("compensationTierSummary", "") or ""
        dept = j.get("department", "") or ""
        if dept == "":
            dept = j.get("team", "") or ""
        # The posting API states no company name. A hyphen/underscore slug
        # de-slugs cleanly; a run-together slug doesn't, so read the real name
        # off the public board page's title. Best-effort.
        name = slug_name(org)
        if "-" not in org and "_" not in org:
            n = fetch_board_name(httpc, ashby_board_base + "/" + urllib.parse.quote(org, safe=""))
            if n:
                name = n
        return ATSJob(
            ats="ashby",
            url=j.get("jobUrl", "") or "",
            company_name=name,
            title=j.get("title", "") or "",
            location=j.get("location", "") or "",
            department=dept,
            employment_type=employment_label(j.get("employmentType", "") or ""),
            workplace_type=workplace,
            comp_range=comp_range,
            posted_at=iso_date(j.get("publishedAt", "") or ""),
            description=(j.get("descriptionPlain", "") or "").strip(),
        )
    raise ATSError(f"job {job_id} not on the {org} board")


# --- Greenhouse --------------------------------------------------------------

def resolve_greenhouse(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> ATSJob:
    base = api_base + "/v1/boards/" + urllib.parse.quote(org, safe="")
    j = fetch_ats_json(httpc, base + "/jobs/" + urllib.parse.quote(job_id, safe=""))

    # The board endpoint states the company's display name; the slug fallback
    # covers a failed lookup.
    name = slug_name(org)
    try:
        board = fetch_ats_json(httpc, base)
        bn = (board.get("name", "") or "").strip()
        if bn != "":
            name = bn
    except Exception:
        pass

    dept = ""
    for d in j.get("departments") or []:
        s = (d.get("name", "") or "").strip()
        if s != "" and s.lower() != "no department":
            dept = s
            break
    comp = ""
    ranges = j.get("pay_input_ranges") or []
    if ranges:
        r = ranges[0]
        comp = money_range(
            (r.get("min_cents", 0) or 0) / 100, (r.get("max_cents", 0) or 0) / 100,
            r.get("currency_type", "") or "", "year",
        )
        if len(ranges) > 1:
            comp += " +"  # geo tiers beyond the first
    loc = (j.get("location") or {}).get("name", "") or ""
    return ATSJob(
        ats="greenhouse",
        url=j.get("absolute_url", "") or "",
        company_name=name,
        title=j.get("title", "") or "",
        location=loc,
        department=dept,
        comp_range=comp,
        posted_at=iso_date(j.get("first_published", "") or ""),
        description=strip_html(html.unescape(j.get("content", "") or "")),
    )


# --- Lever -------------------------------------------------------------------

def resolve_lever(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> ATSJob:
    url = api_base + "/v0/postings/" + urllib.parse.quote(org, safe="") + "/" + urllib.parse.quote(job_id, safe="")
    j = fetch_ats_json(httpc, url)

    # Lever splits the posting into a lead paragraph plus titled lists — stitch
    # them back together.
    desc = (j.get("descriptionPlain", "") or "").strip()
    for ls in j.get("lists") or []:
        section = strip_html(ls.get("text", "") or "").strip()
        body = strip_html(ls.get("content", "") or "")
        if body == "":
            continue
        if section != "":
            desc += "\n\n" + section + "\n" + body
        else:
            desc += "\n\n" + body

    wt = (j.get("workplaceType", "") or "").lower()
    workplace = {"remote": "Remote", "hybrid": "Hybrid", "on-site": "On-site", "onsite": "On-site"}.get(wt, "")
    created = j.get("createdAt", 0) or 0
    posted = ""
    if created > 0:
        posted = datetime.fromtimestamp(created / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    cats = j.get("categories") or {}
    dept = cats.get("department", "") or ""
    if dept == "":
        dept = cats.get("team", "") or ""
    sal = j.get("salaryRange") or {}
    return ATSJob(
        ats="lever",
        url=j.get("hostedUrl", "") or "",
        company_name=slug_name(org),
        title=j.get("text", "") or "",
        location=cats.get("location", "") or "",
        department=dept,
        employment_type=cats.get("commitment", "") or "",
        workplace_type=workplace,
        comp_range=money_range(sal.get("min", 0) or 0, sal.get("max", 0) or 0, sal.get("currency", "") or "", sal.get("interval", "") or ""),
        posted_at=posted,
        description=desc.strip(),
    )


# --- Rippling ----------------------------------------------------------------

def resolve_rippling(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> ATSJob:
    url = api_base + "/platform/api/ats/v1/board/" + urllib.parse.quote(org, safe="") + "/jobs/" + urllib.parse.quote(job_id, safe="")
    j = fetch_ats_json(httpc, url)

    name = (j.get("companyName", "") or "").strip()
    if name == "":
        name = slug_name(org)
    desc_obj = j.get("description") or {}
    desc = strip_html(desc_obj.get("company", "") or "")
    role = strip_html(desc_obj.get("role", "") or "")
    if role != "":
        desc = desc + "\n\n" + role if desc != "" else role
    comp = ""
    pr = j.get("payRangeDetails") or []
    if pr:
        p = pr[0]
        comp = money_range(p.get("rangeStart", 0) or 0, p.get("rangeEnd", 0) or 0, p.get("currency", "") or "", p.get("frequency", "") or "")
        if len(pr) > 1:
            comp += " +"  # geo tiers beyond the first
    return ATSJob(
        ats="rippling",
        url=j.get("url", "") or "",
        company_name=name,
        title=j.get("name", "") or "",
        location="; ".join(j.get("workLocations") or []),
        department=((j.get("department") or {}).get("name", "") or "").strip(),
        employment_type=((j.get("employmentType") or {}).get("id", "") or "").strip(),
        comp_range=comp,
        posted_at=iso_date(j.get("createdOn", "") or ""),
        description=desc.strip(),
    )


# --- Dover -------------------------------------------------------------------

def resolve_dover(httpc: httpx.Client, api_base: str, org: str, job_id: str) -> ATSJob:
    url = api_base + "/api/v1/inbound/application-portal-job/" + urllib.parse.quote(job_id, safe="")
    j = fetch_ats_json(httpc, url)

    locs: list[str] = []
    workplaces: list[str] = []
    seen_wp: set[str] = set()
    for ls in j.get("locations") or []:
        n = (ls.get("name", "") or "").strip()
        if n != "":
            locs.append(n)
        wp = {"IN_OFFICE": "On-site", "REMOTE": "Remote", "HYBRID": "Hybrid"}.get(ls.get("location_type", ""), "")
        if wp != "" and wp not in seen_wp:
            seen_wp.add(wp)
            workplaces.append(wp)
    location = "; ".join(locs)
    if location == "":
        loc_field = j.get("location")
        location = loc_field.strip() if isinstance(loc_field, str) else ""

    name = (j.get("client_name", "") or "").strip()
    if name == "":
        name = slug_name(org)
    comp = j.get("compensation") or {}
    return ATSJob(
        ats="dover",
        url=api_base + "/apply/" + urllib.parse.quote(org, safe="") + "/" + job_id,
        company_name=name,
        title=(j.get("title", "") or "").strip(),
        location=location,
        employment_type=dover_employment_label(comp.get("employment_type", "") or ""),
        workplace_type=" / ".join(workplaces),
        comp_range=money_range(comp.get("lower_bound", 0) or 0, comp.get("upper_bound", 0) or 0, comp.get("currency_code", "") or "", comp.get("salary_range_type", "") or ""),
        posted_at=iso_date(j.get("created", "") or ""),
        description=strip_html(j.get("user_provided_description", "") or ""),
    )


def dover_employment_label(s: str) -> str:
    """Map Dover's SCREAMING_SNAKE employment enum to the human label; unknown
    values pass through as-is."""
    return {
        "FULL_TIME": "Full-time", "PART_TIME": "Part-time", "INTERN": "Internship",
        "INTERNSHIP": "Internship", "CONTRACT": "Contract", "TEMPORARY": "Temporary",
    }.get(s, s)


# --- shared helpers ----------------------------------------------------------

def fetch_ats_json(httpc: httpx.Client, url: str) -> dict:
    """GET url and decode the JSON reply; raise ATSError on a non-200."""
    resp = httpc.get(url, headers={"Accept": "application/json"}, timeout=ATS_CALL_TIMEOUT)
    if resp.status_code != 200:
        raise ATSError(f"http {resp.status_code}")
    return resp.json()


# Board-page title parsing: ATS boards title their index "{Company} Jobs", so the
# company name is recoverable even when the posting API omits it.
_re_board_og_title = re.compile(r"<meta[^>]+og:title[^>]+content=[\"']([^\"']*)[\"']", re.I | re.S)
_re_board_title = re.compile(r"<title[^>]*>([^<]*)</title>", re.I | re.S)
_re_board_suffix = re.compile(r"\s*[-–|·:]?\s*(jobs|careers|open roles|openings|job board)\s*$", re.I)


def fetch_board_name(httpc: httpx.Client, page_url: str) -> str:
    """Read an ATS board page's company display name from its og:title (or
    <title>): "Chai Discovery Jobs" → "Chai Discovery". Best-effort — "" on any
    fetch/parse failure, so the caller keeps its slug fallback."""
    try:
        resp = httpc.get(page_url, headers={"User-Agent": "Mozilla/5.0 (scout)"}, timeout=ATS_CALL_TIMEOUT)
    except httpx.HTTPError:
        return ""
    if resp.status_code != 200:
        return ""
    body = resp.text[:64 << 10]

    def name(rex: re.Pattern) -> str:
        m = rex.search(body)
        if m is None:
            return ""
        s = html.unescape(m.group(1)).strip()
        return _re_board_suffix.sub("", s).strip()

    n = name(_re_board_og_title)
    if n != "":
        return n
    return name(_re_board_title)


def slug_name(slug: str) -> str:
    """Turn a board slug into a readable company-name fallback: "foresight-health"
    → "Foresight Health". Only a fallback — a user-typed or API-stated name wins."""
    words = [w for w in re.split(r"[-_]", slug) if w != ""]
    return " ".join(w[:1].upper() + w[1:] for w in words)


def employment_label(s: str) -> str:
    """Map Ashby's camel-case enum to the human label; unknown values pass
    through as-is."""
    return {"FullTime": "Full-time", "PartTime": "Part-time", "Intern": "Internship"}.get(s, s)


def iso_date(s: str) -> str:
    """Keep the date out of an ISO timestamp, "" when it isn't one."""
    if len(s) < 10:
        return ""
    head = s[:10]
    try:
        datetime.strptime(head, "%Y-%m-%d")
    except ValueError:
        return ""
    return head


def _fmt_num(n: float) -> str:
    """Go's strconv.FormatFloat(n, 'f', -1, 64): shortest non-exponential form."""
    if n == int(n):
        return str(int(n))
    return repr(n)


def money_range(lo: float, hi: float, currency: str, interval: str) -> str:
    """Render a salary range the way a posting prints it: "$130K – $170K / year".
    Zero bounds mean "not published" → ""."""
    if lo <= 0 and hi <= 0:
        return ""
    cur = currency.strip().upper()
    sym = {"USD": "$", "EUR": "€", "GBP": "£"}.get(cur, "")
    suffix = ""
    if sym == "" and currency.strip() != "":
        suffix = " " + currency.strip().upper()

    def amt(n: float) -> str:
        if n >= 1000 and n % 100 == 0:
            return sym + _fmt_num(n / 1000) + "K"
        return sym + _fmt_num(n)

    if lo > 0 and hi > 0 and lo != hi:
        out = amt(lo) + " – " + amt(hi)
    elif hi > 0:
        out = amt(hi)
    else:
        out = amt(lo)
    out += suffix
    il = interval.lower()
    if "year" in il:
        out += " / year"
    elif "month" in il:
        out += " / month"
    elif "hour" in il:
        out += " / hour"
    return out


# stripHTML flattens posting HTML to readable plain text.
_re_list_item = re.compile(r"<li[^>]*>", re.I)
# </li> is absent: the <li> opener already starts the line.
_re_break_tags = re.compile(r"<(?:br\s*/?|/p|/div|/h[1-6]|/ul|/ol|/tr)>", re.I)
_re_any_tag = re.compile(r"<[^>]*>")
_re_blank_runs = re.compile(r"\n{3,}")


def strip_html(s: str) -> str:
    s = _re_list_item.sub("\n- ", s)
    s = _re_break_tags.sub("\n", s)
    s = _re_any_tag.sub(" ", s)
    s = html.unescape(s)
    lines = [" ".join(ln.split()) for ln in s.split("\n")]
    s = "\n".join(lines)
    s = _re_blank_runs.sub("\n\n", s)
    return s.strip()


def trunc_runes(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[:n] + "…"
