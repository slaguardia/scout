"""Fact extraction: an optional one-shot LLM pass over the fetched page text that
fills in company columns still blank after ingest.

Fills the name (when it's just the domain placeholder from a bare "Add by
website"), vertical, location, headcount, and funding stage. Fill-only-blanks: a
value the CSV or the user already supplied is never overwritten. Runs only when
the Enricher has an Anthropic client and the fetch came back "ok".
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from scout import anthropic
from scout.store._helpers import null
from scout.store.companies import (
    Company,
    backfill_company_blanks,
    fill_company_name_placeholder,
    vertical_tags,
)

# The extraction prompt. Like the verdict hard contract, the JSON shape is
# load-bearing — parse_facts depends on it.
FACTS_CONTRACT = """You extract company facts from website text. Reply ONLY with valid JSON, no preamble, no markdown fences, exactly these fields:
  {"name": "", "vertical": "", "location": "", "headcount": 0, "funding_stage": ""}
Rules:
  - name: the company's official name as the site states it. "" if unclear.
  - vertical: 1-3 short industry tags, comma-separated (e.g. "AI, Developer Tools"). "" if unclear.
  - location: HQ city/region if stated (e.g. "San Francisco, CA"). "" if not stated.
  - headcount: integer employee count ONLY if the page states one; otherwise 0. Never guess.
  - funding_stage: e.g. "Seed", "Series A" ONLY if the page states it; otherwise "".
Use "" / 0 for anything the text doesn't actually say. Do not infer from vibes."""


def vertical_vocab(tags: list[str]) -> str:
    """Build the prompt line that steers vertical extraction toward the tags
    already in the set, so captures and enrichment converge on one vocabulary.
    "" when the set is empty — the first tags coined become the vocabulary."""
    if not tags:
        return ""
    return (
        "Existing vertical tags (reuse these exact spellings when they fit; coin a new tag only when none do): "
        + ", ".join(tags)
    )


@dataclass
class _Facts:
    name: str = ""
    vertical: str = ""
    location: str = ""
    headcount: int = 0
    funding_stage: str = ""


_RE_FACTS_JSON = re.compile(r"\{.*\}", re.S)


def parse_facts(s: str) -> _Facts:
    """Parse the extraction JSON, tolerating prose/fences around it. Raises
    ValueError when no valid facts JSON is present. Negative headcount clamps to 0."""
    s = s.strip()
    candidates = [s]
    m = _RE_FACTS_JSON.search(s)
    if m:
        candidates.insert(0, m.group(0))
    for c in candidates:
        f = _facts_from_json(c)
        if f is not None:
            return f
    raise ValueError("no valid facts JSON")


def _facts_from_json(c: str) -> _Facts | None:
    """Strictly parse one candidate JSON object: a type mismatch fails the
    candidate (returns None) rather than coercing the value."""
    try:
        data = json.loads(c)
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    f = _Facts()
    for fld in ("name", "vertical", "location", "funding_stage"):
        if fld in data:
            v = data[fld]
            if not isinstance(v, str):
                return None  # a non-string value for a string field is a hard fail
            setattr(f, fld, v.strip())
    if "headcount" in data:
        hc = data["headcount"]
        if isinstance(hc, bool) or not isinstance(hc, int):
            return None  # headcount must be a real integer; a bool or non-int fails
        f.headcount = hc if hc > 0 else 0
    return f


def name_placeholder(name: str, domain: str) -> bool:
    """Whether the stored name is still the bare-domain default a name-less manual
    add gets (see ingest.add_manual): empty, or exactly the domain (case-insensitive)."""
    return name == "" or name.strip().casefold() == domain.casefold()


def fill_facts(e, t, page_text: str) -> bool:
    """Run the extraction call for one fetched company and write any extracted
    values into the blank columns. Best-effort: an API or parse error is reported
    on the progress stream but never fails the enrichment row. Returns True if
    anything was written."""
    need_name = name_placeholder(t.name, t.domain)
    need_other = t.headcount == 0 or t.funding_stage == "" or t.location == "" or t.vertical == ""
    if (not need_name and not need_other) or page_text == "":
        return False

    # Vocabulary steering: when the vertical is among the blanks, hand the
    # extractor the tags already in the set. Best-effort — a read failure just
    # means no steering.
    user = page_text
    if t.vertical == "":
        try:
            tags = vertical_tags(e.con)
            vocab = vertical_vocab(tags)
            if vocab != "":
                user = vocab + "\n\n" + page_text
        except Exception:  # noqa: BLE001 - steering is best-effort
            pass

    try:
        resp = e.llm.send(
            anthropic.Request(
                model=e.model,
                system=FACTS_CONTRACT,
                max_tokens=256,
                messages=[anthropic.Message("user", user)],
                timeout=30.0,
            )
        )
    except anthropic.AnthropicError as err:
        e.emit(f"facts {t.name} — extract failed: {err}")
        return False
    try:
        f = parse_facts(resp.text())
    except ValueError as err:
        e.emit(f"facts {t.name} — {err}")
        return False

    filled = False
    if need_name and f.name != "":
        try:
            ok = fill_company_name_placeholder(e.con, t.company_id, f.name)
        except Exception as err:  # noqa: BLE001
            e.emit(f"facts {t.name} — name write failed: {err}")
            ok = False
        filled = filled or ok
    if need_other:
        blanks = Company(
            funding_stage=null(f.funding_stage),
            location=null(f.location),
            vertical=null(f.vertical),
            headcount=(f.headcount if f.headcount > 0 else None),
        )
        wrote = (
            (t.headcount == 0 and f.headcount > 0)
            or (t.funding_stage == "" and f.funding_stage != "")
            or (t.location == "" and f.location != "")
            or (t.vertical == "" and f.vertical != "")
        )
        if wrote:
            try:
                backfill_company_blanks(e.con, t.company_id, blanks)
            except Exception as err:  # noqa: BLE001
                e.emit(f"facts {t.name} — backfill failed: {err}")
                wrote = False
        filled = filled or wrote
    return filled
