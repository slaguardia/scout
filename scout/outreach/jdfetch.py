"""Deterministic job-description pre-fetch. Port of internal/outreach/jdfetch.go.

Prefers the ATS JSON APIs (Ashby / Greenhouse / Lever) and falls back to a plain
browser-UA GET with crude tag stripping. A failed fetch is not an error — the
engine passes the Status to the researcher and carries on with fewer hooks.
Transport is httpx (the project standard) in place of Go's net/http.
"""
from __future__ import annotations

import json
import re
import urllib.parse
from dataclasses import dataclass

import httpx

# jdMaxChars caps the JD text handed to the researcher: enough to carry the
# distinctive lines, small enough to keep the prompt cheap.
JD_MAX_CHARS = 20000

# browserUA spoofs a real browser so ATS HTML pages that block scripted clients
# still return the posting. The JD fetch is best-effort, so a failure just yields
# the researcher less context.
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_HEADERS = {"User-Agent": BROWSER_UA, "Accept": "text/html,application/json,*/*"}
_MAX_BODY = 4 << 20  # 4 MiB read cap, matching Go's io.LimitReader


@dataclass
class JDResult:
    """The outcome of the pre-fetch. text is the (truncated) job description on
    success; status is a short human-readable note the researcher is told about
    ("ok", "no JD URL", an HTTP status, or a fetch error)."""

    text: str = ""
    status: str = ""


# ats* regexes extract the org/posting identifiers from the three ATS URL shapes
# whose JSON APIs are deterministic HTTP — no model needed to read them.
# jobs.ashbyhq.com/<org>/<postingId...>
_RE_ASHBY = re.compile(r"(?i)ashbyhq\.com/([^/?#]+)(?:/([0-9a-f-]+))?")
# boards.greenhouse.io/<org>/jobs/<id> or job-boards.greenhouse.io/<org>/jobs/<id>
_RE_GREENHOUSE = re.compile(r"(?i)greenhouse\.io/([^/?#]+)/jobs/(\d+)")
# jobs.lever.co/<org>/<id>
_RE_LEVER = re.compile(r"(?i)lever\.co/([^/?#]+)/([0-9a-f-]+)")


def fetch_jd(httpc: httpx.Client | None, posting_url: str) -> JDResult:
    """Pull the job description for a posting URL, preferring the ATS JSON APIs and
    falling back to a plain browser-UA GET. A failed fetch is not an error."""
    posting_url = (posting_url or "").strip()
    if posting_url == "":
        return JDResult(status="no JD URL")
    if httpc is None:
        httpc = httpx.Client(timeout=30.0, follow_redirects=True)

    m = _RE_ASHBY.search(posting_url)
    if m:
        r = _fetch_ashby(httpc, m.group(1), m.group(2) or "")
        if r is not None:
            return r
    m = _RE_GREENHOUSE.search(posting_url)
    if m:
        r = _fetch_greenhouse(httpc, m.group(1), m.group(2))
        if r is not None:
            return r
    m = _RE_LEVER.search(posting_url)
    if m:
        r = _fetch_lever(httpc, m.group(1), m.group(2))
        if r is not None:
            return r
    return _fetch_plain(httpc, posting_url)


def _get(httpc: httpx.Client, url: str) -> tuple[bytes, int]:
    """The raw GET shared by the JSON and plain paths. Raises httpx.RequestError on
    a transport failure."""
    resp = httpc.get(url, headers=_HEADERS, follow_redirects=True)
    return resp.content[:_MAX_BODY], resp.status_code


def _get_json(httpc: httpx.Client, url: str):
    """An authenticated-by-nothing GET decoding JSON. Returns (status, ok, value);
    ok is False on any transport/HTTP/decoding failure."""
    try:
        body, code = _get(httpc, url)
    except httpx.RequestError as e:
        return f"fetch error: {e}", False, None
    if code // 100 != 2:
        return f"http {code}", False, None
    try:
        return "ok", True, json.loads(body)
    except (ValueError, json.JSONDecodeError):
        return "json decode failed", False, None


def _esc(seg: str) -> str:
    return urllib.parse.quote(seg, safe="")


