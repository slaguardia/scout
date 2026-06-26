"""CSV ingest (Crunchbase first) + the hand-add / domain paths. Port of internal/ingest/csv.go.

Store access is via free functions on scout.store.companies, taking the
sqlite3.Connection. The two ways the SAME company can be keyed — by domain, or by
name when domain-less — are kept collapsed onto one row in both arrival orders by
upsert_with_merge (the shared merge path).
"""
from __future__ import annotations

import csv  # stdlib (absolute import; this module is scout.ingest.csv)
import json
from dataclasses import dataclass, field

from scout.store import companies
from scout.store.companies import Company

# column_aliases maps our canonical field -> candidate CSV header names
# (case-insensitive, normalized). Crunchbase exports vary; we try multiple known
# shapes. Unknown headers still get preserved in raw_json.
COLUMN_ALIASES: dict[str, list[str]] = {
    "name": ["name", "organization name", "company", "company name"],
    "source_id": ["uuid", "id", "cb_id", "crunchbase uuid", "organization name url"],
    "domain": ["domain", "website", "homepage url", "url"],
    "headcount": ["headcount", "employees", "number of employees", "employee count"],
    "funding_stage": ["funding stage", "last funding type", "stage", "last funding round"],
    "location": ["location", "headquarters location", "hq location", "city", "headquarters"],
    "vertical": ["vertical", "industry", "industries", "category", "categories"],
}


@dataclass
class Collision:
    """A single cross-identity overwrite: an incoming row keyed by domain landed
    on an existing row stored under a different name."""

    domain: str = ""  # the shared domain key
    incoming_name: str = ""  # the name now stored on the row
    overwrote_name: str = ""  # the name that was there before


@dataclass
class Result:
    """How an ingest run went."""

    read: int = 0
    upserted: int = 0  # total rows accepted (new inserts + dedup merges)
    merged: int = 0  # of upserted, how many landed on an already-known company
    collisions: int = 0  # of merged, overwrites where a DIFFERENT name shared the domain key
    skipped: int = 0
    errors: list[str] = field(default_factory=list)
    collision_details: list[Collision] = field(default_factory=list)


class CSV:
    """A CSV ingester. source is a short tag stored in the row ("crunchbase",
    "manual", etc.); con is the open store connection."""

    def __init__(self, source: str, con):
        self.source = source
        self.con = con

    def run(self, path: str) -> Result:
        """Read path and upsert every data row. The first row must be a header."""
        # newline='' lets the csv module handle line endings within quoted cells;
        # strict=True makes an unterminated quote a hard parse error (mirroring Go's
        # encoding/csv with LazyQuotes off) instead of silently swallowing the file.
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f, strict=True)
            try:
                header = next(reader)
            except StopIteration:
                raise ValueError("read header: empty file")
            except csv.Error as e:
                raise ValueError(f"read header: {e}")
            # Crunchbase exports are UTF-8 with a leading BOM. Strip it from the
            # first header cell so "Organization Name" still matches its alias.
            if header:
                header[0] = header[0].removeprefix("\ufeff")
            idx = index_header(header)
            # Without a name column every row maps to an empty name and is silently
            # skipped — a whole file vanishing while the run still "succeeds". Fail
            # loud so a misnamed export (or a wrong file) is caught.
            if "name" not in idx:
                raise ValueError(f"no recognizable company-name column in header: {header}")

            res = Result()
            while True:
                try:
                    row = next(reader)
                except StopIteration:
                    break
                except csv.Error as e:
                    res.errors.append(str(e))
                    continue
                res.read += 1

                # A repeated header line is metadata, not a company.
                if row_equals_header(header, row):
                    res.skipped += 1
                    continue

                raw = row_as_map(header, row)
                name = pick(idx, row, "name")
                if name == "":
                    res.skipped += 1
                    continue

                raw_json = json.dumps(raw, sort_keys=True, ensure_ascii=False)
                company = Company(
                    source=self.source,
                    source_id=_null_str(pick(idx, row, "source_id")),
                    name=name,
                    domain=_null_str(identity_domain(pick(idx, row, "domain"))),
                    headcount=null_headcount(pick(idx, row, "headcount")),
                    funding_stage=_null_str(pick(idx, row, "funding_stage")),
                    location=_null_str(pick(idx, row, "location")),
                    vertical=_null_str(pick(idx, row, "vertical")),
                    raw_json=raw_json,
                )
                try:
                    out = upsert_with_merge(self.con, company)
                except Exception as e:  # noqa: BLE001 - mirror Go's per-row error capture
                    res.errors.append(str(e))
                    continue
                res.upserted += 1
                if out.merged:
                    res.merged += 1
                if out.collision:
                    res.collisions += 1
                    res.collision_details.append(Collision(
                        domain=company.domain or "",
                        incoming_name=name,
                        overwrote_name=out.prev_name,
                    ))
            return res


