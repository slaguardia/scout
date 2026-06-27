"""Turn a pasted link into structured rows.

Two paths: posting links on a supported ATS (ashby/greenhouse/lever/rippling/
dover) resolve through the platform's public JSON API — exact fields, no page
fetch, no LLM (see ats.py); everything else gets the generic pass — fetch the
page, try its embedded JSON-LD (jsonld.py), then run one cheap LLM call to
classify it and extract fields. Either way the company is upserted — and the
posting, when it's a job. All writes stay scout-local; the brain is never
touched.
"""

from __future__ import annotations

import json
import re
import sqlite3
import urllib.parse
from dataclasses import dataclass, field

import httpx

from scout import anthropic, enrich, ingest
from scout.ingest import CapturedCompany
from scout.store import companies, enrichment, posting_answers, postings

from . import questions
from .ats import (
    DESC_CAP_RUNES,
    ATSJob,
    is_ats_posting,
    resolve_ats,
    trunc_runes,
)
from .jsonld import JobPostingLD, parse_job_posting_ld

# maxPageRunes caps the page text handed to the extractor (Haiku) — enough for
# the title/company/location signal while keeping the call cheap. The full
# fetched text (up to descCapRunes) is kept as the posting description.
MAX_PAGE_RUNES = 6000
# enrichSeedRunes matches enrichment's summary cap.
ENRICH_SEED_RUNES = 3000
LLM_MAX_TOKENS = 400

# Page kinds the extractor classifies into.
KIND_JOB = "job_posting"
KIND_COMPANY = "company_page"
KIND_OTHER = "other"


@dataclass
class Fields:
    """The user-typed values from the Add dialog. All optional; empty means "let
    the extractor fill it". headcount and funding_stage are never extracted."""

    name: str = ""  # company name
    location: str = ""  # company HQ
    headcount: str = ""
    funding_stage: str = ""
    vertical: str = ""
    title: str = ""  # job title (job postings only)


@dataclass
class Request:
    """One capture: the pasted URL plus whatever the user already knows. kind,
    when set, pins the page kind (overrides the classifier). Fields always win
    over extraction."""

    url: str = ""
    kind: str = ""  # "" = classify; KIND_JOB / KIND_COMPANY = pinned by the user
    fields: Fields = field(default_factory=Fields)


@dataclass
class Result:
    """What one capture did. fetch_status uses the enrichment taxonomy.
    company_id/posting are set only when something was resolved or written; note
    carries the human-readable outcome for the UI toast."""

    kind: str = ""
    fetch_status: str = ""
    url: str = ""  # final URL after redirects
    company_id: str = ""
    company_name: str = ""
    company_created: bool = False
    posting: postings.Posting | None = None
    posting_updated: bool = False
    note: str = ""


class FetchError(Exception):
    """A page that couldn't be fetched as real content; status is the enrichment
    fetch-taxonomy value ("challenge", "http_403", ...). The web layer maps it to
    a 422. result carries the no-write Result so the caller can read what was attempted."""

    def __init__(self, status: str, result: Result | None = None):
        super().__init__("fetch failed: " + status)
        self.status = status
        self.result = result


@dataclass
class _Extraction:
    """The JSON contract the extractor model must return."""

    kind: str = ""
    company_name: str = ""
    company_domain: str = ""
    job_title: str = ""
    job_location: str = ""
    vertical: str = ""
    company_location: str = ""

    def apply(self, f: Fields) -> None:
        """Overlay the user-typed fields onto the extraction — user input always
        wins, the extractor only fills what was left blank."""
        if f.name.strip() != "":
            self.company_name = f.name.strip()
        if f.location.strip() != "":
            self.company_location = f.location.strip()
        if f.vertical.strip() != "":
            self.vertical = f.vertical.strip()
        if f.title.strip() != "":
            self.job_title = f.title.strip()


