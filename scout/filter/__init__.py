"""Package filter applies the pre-filter rules against the companies table. Port
of internal/filter/filter.go.

The rules live in the DB as a singleton (edited from the dashboard); this package
parses the raw TOML and evaluates it. The compiled-in default is used until the
user saves their own.
"""
from __future__ import annotations

import sqlite3
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from scout.store import companies, taste_filter

# DEFAULT_TASTE_TOML is the compiled-in starting pre-filter, used until the user
# saves their own from the dashboard. Kept as a reviewable TOML file so the
# default is a single source of truth.
DEFAULT_TASTE_TOML = (Path(__file__).parent / "taste_default.toml").read_text(encoding="utf-8")


@dataclass
class Location:
    allowed: list[str] = field(default_factory=list)
    remote_ok: bool = False


@dataclass
class Headcount:
    min: int = 0
    max: int = 0


@dataclass
class Verticals:
    allowed: list[str] = field(default_factory=list)
    excluded: list[str] = field(default_factory=list)


@dataclass
class FundingStage:
    allowed: list[str] = field(default_factory=list)


@dataclass
class Taste:
    """The structured pre-filter rule set (parsed from the singleton's TOML)."""

    location: Location = field(default_factory=Location)
    headcount: Headcount = field(default_factory=Headcount)
    verticals: Verticals = field(default_factory=Verticals)
    funding_stage: FundingStage = field(default_factory=FundingStage)

    # enabled is the master on/off switch, set from the DB (not the TOML) — a
    # disabled filter passes every company. A directly constructed zero Taste is
    # disabled (matches Go's zero value); parse_taste / taste_from_db set it.
    enabled: bool = False

    def apply(self, con: sqlite3.Connection) -> "Result":
        """Run the rules and return survivors, plus a breakdown of why rows dropped."""
        total = companies.count_companies(con)

        # Pull all rows, evaluate in Python. SQLite-side filtering would be faster,
        # but we want per-reason drop counts for visibility and the row counts here
        # are small (low thousands).
        rows = con.execute(
            """
SELECT id, name, COALESCE(domain,''), COALESCE(location,''), COALESCE(vertical,''),
       COALESCE(headcount, 0), COALESCE(funding_stage,'')
FROM companies"""
        ).fetchall()

        res = Result(total=total)
        for r in rows:
            s = Survivor(id=r[0], name=r[1], domain=r[2], location=r[3],
                         vertical=r[4], headcount=r[5], stage=r[6])
            reason = self.evaluate(s)
            if reason != "":
                res.dropped_by[reason] = res.dropped_by.get(reason, 0) + 1
                continue
            res.survivors.append(s)
        return res

    def evaluate(self, s: "Survivor") -> str:
        """Return "" if the row passes, or the reason it was dropped."""
        # Master switch: a disabled pre-filter passes everything, so a bulk verdict
        # run scores every company.
        if not self.enabled:
            return ""

        loc = s.location.lower()

        # Location — substring match is correct here: a free-form location string
        # ("San Francisco, CA") should match the rule "san francisco".
        if not self.location_ok(loc):
            return "location"

        # Headcount (only checked when we have a value)
        if s.headcount > 0:
            if self.headcount.min > 0 and s.headcount < self.headcount.min:
                return "headcount_min"
            if self.headcount.max > 0 and s.headcount > self.headcount.max:
                return "headcount_max"

        # Verticals — the field is a comma-separated tag set ("Artificial
        # Intelligence (AI), Software"), so we match whole tags, not substrings of
        # the joined string. That's the difference between excluding the tag "Law"
        # and accidentally nuking "Law Enforcement" (a distinct tag).
        tags = _vertical_tags(s.vertical)

        # Excluded verticals (hard reject): any company tag equal to an excluded term.
        for ex in self.verticals.excluded:
            ex = ex.strip().lower()
            if ex != "" and ex in tags:
                return "vertical_excluded"

        # Allowed verticals (if specified): at least one tag must match.
        if len(self.verticals.allowed) > 0:
            ok = False
            for a in self.verticals.allowed:
                a = a.strip().lower()
                if a != "" and a in tags:
                    ok = True
                    break
            if not ok:
                return "vertical_not_allowed"

        # Funding stage — match on the normalized canonical label so "Pre Seed",
        # "pre-seed", and the rule "Pre-Seed" all line up.
        if len(self.funding_stage.allowed) > 0:
            stage = normalize_stage(s.stage)
            ok = False
            for a in self.funding_stage.allowed:
                if stage != "" and normalize_stage(a) == stage:
                    ok = True
                    break
            if not ok:
                return "funding_stage"

        return ""

    def location_ok(self, loc: str) -> bool:
        if loc == "":
            # No location data — pass only if remote_ok (we can't verify, give
            # benefit of the doubt).
            return self.location.remote_ok
        for a in self.location.allowed:
            if a != "" and a.lower() in loc:
                return True
        return False