@dataclass
class _UpsertOutcome:
    """What a single row's upsert did."""

    id: str = ""
    merged: bool = False  # landed on a company already in the set (re-ingest or folded twin)
    collision: bool = False  # overwrote a domain-keyed row stored under a DIFFERENT name
    prev_name: str = ""  # on a collision, the name the row carried before the overwrite


def upsert_with_merge(con, c: Company) -> _UpsertOutcome:
    """Write c under its deterministic identity key, keeping name/domain twins of
    the same company collapsed onto one row in BOTH arrival orders."""
    domain_key = companies.company_id(c.domain or "", c.name)

    # Arrival WITHOUT a usable domain → keyed by name (domain_key IS the name key).
    if not c.domain:
        ids = companies.domain_keyed_ids_by_name(con, c.name)
        if len(ids) >= 1:
            # Already represented by one or more domain-keyed rows of the same name.
            # Don't add a redundant domain-less row (keeps re-ingest idempotent).
            # Backfill the lone unambiguous match; with several same-name domains we
            # can't attribute it, so just absorb it.
            if len(ids) == 1:
                companies.backfill_company_blanks(con, ids[0], c)
            return _UpsertOutcome(id=ids[0], merged=True)
        exists = companies.company_exists(con, domain_key)
        companies.upsert_company_with_id(con, domain_key, c)
        return _UpsertOutcome(id=domain_key, merged=exists)

    # Arrival WITH a domain → keyed by domain. A name-keyed twin matching the
    # INCOMING name is folded whether the domain row is new OR overwritten.
    existing_name, domain_exists = companies.company_name_by_id(con, domain_key)
    name_key = companies.company_id("", c.name)  # != domain_key: a domain is present
    name_exists = companies.company_exists(con, name_key)
    if name_exists:
        # upsert + fold in ONE transaction so a crash can't leave the row committed
        # with the twin un-folded.
        companies.upsert_and_fold_name(con, domain_key, c, name_key)
    else:
        companies.upsert_company_with_id(con, domain_key, c)
    collision = domain_exists and not same_name(existing_name, c.name)
    prev_name = existing_name if collision else ""
    return _UpsertOutcome(
        id=domain_key,
        merged=domain_exists or name_exists,
        collision=collision,
        prev_name=prev_name,
    )


def same_name(a: str, b: str) -> bool:
    """Compare two company names the way company_id keys them: trimmed and
    case-folded."""
    return a.strip().lower() == b.strip().lower()


@dataclass
class ManualCompany:
    """A single hand-entered company from the web "Add company" modal. website is
    the only required field; the rest are optional and mirror the CSV columns
    (headcount is a free-form string accepting ranges like "11-50")."""

    website: str = ""
    name: str = ""
    headcount: str = ""
    funding_stage: str = ""
    location: str = ""
    vertical: str = ""


class CompanyExists(Exception):
    """Raised by add_manual when a company with the same website (domain) is
    already in the store. Carries the existing row's id so the caller can report
    the duplicate. Manual adds never overwrite — re-running a CSV ingest updates
    in place."""

    def __init__(self, company_id: str):
        super().__init__("company already in the list")
        self.company_id = company_id


def add_manual(con, m: ManualCompany) -> str:
    """Insert one hand-entered company (source "manual"). Normalizes the website
    to a bare domain (the row's identity) and defaults a blank name to that domain.
    Raises CompanyExists (carrying the existing id) if the domain is already
    present — it does NOT overwrite. Validation problems raise ValueError with a
    "website "-prefixed message (the web layer maps it to 400)."""
    domain = normalize_domain(m.website)
    if domain == "":
        raise ValueError("website is required (e.g. acme.com)")
    if not looks_like_domain(domain):
        raise ValueError("website is not a valid domain (e.g. acme.com)")
    if is_aggregator_host(domain):
        raise ValueError("website looks like a social or profile link — enter the company's own domain (e.g. acme.com)")
    name = m.name.strip() or domain
    # Identity is the domain (company_id ignores the name once a domain is present).
    cid = companies.company_id(domain, name)
    if companies.company_exists(con, cid):
        raise CompanyExists(cid)
    # raw_json mirrors the entered fields so the detail pane's raw view shows what
    # was typed, the way a CSV row preserves its cells.
    raw = {"name": name, "website": domain}
    for k, v in {
        "headcount": m.headcount, "funding_stage": m.funding_stage,
        "location": m.location, "vertical": m.vertical,
    }.items():
        s = v.strip()
        if s != "":
            raw[k] = s
    company = Company(
        source="manual",
        name=name,
        domain=_null_str(domain),
        headcount=null_headcount(m.headcount),
        funding_stage=_null_str(m.funding_stage.strip()),
        location=_null_str(m.location.strip()),
        vertical=_null_str(m.vertical.strip()),
        raw_json=json.dumps(raw, sort_keys=True, ensure_ascii=False),
    )
    # Go through the shared merge path so a manual add folds in a pre-existing
    # name-keyed twin, exactly as the CSV path would.
    out = upsert_with_merge(con, company)
    return out.id


