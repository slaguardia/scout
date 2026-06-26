"""Fetch a company's about/landing page and store a text summary. Port of
internal/enrich/enrich.go.

Strategy: try a small set of candidate URLs (/about, /about-us, /, ...), take the
first one that returns 2xx HTML, strip tags, collapse whitespace, truncate. Errors
are recorded so we don't retry hot loops on permanently broken sites.

Concurrency note: Go's Run fans the work out over a goroutine worker pool. This
port runs the same work sequentially — the Python store is built around a single
sqlite3 connection (not safe to share across threads), so the worker pool can't be
reproduced without a per-thread connection layer the store doesn't have. The
observable contract is identical: the same Result accounting, the same DB writes,
and the same progress emissions (the header still names the worker count). Only
wall-clock parallelism differs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Callable

import httpx

from scout.store._helpers import null
from scout.store.enrichment import (
    Enrichment,
    EnrichmentTarget,
    enrichment_targets,
    upsert_enrichment,
)

from .facts import fill_facts

DEFAULT_WORKERS = 8
DEFAULT_TIMEOUT = 12.0  # seconds
# 2 MB read cap. Generous because a page's JSON-LD JobPosting (the capture flow's
# keyless field source) is usually emitted right before </body>; the text summary
# is truncated to MAX_SUMMARY_RUNES regardless, so this only bounds bytes scanned.
MAX_BODY_BYTES = 2 << 20
MAX_SUMMARY_RUNES = 3000  # chunk handed to the LLM
MIN_CONTENT_RUNES = 200  # below this, flag as 'low_content' (JS-SPA likely)
USER_AGENT = "scout/0.1 (+https://github.com/slaguardia/scout)"

# Candidate URL paths in priority order.
CANDIDATE_PATHS = ["/about", "/about-us", "/company", "/"]


@dataclass
class Result:
    """Reports a run."""

    considered: int = 0
    fetched: int = 0
    ok: int = 0
    failed: int = 0
    skipped: int = 0
    filled: int = 0  # companies whose blank fact columns got filled (see facts.py)


def new_http_client(timeout: float = 0.0) -> httpx.Client:
    """The HTTP client the fetch paths share: a per-request timeout and a redirect
    cap. A non-positive timeout uses the default."""
    if timeout <= 0:
        timeout = DEFAULT_TIMEOUT
    return httpx.Client(timeout=timeout, follow_redirects=True, max_redirects=5)


class Enricher:
    """Fetches about-pages.

    Attributes mirror Go's Enricher struct. `scheme` is a Python-only testability
    seam (Go's fetchOne hard-codes "https://"; defaulting it to "https" preserves
    that, while a test can point at a local http stub).
    """

    def __init__(
        self,
        con=None,
        workers: int = 0,
        timeout: float = 0.0,
        client: httpx.Client | None = None,
        only_blanks: bool = False,
        company_ids: list[str] | None = None,
        progress: Callable[[str], None] | None = None,
        llm=None,
        model: str = "",
        scheme: str = "https",
    ):
        self.con = con
        self.workers = workers
        self.timeout = timeout
        self.client = client
        # only_blanks limits the run to companies with no enrichment row at all.
        # Ignored when Run is forced.
        self.only_blanks = only_blanks
        # company_ids limits the run to exactly these companies and always
        # re-fetches them (overrides only_blanks).
        self.company_ids = company_ids
        # progress, if set, receives one line per fetched company.
        self.progress = progress
        # llm, if set, enables the fact-extraction pass after a fetch comes back
        # "ok". None disables — enrichment stays purely mechanical. See facts.py.
        self.llm = llm
        self.model = model  # extraction model; empty = anthropic.DEFAULT_MODEL
        self.scheme = scheme

    def emit(self, line: str) -> None:
        if self.progress is not None:
            self.progress(line)

    def _client(self) -> httpx.Client:
        if self.client is None:
            self.client = new_http_client(self.timeout)
        return self.client

    def run(self, force: bool) -> Result:
        """Enrich every company that needs it. If force, every company with a
        domain is re-fetched."""
        if self.workers <= 0:
            self.workers = DEFAULT_WORKERS
        if self.timeout <= 0:
            self.timeout = DEFAULT_TIMEOUT

        targets = enrichment_targets(self.con, force, self.only_blanks, self.company_ids)
        res = Result(considered=len(targets))
        if not targets:
            return res

        # Header up front so the parallelism is legible.
        workers = min(self.workers, len(targets))
        self.emit(f"enriching {len(targets)} companies · {workers} workers in parallel")

        for t in targets:
            self.emit(f"· {t.name}…")  # picked up
            rec = self.fetch_one(t)
            try:
                upsert_enrichment(self.con, rec)
            except Exception as e:  # noqa: BLE001 - DB failure is bad; surface but keep going
                print("enrich db error:", e)
                continue
            # Fact extraction rides on a good fetch: fill blank company columns
            # from the page text. Best-effort, never fails the row.
            filled = False
            if self.llm is not None and rec.fetch_status == "ok":
                filled = fill_facts(self, t, rec.website_summary or "")
            res.fetched += 1
            if rec.fetch_status == "ok":
                res.ok += 1
            else:
                res.failed += 1
            if filled:
                res.filled += 1
            done = res.fetched
            status = rec.fetch_status + (" +facts" if filled else "")
            self.emit(f"[{done}/{res.considered}] {t.name} — {status}")
        return res

    def fetch_one(self, t: EnrichmentTarget) -> Enrichment:
        rec = Enrichment(company_id=t.company_id)
        if t.domain == "":
            rec.fetch_status = "no_domain"
            return rec

        last_err = ""
        last_status = ""
        # Best low_content candidate seen so far. A JS-SPA often serves a thin
        # shell on /about while the homepage carries real server-rendered text, so
        # a short page must not end the walk — keep it only as a fallback.
        low_fallback: Enrichment | None = None
        for path in CANDIDATE_PATHS:
            url = f"{self.scheme}://{t.domain}{path}"
            body, code, final_url, err = _get(self._client(), url)
            if err is not None:
                last_err = str(err)
                last_status = classify_err(err)
                continue
            if 200 <= code < 300 and body:
                text = extract_text(body)
                # Soft 404: many sites serve HTTP 200 with a "page not found" body
                # for a missing path. Don't accept it — try the next candidate.
                # Checked before we store anything so a trailing soft-404 leaves no
                # stale URL behind.
                if looks_like_not_found(text):
                    last_status = "soft_404"
                    continue
                # Store where we actually landed, not the path we guessed.
                rec.website_url = null(final_url)
                rec.website_summary = null(trunc_runes(text, MAX_SUMMARY_RUNES))
                # Order matters: challenge pages are often short AND match the
                # challenge keywords, so check the more-specific signal first.
                if looks_like_challenge(text):
                    rec.fetch_status = "challenge"
                    return rec
                # Suspiciously short stripped text suggests a JS-SPA shell. Keep the
                # longest one we've seen (cached so it can be inspected) but try the
                # remaining candidates.
                if rune_count(text) < MIN_CONTENT_RUNES:
                    if low_fallback is None or rune_count(text) > rune_count(low_fallback.website_summary or ""):
                        low_fallback = replace(rec, fetch_status="low_content")
                    last_status = "low_content"
                    continue
                rec.fetch_status = "ok"
                return rec
            last_status = status_for_bad_code(code, body or b"")

        if low_fallback is not None:
            return low_fallback
        rec.fetch_status = last_status or "error"
        if last_err != "":
            rec.fetch_error = last_err
        return rec


def fetch_page(client: httpx.Client | None, url: str, max_runes: int = 0) -> tuple[str, str, str]:
    """Fetch one URL and return its stripped text, the final URL after any
    redirects, and a status from the same taxonomy fetch_one records. Exported for
    the link-capture flow. Returns (text, final_url, status)."""
    _, text, final_url, status = fetch_page_html(client, url, max_runes)
    return text, final_url, status


def fetch_page_html(client: httpx.Client | None, url: str, max_runes: int = 0) -> tuple[bytes | None, str, str, str]:
    """fetch_page that also returns the raw HTML body from the same fetch. body is
    the raw bytes for the "ok"/"low_content" outcomes (None otherwise);
    text/final_url/status are exactly fetch_page's. Returns (body, text, final_url,
    status)."""
    if client is None:
        client = new_http_client(0)
    if max_runes <= 0:
        max_runes = MAX_SUMMARY_RUNES
    raw, code, final_url, err = _get(client, url)
    if err is not None:
        return None, "", final_url, classify_err(err)
    if code < 200 or code >= 300 or not raw:
        return None, "", final_url, status_for_bad_code(code, raw or b"")
    text = extract_text(raw)
    if looks_like_not_found(text):
        return None, "", final_url, "soft_404"
    if looks_like_challenge(text):
        return None, "", final_url, "challenge"
    if rune_count(text) < MIN_CONTENT_RUNES:
        # Keep the residual text — a JS-shell's title/meta can still carry enough
        # signal for the capture extractor to work with.
        return raw, trunc_runes(text, max_runes), final_url, "low_content"
    return raw, trunc_runes(text, max_runes), final_url, "ok"


def _get(client: httpx.Client, url: str) -> tuple[bytes | None, int, str, Exception | None]:
    """Fetch url and return (body, status_code, final_url, err). The final URL is
    where we landed after any redirects — store it, not the requested url. A
    transport error (or a non-HTML content-type) is returned as err."""
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    try:
        resp = client.get(url, headers=headers)
    except httpx.HTTPError as e:
        return None, 0, url, e
    final_url = str(resp.url)
    ct = resp.headers.get("Content-Type", "")
    if ct != "" and "html" not in ct.lower():
        return None, resp.status_code, final_url, ValueError(f"non-html content-type: {ct}")
    body = resp.content[:MAX_BODY_BYTES]
    return body, resp.status_code, final_url, None


def status_for_bad_code(code: int, body: bytes) -> str:
    """Classify a non-2xx (or empty-body) response. A bot-challenge body is
    reported as the actionable "challenge" before falling back to "http_<code>"."""
    if body and looks_like_challenge(extract_text(body)):
        return "challenge"
    return f"http_{code}"


def classify_err(err: Exception) -> str:
    """Map a transport error onto the fetch-status taxonomy."""
    s = str(err).lower()
    if isinstance(err, httpx.TimeoutException) or "timed out" in s or "deadline exceeded" in s:
        return "timeout"
    if "no such host" in s or "name or service not known" in s or "nodename nor servname" in s \
            or "name resolution" in s or "getaddrinfo" in s or "failed to resolve" in s:
        return "dns"
    if "connection refused" in s or "refused" in s:
        return "refused"
    return "error"


# --- HTML text extraction (regex-based; cheap, no extra deps) ---

_RE_SCRIPT = re.compile(r"<script[^>]*>.*?</script>", re.I | re.S)
_RE_STYLE = re.compile(r"<style[^>]*>.*?</style>", re.I | re.S)
_RE_NOSCR = re.compile(r"<noscript[^>]*>.*?</noscript>", re.I | re.S)
_RE_SVG = re.compile(r"<svg[^>]*>.*?</svg>", re.I | re.S)
_RE_TAG = re.compile(r"<[^>]+>", re.S)
_RE_WS = re.compile(r"\s+")
_RE_ENTITY = re.compile(r"&[a-zA-Z#0-9]+;")

_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&nbsp;": " ",
    "&#39;": "'",
    "&#34;": '"',
    "&hellip;": "…",
    "&mdash;": "—",
    "&ndash;": "–",
    "&rsquo;": "'",
    "&lsquo;": "'",
    "&rdquo;": '"',
    "&ldquo;": '"',
}


def extract_text(body: bytes) -> str:
    s = body.decode("utf-8", errors="replace")
    s = _RE_SCRIPT.sub(" ", s)
    s = _RE_STYLE.sub(" ", s)
    s = _RE_NOSCR.sub(" ", s)
    s = _RE_SVG.sub(" ", s)
    s = _RE_TAG.sub(" ", s)
    s = _RE_ENTITY.sub(lambda m: _ENTITIES.get(m.group(0).lower(), " "), s)
    s = _RE_WS.sub(" ", s)
    return s.strip()


def trunc_runes(s: str, n: int) -> str:
    if n <= 0:
        return ""
    if len(s) <= n:
        return s
    return s[:n] + "…"


def rune_count(s: str) -> int:
    return len(s)


# challenge_phrases are case-insensitive substrings that strongly imply the
# fetched page is a bot-challenge interstitial rather than real content.
_CHALLENGE_PHRASES = [
    "just a moment",
    "checking your browser",
    "please enable javascript and cookies to continue",
    "please turn javascript on and reload the page",
    "ddos protection by",
    "attention required",
    "verify you are human",
    "performance & security by cloudflare",
]


def looks_like_challenge(text: str) -> bool:
    """True if the stripped text matches known challenge boilerplate AND is short
    enough that it's likely the *whole* page is the challenge."""
    if rune_count(text) >= 1000:
        return False
    lower = text.lower()
    return any(p in lower for p in _CHALLENGE_PHRASES)


# not_found_phrases are case-insensitive substrings that strongly imply a soft 404.
_NOT_FOUND_PHRASES = [
    "page not found",
    "page can't be found",
    "page cannot be found",
    "page could not be found",
    "page you requested could not be found",
    "page you are looking for",
    "page you were looking for",
    "page doesn't exist",
    "page does not exist",
    "404 error",
    "error 404",
]


def looks_like_not_found(text: str) -> bool:
    """True if the stripped text matches known not-found boilerplate AND is short
    enough that the *whole* page is the error."""
    if rune_count(text) >= 1000:
        return False
    lower = text.lower()
    return any(p in lower for p in _NOT_FOUND_PHRASES)