@dataclass
class Survivor:
    """The projection returned for triage."""

    id: str = ""
    name: str = ""
    domain: str = ""
    location: str = ""
    vertical: str = ""
    headcount: int = 0
    stage: str = ""


@dataclass
class Result:
    """Apply's outcome: survivors plus a per-reason drop breakdown."""

    total: int = 0
    survivors: list[Survivor] = field(default_factory=list)
    dropped_by: dict[str, int] = field(default_factory=dict)  # reason -> count


def _toml_str(s: str) -> str:
    """Encode one string as a TOML basic string (quoted, backslash/quote/newline
    escaped)."""
    s = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return '"' + s + '"'


def _toml_list(xs: list[str]) -> str:
    return "[" + ", ".join(_toml_str(x) for x in xs) + "]"


def encode_toml(t: Taste) -> str:
    """Serialize a Taste's rules back to canonical TOML (the inverse of
    parse_taste; the master `enabled` switch lives in the DB, not the TOML). Port
    of Go's (*Taste).EncodeTOML — round-trips through parse_taste."""
    lines = [
        "[location]",
        f"allowed = {_toml_list(t.location.allowed)}",
        f"remote_ok = {'true' if t.location.remote_ok else 'false'}",
        "",
        "[headcount]",
        f"min = {int(t.headcount.min)}",
        f"max = {int(t.headcount.max)}",
        "",
        "[verticals]",
        f"allowed = {_toml_list(t.verticals.allowed)}",
        f"excluded = {_toml_list(t.verticals.excluded)}",
        "",
        "[funding_stage]",
        f"allowed = {_toml_list(t.funding_stage.allowed)}",
        "",
    ]
    return "\n".join(lines)


def parse_taste(content: str) -> Taste:
    """Parse pre-filter rules from raw TOML text. A blank string yields a zero
    Taste (everything passes the verticals/stage rules; headcount bounds at 0 mean
    "no bound") — callers wanting the default should pass DEFAULT_TASTE_TOML. The
    returned filter is enabled; callers gate that separately (see taste_from_db)."""
    data = tomllib.loads(content)
    loc = data.get("location") or {}
    hc = data.get("headcount") or {}
    vert = data.get("verticals") or {}
    fund = data.get("funding_stage") or {}
    t = Taste(
        location=Location(allowed=list(loc.get("allowed") or []), remote_ok=bool(loc.get("remote_ok", False))),
        headcount=Headcount(min=int(hc.get("min", 0)), max=int(hc.get("max", 0))),
        verticals=Verticals(allowed=list(vert.get("allowed") or []), excluded=list(vert.get("excluded") or [])),
        funding_stage=FundingStage(allowed=list(fund.get("allowed") or [])),
    )
    t.enabled = True
    return t


def taste_from_db(con: sqlite3.Connection | None) -> Taste:
    """Load the saved pre-filter rules from the singleton row, falling back to the
    compiled-in default when none is saved (or on a read error — a run shouldn't
    break because the rules row is missing). It also carries the enabled flag: a
    disabled filter still parses, but apply passes everything. This is the
    canonical way to obtain the active filter; there is no longer a file on disk."""
    content, enabled = DEFAULT_TASTE_TOML, True
    if con is not None:
        try:
            c, en = taste_filter.get_taste_filter(con)
            enabled = en
            if c.strip() != "":
                content = c
        except Exception:  # noqa: BLE001 - a read failure falls back to the default
            pass
    t = parse_taste(content)
    t.enabled = enabled
    return t


def _vertical_tags(s: str) -> list[str]:
    """Split a company's comma-separated vertical field into normalized
    (lowercased, trimmed) tags. Empty fragments are dropped."""
    out = []
    for p in s.split(","):
        p = p.strip().lower()
        if p != "":
            out.append(p)
    return out


# CANONICAL_STAGES is the normalized funding-stage vocabulary, ordered earliest to
# latest. The dashboard's stage multi-select offers these; matching compares the
# canonical labels (see normalize_stage), so raw data like "Pre Seed" and a saved
# rule "Pre-Seed" line up.
CANONICAL_STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E+", "Growth", "Public"]


def normalize_stage(raw: str) -> str:
    """Map a raw funding-stage string to one of CANONICAL_STAGES. An unrecognized
    non-empty value is returned trimmed (so unusual stages stay selectable and
    matchable); a blank value normalizes to ""."""
    k = raw.lower().translate(str.maketrans("", "", " -._"))
    if k == "":
        return ""
    if k in ("preseed", "pre"):
        return "Pre-Seed"
    if k == "seed":
        return "Seed"
    if k in ("seriesa", "a"):
        return "Series A"
    if k in ("seriesb", "b"):
        return "Series B"
    if k in ("seriesc", "c"):
        return "Series C"
    if k in ("seriesd", "d"):
        return "Series D"
    if k in ("seriese", "e", "seriesf", "f", "seriesg", "g"):
        return "Series E+"
    if "growth" in k or "late" in k:
        return "Growth"
    if "ipo" in k or "public" in k:
        return "Public"
    return raw.strip()