def set_company_domain(con, company_id: str, website: str) -> str:
    """Attach or change the website/domain on an existing company. Applies the
    same normalization + rejection rules as add_manual, then re-keys the row onto
    its domain identity. Returns the resulting company id."""
    domain = normalize_domain(website)
    if domain == "":
        raise ValueError("website is required (e.g. acme.com)")
    if not looks_like_domain(domain):
        raise ValueError("website is not a valid domain (e.g. acme.com)")
    if is_aggregator_host(domain):
        raise ValueError("website looks like a social or profile link — enter the company's own domain (e.g. acme.com)")
    return companies.set_company_domain(con, company_id, domain)


def index_header(header: list[str]) -> dict[str, int]:
    """canonical-field -> column index, picking the first alias that matches. A
    duplicated header name resolves to its FIRST occurrence (the primary column)."""
    norm: dict[str, int] = {}
    for i, h in enumerate(header):
        key = normalize(h)
        if key not in norm:  # first occurrence wins
            norm[key] = i
    out: dict[str, int] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for a in aliases:
            i = norm.get(normalize(a))
            if i is not None:
                out[canonical] = i
                break
    return out


def row_as_map(header: list[str], row: list[str]) -> dict[str, str]:
    """Preserve the original cells for raw_json. Duplicate header names get a
    collision-proof " (n)" suffix; cells beyond the header width are kept under
    "__extra_<i>" — so no original cell is ever silently dropped."""
    out: dict[str, str] = {}
    for i, cell in enumerate(row):
        base = header[i] if i < len(header) else f"__extra_{i}"
        key = base
        n = 2
        while key in out:  # disambiguate duplicates until the key is unused
            key = f"{base} ({n})"
            n += 1
        out[key] = cell
    return out


def row_equals_header(header: list[str], row: list[str]) -> bool:
    """Whether row repeats the header line (same length ≥ 2, every cell equal after
    trim+casefold) — metadata, not a company."""
    if len(header) < 2 or len(row) != len(header):
        return False
    return all(normalize(row[i]) == normalize(header[i]) for i in range(len(row)))


def pick(idx: dict[str, int], row: list[str], key: str) -> str:
    col = idx.get(key)
    if col is None or col >= len(row):
        return ""
    return row[col].strip()


def normalize(s: str) -> str:
    return s.strip().lower()


def _index_any(s: str, chars: str) -> int:
    """The first index of any character from chars in s, or -1 (Go's strings.IndexAny)."""
    for i, c in enumerate(s):
        if c in chars:
            return i
    return -1


def normalize_domain(s: str) -> str:
    """Reduce a raw "website" cell to a bare, comparable host: lowercased,
    scheme/userinfo/port stripped, path/query/fragment removed, "www." dropped, and
    leading/trailing dots trimmed."""
    s = s.strip().lower()
    i = s.find("://")  # any scheme, not just http(s)
    if i >= 0:
        s = s[i + 3:]
    s = s.removeprefix("//")  # protocol-relative URL
    i = _index_any(s, "/?#")  # path, query, fragment
    if i >= 0:
        s = s[:i]
    i = s.rfind("@")  # user:pass@host
    if i >= 0:
        s = s[i + 1:]
    i = s.find(":")  # :port
    if i >= 0:
        s = s[:i]
    s = s.removeprefix("www.")  # now operating on the bare authority
    return s.strip(".")  # leading/trailing FQDN dots


def looks_like_domain(host: str) -> bool:
    """Whether host is structurally a registrable hostname: ≥ 2 dot-separated LDH
    labels, no all-numeric final label (rejects IPv4 literals and bare TLDs)."""
    labels = host.split(".")
    if len(labels) < 2:
        return False
    for label in labels:
        if not valid_label(label):
            return False
    if is_all_digits(labels[-1]):
        return False
    return True