@dataclass
class Capturer:
    """Runs the link-capture agent pass. db is the shared sqlite3 connection
    (the store layer is free functions); client is the Anthropic client (None or
    keyless disables the LLM path); model defaults to Haiku; http is the page
    fetcher (None uses a fresh default client)."""

    db: sqlite3.Connection
    client: anthropic.Client | None = None
    model: str = ""
    http: httpx.Client | None = None

    def _httpc(self) -> httpx.Client:
        return self.http if self.http is not None else enrich.new_http_client(0)

    # --- the main capture flow ------------------------------------------------

    def run(self, req: Request) -> Result:
        """Capture one pasted URL. Validation errors are prefixed "url " (the web
        layer maps them to 400); unfetchable pages raise FetchError (422); LLM or
        store failures propagate. On success the Result says what happened —
        including the no-write outcomes (kind "other", unidentifiable company)."""
        raw_url = req.url.strip()
        if raw_url == "":
            raise ValueError("url required")
        parsed = urllib.parse.urlparse(raw_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("url must be http(s)")

        httpc = self._httpc()

        # A posting link on a supported ATS resolves through the platform's own
        # API — exact fields, no LLM. Skipped when the user pinned the link as a
        # company page; a failed resolve falls through to the generic path.
        if req.kind != KIND_COMPANY:
            job = resolve_ats(httpc, raw_url)
            if job is not None:
                return self._run_ats(raw_url, req, job)

        # Fetch up to the store cap — for a job posting the whole thing becomes
        # the description. low_content still goes to the extractor: ATS pages are
        # often JS shells whose residual text carries enough.
        body, text, final_url, status = enrich.fetch_page_html(httpc, raw_url, DESC_CAP_RUNES)
        if status != "ok" and status != "low_content":
            # The page is unfetchable. For a company the user explicitly pinned we
            # don't need the page: create it from the typed name and/or the link's
            # own domain. A job link still needs the page, and an unclassified
            # link can't be guessed at — both report the honest fetch failure.
            if req.kind == KIND_COMPANY:
                res, ok = self._add_bare_company(req, raw_url, final_url, status)
                if ok:
                    return res
            raise FetchError(status, Result(fetch_status=status, url=final_url))

        # Most job pages embed a schema.org JobPosting — exact fields, no LLM.
        # Skipped when the user pinned the link as a company page.
        if req.kind != KIND_COMPANY:
            jp = parse_job_posting_ld(body)
            if jp is not None:
                return self._run_job_posting_ld(raw_url, final_url, status, req, jp)

        # The model only needs the early signal — hand it a slice, not the body.
        ext = self.extract(final_url, trunc_runes(text, MAX_PAGE_RUNES), req.kind)
        ext.apply(req.fields)
        if req.kind != "":
            ext.kind = req.kind  # the user said what this link is

        res = Result(kind=ext.kind, fetch_status=status, url=final_url)
        if ext.kind == KIND_OTHER:
            res.note = "page doesn't look like a job posting or a company page — nothing added"
            return res

        name = ext.company_name.strip()
        domain = resolve_company_domain(ext.company_domain, raw_url, final_url)
        if name == "" and domain == "":
            res.note = (
                "couldn't identify the company behind the page — type a company name and retry"
            )
            return res

        cid, created = ingest.ensure_company(
            self.db,
            CapturedCompany(
                name=name,
                domain=domain,
                location=ext.company_location,
                vertical=ext.vertical,
                source_url=final_url,
                headcount=req.fields.headcount,
                funding_stage=req.fields.funding_stage,
            ),
        )
        res.company_id = cid
        res.company_created = created
        if name == "":
            name = domain
        res.company_name = name

        if ext.kind == KIND_COMPANY:
            # Seed the enrichment row so the next verdict run can score without a
            # separate Enrich pass. Only when no enrichment exists.
            if enrichment.get_enrichment(self.db, cid) is None:
                enrichment.upsert_enrichment(
                    self.db,
                    enrichment.Enrichment(
                        company_id=cid,
                        website_url=final_url or None,
                        website_summary=trunc_runes(text, ENRICH_SEED_RUNES) or None,
                        fetch_status=status,
                    ),
                )
        elif ext.kind == KIND_JOB:
            # Keep the fetched page text itself as the posting body (up to
            # descCapRunes), matching the ATS path.
            p, updated = postings.upsert_captured_posting(
                self.db,
                postings.CapturedPosting(
                    company_id=cid,
                    url=final_url,
                    pasted_url=raw_url,
                    title=ext.job_title,
                    location=ext.job_location,
                    description=text.strip(),
                    fetch_status=status,
                ),
            )
            res.posting = p
            res.posting_updated = updated
            self._detect_and_store(p.id, final_url)
        return res

    def capture_ats_posting(self, req: Request) -> Result | None:
        """Resolve a supported-ATS posting link through the platform API and write
        the company + posting — the keyless path. Returns None when the link isn't
        a recognized ATS posting or the platform resolve fails."""
        raw_url = req.url.strip()
        if not is_ats_posting(raw_url):
            return None
        job = resolve_ats(self._httpc(), raw_url)
        if job is None:
            return None
        try:
            return self._run_ats(raw_url, req, job)
        except Exception:
            return None

    def capture_ats_posting_for_company(self, company_id: str, req: Request) -> Result | None:
        """Resolve a supported-ATS posting link and write it under an
        already-known company id. Never goes through ensure_company, so it can
        neither mint a company nor re-home the posting to a twin. Returns None on a
        non-ATS link or a resolve miss."""
        raw_url = req.url.strip()
        if not is_ats_posting(raw_url):
            return None
        job = resolve_ats(self._httpc(), raw_url)
        if job is None:
            return None
        try:
            p, updated = self._write_ats_posting(company_id, raw_url, req.fields.title.strip(), job)
        except Exception:
            return None
        return Result(
            kind=KIND_JOB,
            fetch_status="ok",
            url=job.url,
            company_id=company_id,
            posting=p,
            posting_updated=updated,
            note="details from the " + job.ats + " posting API — no LLM pass needed",
        )

    def capture_job_for_company(self, company_id: str, req: Request) -> Result | None:
        """Fetch a non-ATS posting link, run the one-shot LLM extraction, and write
        the resulting posting under an already-known company id. Returns None when
        there's no key, the page can't be read, or the model can't be called."""
        raw_url = req.url.strip()
        if raw_url == "":
            return None
        if self.client is None or not self.client.has_key():
            return None  # no key → no LLM path; caller bare-inserts
        text, final_url, status = enrich.fetch_page(self._httpc(), raw_url, DESC_CAP_RUNES)
        if status != "ok" and status != "low_content":
            return None  # unfetchable → bare insert
        try:
            ext = self.extract(final_url, trunc_runes(text, MAX_PAGE_RUNES), KIND_JOB)
        except Exception:
            return None
        ext.apply(req.fields)  # user-typed Title wins over the extraction
        try:
            p, updated = postings.upsert_captured_posting(
                self.db,
                postings.CapturedPosting(
                    company_id=company_id,
                    url=final_url,
                    pasted_url=raw_url,
                    title=ext.job_title,
                    location=ext.job_location,
                    description=text.strip(),
                    fetch_status=status,
                ),
            )
        except Exception:
            return None
        self._detect_and_store(p.id, final_url)
        return Result(
            kind=KIND_JOB,
            fetch_status=status,
            url=final_url,
            company_id=company_id,
            posting=p,
            posting_updated=updated,
        )

    # --- write helpers --------------------------------------------------------

    def _add_bare_company(
        self, req: Request, raw_url: str, final_url: str, status: str
    ) -> tuple[Result | None, bool]:
        """Land a company without any page content — the graceful path for a
        user-pinned company link that can't be fetched. ok=False means there was
        nothing to identify the company by, so the caller reports the fetch
        failure. Store failures propagate."""
        name = req.fields.name.strip()
        domain = resolve_company_domain("", raw_url, final_url)
        if name == "" and domain == "":
            return None, False
        res = Result(kind=KIND_COMPANY, fetch_status=status, url=final_url)
        cid, created = ingest.ensure_company(
            self.db,
            CapturedCompany(
                name=name,
                domain=domain,
                location=req.fields.location.strip(),
                vertical=req.fields.vertical.strip(),
                source_url=final_url,
                headcount=req.fields.headcount,
                funding_stage=req.fields.funding_stage,
            ),
        )
        res.company_id = cid
        res.company_created = created
        if name == "":
            name = domain
        res.company_name = name
        res.note = f"couldn't read the page ({status}) — added {name} as a bare record you can enrich later"
        return res, True

    def _run_ats(self, raw_url: str, req: Request, job: ATSJob) -> Result:
        """The same writes a captured job posting makes, from the platform-stated
        fields. The ATS host never identifies the company, so its identity is the
        user-typed name or the board's — never a domain."""
        res = Result(kind=KIND_JOB, fetch_status="ok", url=job.url)
        name = req.fields.name.strip()
        if name == "":
            name = job.company_name
        if name == "":
            res.note = (
                "couldn't identify the company behind the page — type a company name and retry"
            )
            return res
        cid, created = ingest.ensure_company(
            self.db,
            CapturedCompany(
                name=name,
                location=req.fields.location,
                vertical=req.fields.vertical,
                source_url=job.url,
                headcount=req.fields.headcount,
                funding_stage=req.fields.funding_stage,
            ),
        )
        res.company_id = cid
        res.company_created = created
        res.company_name = name

        p, updated = self._write_ats_posting(cid, raw_url, req.fields.title.strip(), job)
        res.posting = p
        res.posting_updated = updated
        res.note = "details from the " + job.ats + " posting API — no LLM pass needed"
        return res

    def _run_job_posting_ld(
        self, raw_url: str, final_url: str, status: str, req: Request, jp: JobPostingLD
    ) -> Result:
        """The same writes the generic job path makes, from a page's embedded
        schema.org JobPosting. A careers page identifies its company, so the
        hiring org's own site resolves a real domain. The JobPosting's location is
        the role's, not HQ, so it seeds the posting, never the company row."""
        res = Result(kind=KIND_JOB, fetch_status=status, url=final_url)
        name = req.fields.name.strip()
        if name == "":
            name = jp.company_name.strip()
        domain = resolve_company_domain(jp.company_url, raw_url, final_url)
        if name == "" and domain == "":
            res.note = (
                "couldn't identify the company behind the page — type a company name and retry"
            )
            return res
        cid, created = ingest.ensure_company(
            self.db,
            CapturedCompany(
                name=name,
                domain=domain,
                location=req.fields.location.strip(),  # company HQ — the JobPosting states the role's location
                vertical=req.fields.vertical.strip(),
                source_url=final_url,
                headcount=req.fields.headcount,
                funding_stage=req.fields.funding_stage,
            ),
        )
        res.company_id = cid
        res.company_created = created
        if name == "":
            name = domain
        res.company_name = name

        title = req.fields.title.strip()
        if title == "":
            title = jp.title
        p, updated = postings.upsert_captured_posting(
            self.db,
            postings.CapturedPosting(
                company_id=cid,
                url=final_url,
                pasted_url=raw_url,
                title=title,
                location=jp.location,
                fetch_status=status,
                posted_at=jp.posted_at,
                employment_type=jp.employment_type,
                workplace_type=jp.workplace_type,
                comp_range=jp.comp_range,
                description=jp.description,
            ),
        )
        res.posting = p
        res.posting_updated = updated
        res.note = "details from the page's embedded job-posting data — no LLM pass needed"
        self._detect_and_store(p.id, final_url)
        return res

    def _write_ats_posting(
        self, company_id: str, raw_url: str, title: str, job: ATSJob
    ) -> tuple[postings.Posting, bool]:
        """Upsert the posting row from a resolved ATS job, then kick off
        best-effort question detection. title is the user-typed value (which
        wins); the platform's title fills a blank."""
        if title.strip() == "":
            title = job.title
        p, updated = postings.upsert_captured_posting(
            self.db,
            postings.CapturedPosting(
                company_id=company_id,
                url=job.url,
                pasted_url=raw_url,
                title=title,
                location=job.location,
                fetch_status="ok",
                posted_at=job.posted_at,
                employment_type=job.employment_type,
                workplace_type=job.workplace_type,
                department=job.department,
                comp_range=job.comp_range,
                description=job.description,
            ),
        )
        self._detect_and_store(p.id, job.url)
        return p, updated

    # --- extraction -----------------------------------------------------------

    def extract(self, final_url: str, text: str, kind: str) -> _Extraction:
        """Run the single Haiku pass over the page text. A pinned kind is passed
        along as a hint; the pin itself is enforced by the caller."""
        if self.client is None or not self.client.has_key():
            raise ValueError(
                "this link needs the LLM pass — set an Anthropic API key (Settings) "
                "or ANTHROPIC_API_KEY in the server environment"
            )
        model = self.model or anthropic.DEFAULT_MODEL
        hint = ""
        if kind == KIND_JOB:
            hint = "The user says this link is a job posting.\n"
        elif kind == KIND_COMPANY:
            hint = "The user says this link is a company page.\n"
        try:
            tags = companies.vertical_tags(self.db)
            vocab = enrich.vertical_vocab(tags)
            if vocab != "":
                hint += vocab + "\n"
        except Exception:
            pass
        user = f"{hint}URL: {final_url}\n\nPage text (truncated):\n{text}\n\nReturn the JSON now."

        resp = self.client.send(
            anthropic.Request(
                model=model,
                system=_CAPTURE_CONTRACT,
                max_tokens=LLM_MAX_TOKENS,
                messages=[anthropic.Message(role="user", content=user)],
            )
        )
        return parse_extraction(resp.text())

    # --- question detection (delegates to questions.py) -----------------------

    def resolve_questions(self, raw_url: str) -> questions.QuestionScan:
        """The full detection a Capturer runs: the no-LLM ATS path first, then —
        only for unsupported (non-ATS) hosts, and only when an LLM key is
        configured — the HTML+LLM fallback."""
        httpc = self._httpc()
        scan = questions.detect_questions(httpc, raw_url)
        if scan.status != questions.QUESTIONS_UNSUPPORTED:
            return scan  # an ATS resolver answered (ok/none/unreachable)
        if self.client is None or not self.client.has_key():
            return scan
        return questions.detect_questions_llm(self.client, self.model, httpc, raw_url)

    def detect_and_store_questions(self, posting_id: str, raw_url: str) -> questions.QuestionScan:
        """Resolve a posting's application questions and record them — the
        idempotent upsert plus the posting's questions_status. Raises NotFound
        when the posting id is unknown."""
        scan = self.resolve_questions(raw_url)
        dqs = [
            posting_answers.DetectedQuestion(key=q.key, prompt=q.prompt, max_length=q.max_length)
            for q in scan.questions
        ]
        posting_answers.upsert_detected_questions(self.db, posting_id, dqs, scan.status)
        return scan

    def _detect_and_store(self, posting_id: str, raw_url: str) -> None:
        """Capture-flow wrapper: a detection failure is swallowed (the stored
        questions_status carries the outcome) and never surfaces as a capture
        error."""
        try:
            self.detect_and_store_questions(posting_id, raw_url)
        except Exception:
            pass


# captureContract is the extractor's system prompt — the JSON output contract plus
# the classification rules. Fixed in code, like the verdict contract.
_CAPTURE_CONTRACT = r"""You are Scout's link-capture engine. The user pasted a link; you are given the fetched page's text. Classify the page and extract fields. Reply ONLY with valid JSON, no preamble, no markdown fences, exactly these fields:
{"kind": "job_posting" | "company_page" | "other",
 "company_name": "the hiring/owning company's name, or \"\"",
 "company_domain": "the company's OWN website domain (e.g. acme.com): the domain stated on the page, or — for a well-known company — its primary domain when you know it with high confidence. \"\" when unsure; never guess for small or unknown companies, and NEVER the host of a job board or ATS (greenhouse.io, lever.co, ashbyhq.com, workday, linkedin.com, indeed.com, ...)",
 "job_title": "the role's title, or \"\" if not a job posting",
 "job_location": "the role's location / remote policy, or \"\"",
 "vertical": "1-3 short industry tags, comma-separated (e.g. \"AI, Developer Tools\"), or \"\"",
 "company_location": "the company's HQ location if stated, or \"\""}

kind rules:
- "job_posting": the page describes ONE specific open role.
- "company_page": a company homepage, about page, or careers index.
- "other": anything else (an article, a list of many roles, a login wall, an empty shell).
Extract only what the page supports — never invent values."""


# Extraction parsing: tolerant of surrounding noise and fenced code blocks. The
# contract JSON is flat, so the outermost braces are the object.
_re_json_block = re.compile(r"\{.*\}", re.S)


def parse_extraction(s: str) -> _Extraction:
    s = s.strip()
    candidates = [s]
    m = _re_json_block.search(s)
    if m:
        candidates.insert(0, m.group(0))
    for cand in candidates:
        try:
            d = json.loads(cand)
        except (ValueError, json.JSONDecodeError):
            continue
        if not isinstance(d, dict):
            continue
        kind = str(d.get("kind", "") or "").strip().lower()
        if kind in (KIND_JOB, KIND_COMPANY, KIND_OTHER):
            return _Extraction(
                kind=kind,
                company_name=d.get("company_name", "") or "",
                company_domain=d.get("company_domain", "") or "",
                job_title=d.get("job_title", "") or "",
                job_location=d.get("job_location", "") or "",
                vertical=d.get("vertical", "") or "",
                company_location=d.get("company_location", "") or "",
            )
    raise ValueError("no valid extraction JSON")


# atsHosts are applicant-tracking systems and job boards whose host routinely
# carries the posting but is never the company's own identity. Complements
# ingest's aggregator list with the hiring-specific platforms. Suffix-matched.
_ATS_HOSTS = {
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "workable.com",
    "workday.com",
    "myworkdayjobs.com",
    "icims.com",
    "smartrecruiters.com",
    "jobvite.com",
    "bamboohr.com",
    "breezy.hr",
    "recruitee.com",
    "teamtailor.com",
    "applytojob.com",
    "rippling-ats.com",
    "greenhouse.com",
    "jazz.co",
    "jazzhr.com",
    "workatastartup.com",
    "ycombinator.com",
    "otta.com",
    "builtin.com",
    "simplify.jobs",
    "hired.com",
    "dover.com",
}


def is_ats_host(host: str) -> bool:
    if host == "":
        return False
    if host in _ATS_HOSTS:
        return True
    for base in _ATS_HOSTS:
        if host.endswith("." + base):
            return True
    return False


def company_domain_from_url(raw_url: str) -> str:
    """The company identity domain a pasted link's own host implies, or "" when
    the host can't identify a company (an ATS, a job board, an aggregator). The
    no-agent add path uses this to attach a posting on acme.com/careers to
    acme.com without a fetch or an LLM call."""
    netloc = urllib.parse.urlparse(raw_url.strip()).netloc
    d = ingest.identity_domain(netloc)
    if d != "" and not is_ats_host(d):
        return d
    return ""


def resolve_company_domain(extracted: str, pasted_url: str, final_url: str) -> str:
    """Pick the company's identity domain: the extracted value when it's a real,
    non-ATS host, else the page's own host (a posting on acme.com/careers
    identifies acme.com; one on boards.greenhouse.io identifies nothing)."""
    d = ingest.identity_domain(extracted)
    if d != "" and not is_ats_host(d):
        return d
    for raw in (final_url, pasted_url):
        netloc = urllib.parse.urlparse(raw).netloc
        d = ingest.identity_domain(netloc)
        if d != "" and not is_ats_host(d):
            return d
    return ""
