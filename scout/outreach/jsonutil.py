"""JSON-object extraction shared by the outreach stages (kept in its own module
so both engine.py and discover.py can use it without a cycle)."""

from __future__ import annotations

import json
import re

# reJSONObject matches the outermost {...} — the stages return flat objects, so
# the first-to-last brace is the object (tolerant of fences and surrounding
# prose, like the capture/verdict parsers).
_RE_JSON_OBJECT = re.compile(r"\{.*\}", re.S)


def extract_json_object(s: str) -> str:
    """Return the JSON object embedded in s (after stripping fences/prose) when
    it parses, else raise ValueError."""
    s = s.strip()
    candidates: list[str] = []
    m = _RE_JSON_OBJECT.search(s)
    if m:
        candidates.append(m.group(0))
    candidates.append(s)
    for cand in candidates:
        try:
            probe = json.loads(cand)
        except (ValueError, json.JSONDecodeError):
            continue
        if isinstance(probe, dict):
            return cand
    raise ValueError("no JSON object found")