def is_all_digits(s: str) -> bool:
    """Whether s is non-empty and entirely ASCII digits."""
    return s != "" and all("0" <= c <= "9" for c in s)


def valid_label(label: str) -> bool:
    """Whether label is a valid DNS label: non-empty, only [a-z0-9-] (host is
    already lowercased), not starting/ending with a hyphen."""
    if label == "" or label[0] == "-" or label[-1] == "-":
        return False
    return all(("a" <= c <= "z") or ("0" <= c <= "9") or c == "-" for c in label)


# aggregator_hosts are shared platforms whose URLs routinely appear in a "website"
# column in place of a company's own site. Their bare host is NOT a company
# identity — routing these to name-keying keeps the rows distinct.
AGGREGATOR_HOSTS = {
    "linkedin.com", "facebook.com", "fb.com",
    "twitter.com", "x.com", "instagram.com",
    "youtube.com", "tiktok.com", "crunchbase.com",
    "angel.co", "wellfound.com", "pitchbook.com",
    "bloomberg.com", "glassdoor.com", "indeed.com",
    "medium.com", "substack.com", "linktr.ee",
    "github.com", "gitlab.com", "github.io",
    "google.com", "sites.google.com", "notion.site",
    "notion.so", "wordpress.com", "blogspot.com",
    "wixsite.com", "weebly.com", "myshopify.com",
    "carrd.co", "bit.ly", "t.co", "goo.gl",
    "tinyurl.com",
    # Share / short-link hosts of the platforms above.
    "youtu.be", "lnkd.in", "fb.me", "t.me",
}


def is_aggregator_host(host: str) -> bool:
    """Whether host is (or sits under) a shared platform that can't serve as a
    company identity. The suffix check catches per-company subdomains like
    "acme.myshopify.com" or "acme.github.io"."""
    if host == "":
        return False
    if host in AGGREGATOR_HOSTS:
        return True
    for base in AGGREGATOR_HOSTS:
        if host.endswith("." + base):
            return True
    return False


def identity_domain(raw: str) -> str:
    """Normalize a raw website cell and return "" when the result can't serve as a
    company's identity — not a structurally valid hostname or a shared aggregator
    host. Ingest treats "" as "no domain" and keys by name."""
    d = normalize_domain(raw)
    if not looks_like_domain(d) or is_aggregator_host(d):
        return ""
    return d


def _null_str(s: str) -> str | None:
    """Empty string → None (SQL NULL); otherwise s. Mirrors Go's nullStr."""
    return s or None


def parse_headcount(s: str) -> int | None:
    """Parse a free-form employee-count string ("250", "11-50", "1,200+") exactly
    like a CSV cell. Exported for the web layer's company-edit form."""
    return null_headcount(s)


def null_headcount(s: str) -> int | None:
    """Parse a free-form employee-count cell into an integer, taking the upper
    bound of a range. Tolerates "11-50", "1,001-5,000", "10001+", dashless ranges
    ("11 to 50" → 50) and magnitude suffixes ("1.5k" → 1500). Scans every numeric
    token and returns the LARGEST. Returns None when no number is present or the
    value overflows int64."""
    s = s.strip()
    if s == "":
        return None
    max_val = -1.0
    found = False
    n = len(s)
    i = 0
    while i < n:
        if not ("0" <= s[i] <= "9"):
            i += 1
            continue
        # Read one number: digits, thousands commas, at most one decimal point.
        dot = False
        num: list[str] = []
        while i < n:
            c = s[i]
            if "0" <= c <= "9":
                num.append(c)
            elif c == ",":  # thousands separator — drop, keep reading
                pass
            elif c == "." and not dot and i + 1 < n and "0" <= s[i + 1] <= "9":
                dot = True
                num.append(".")
            else:
                break
            i += 1
        mult = 1.0
        if i < n:  # optional immediately-adjacent magnitude suffix
            c = s[i].lower()
            if c == "k":
                mult, i = 1e3, i + 1
            elif c == "m":
                mult, i = 1e6, i + 1
            elif c == "b":
                mult, i = 1e9, i + 1
        try:
            f = float("".join(num))
        except ValueError:
            f = None
        if f is not None:
            v = f * mult
            if v > max_val:
                max_val = v
            found = True
    # float(MaxInt64) rounds up to 2^63, so a value rounding to 2^63 must be
    # rejected (it would wrap when cast to int).
    if not found or max_val < 0 or max_val >= float(2**63 - 1):
        return None
    return int(max_val)