def _fetch_ashby(httpc: httpx.Client, org: str, posting_id: str) -> JDResult | None:
    """Read the job board and find the matching posting. A bare board URL (no
    posting id) can't identify WHICH job, so fall through (return None) to the
    plain fetch of the page the user actually saved."""
    if posting_id == "":
        return None
    url = "https://api.ashbyhq.com/posting-api/job-board/" + _esc(org)
    _status, ok, board = _get_json(httpc, url)
    if not ok:
        return None
    for j in (board.get("jobs") or []):
        if (j.get("id") or "").lower() != posting_id.lower():
            continue
        desc = j.get("descriptionPlain") or ""
        if desc == "":
            desc = strip_tags(j.get("descriptionHtml") or "")
        text = join_jd(j.get("title") or "", j.get("location") or "", desc)
        if text != "":
            return JDResult(text=trunc(text, JD_MAX_CHARS), status="ok (ashby)")
    return None


def _fetch_greenhouse(httpc: httpx.Client, org: str, id: str) -> JDResult | None:
    """Read one job from the board API (content=true returns the full HTML
    description)."""
    url = "https://boards-api.greenhouse.io/v1/boards/%s/jobs/%s?content=true" % (_esc(org), _esc(id))
    _status, ok, job = _get_json(httpc, url)
    if not ok:
        return None
    location = (job.get("location") or {}).get("name") or ""
    text = join_jd(job.get("title") or "", location, strip_tags(unescape_html(job.get("content") or "")))
    if text == "":
        return None
    return JDResult(text=trunc(text, JD_MAX_CHARS), status="ok (greenhouse)")


def _fetch_lever(httpc: httpx.Client, org: str, id: str) -> JDResult | None:
    """Read one posting from the v0 postings API."""
    url = "https://api.lever.co/v0/postings/%s/%s" % (_esc(org), _esc(id))
    _status, ok, post = _get_json(httpc, url)
    if not ok:
        return None
    desc = post.get("descriptionPlain") or ""
    if desc == "":
        desc = strip_tags(post.get("description") or "")
    location = (post.get("categories") or {}).get("location") or ""
    text = join_jd(post.get("text") or "", location, desc)
    if text == "":
        return None
    return JDResult(text=trunc(text, JD_MAX_CHARS), status="ok (lever)")


def _fetch_plain(httpc: httpx.Client, url: str) -> JDResult:
    """The fallback: a browser-UA GET with crude HTML stripping."""
    try:
        body, code = _get(httpc, url)
    except httpx.RequestError as e:
        return JDResult(status=f"fetch error: {e}")
    if code // 100 != 2:
        return JDResult(status=f"http {code}")
    text = strip_tags(body.decode(errors="replace")).strip()
    if text == "":
        return JDResult(status="empty page")
    return JDResult(text=trunc(text, JD_MAX_CHARS), status="ok (scraped)")


def join_jd(title: str, location: str, body: str) -> str:
    """Assemble the title/location/body into one block, dropping empties."""
    parts: list[str] = []
    if title.strip() != "":
        parts.append(f"Title: {title.strip()}\n")
    if location.strip() != "":
        parts.append(f"Location: {location.strip()}\n")
    if body.strip() != "":
        if parts:
            parts.append("\n")
        parts.append(body.strip())
    return "".join(parts).strip()


_RE_SCRIPT_STYLE = re.compile(r"<(script|style)[^>]*>.*?</(script|style)>", re.I | re.S)
_RE_TAG = re.compile(r"<[^>]+>", re.S)
_RE_WS = re.compile(r"[ \t]*\n[ \t\n]*")
_RE_SPACES = re.compile(r"[ \t]{2,}")


def strip_tags(html: str) -> str:
    """Remove script/style blocks then all tags, collapsing whitespace — the crude
    HTML-to-text used for both ATS HTML descriptions and scraped pages."""
    if html == "":
        return ""
    s = _RE_SCRIPT_STYLE.sub(" ", html)
    s = _RE_TAG.sub(" ", s)
    s = unescape_html(s)
    s = _RE_SPACES.sub(" ", s)
    s = _RE_WS.sub("\n", s)
    return s.strip()


_HTML_ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&#x27;": "'", "&nbsp;": " ", "&rsquo;": "'",
    "&ldquo;": '"', "&rdquo;": '"', "&mdash;": "-", "&ndash;": "-",
}


def unescape_html(s: str) -> str:
    """Expand the handful of entities that survive ATS JSON/HTML."""
    for ent, rep in _HTML_ENTITIES.items():
        s = s.replace(ent, rep)
    return s


def trunc(s: str, n: int) -> str:
    """Cap s to n characters, appending an ellipsis marker when it cuts."""
    if s is None:
        return ""
    if len(s) <= n:
        return s
    return s[:n] + " …[truncated]"
