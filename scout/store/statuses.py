"""The two user-configurable status vocabularies. Port of internal/store/statuses.go.

Stored as JSON string arrays in the generic settings table (singletons). They
drive the dropdowns in the jobs view; "none" (empty) is always implicitly
available and is NOT part of either list.
"""
from __future__ import annotations

import json
import sqlite3

from . import settings

OUTREACH_STATUSES_SETTING = "outreach_statuses"
APPLICATION_STAGES_SETTING = "application_stages"
MAX_STATUS_LIST_LEN = 30  # generous cap; the UI never needs this many
MAX_STATUS_LABEL_LEN = 40

# The reply axis: where a thread of outreach stands.
DEFAULT_OUTREACH_STATUSES = ["initial contact", "no response", "replied", "followed up"]
# The application axis: the furthest pipeline stage reached (ordered progression).
DEFAULT_APPLICATION_STAGES = ["applied", "screening", "interview", "offer", "rejected"]


def _sanitize_status_list(lst: list[str]) -> list[str]:
    """Trim, drop empties + over-long labels, de-dupe case-insensitively (first
    spelling wins), preserving order."""
    out: list[str] = []
    seen: set[str] = set()
    for s in lst:
        s = s.strip()
        if s == "" or len(s) > MAX_STATUS_LABEL_LEN:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _status_list(con: sqlite3.Connection, key: str, default: list[str]) -> list[str]:
    """Read a JSON-array status setting, returning the default when unset or
    unparseable so a corrupt row never empties the dropdowns."""
    v = settings.get_setting(con, key)
    if v.strip() == "":
        return list(default)
    try:
        lst = json.loads(v)
    except (json.JSONDecodeError, ValueError):
        return list(default)
    if not isinstance(lst, list) or not all(isinstance(x, str) for x in lst):
        return list(default)
    cleaned = _sanitize_status_list(lst)
    if not cleaned:
        return list(default)
    return cleaned


def _set_status_list(con: sqlite3.Connection, key: str, lst: list[str]) -> None:
    """Validate and store a status list. Errors are prefixed "statuses " so the
    web layer can map them to a 400."""
    cleaned = _sanitize_status_list(lst)
    if not cleaned:
        raise ValueError("statuses must include at least one label")
    if len(cleaned) > MAX_STATUS_LIST_LEN:
        raise ValueError(f"statuses list is too long (max {MAX_STATUS_LIST_LEN})")
    settings.set_setting(con, key, json.dumps(cleaned))


def outreach_statuses(con: sqlite3.Connection) -> list[str]:
    """The configured outreach-status labels (or the default)."""
    return _status_list(con, OUTREACH_STATUSES_SETTING, DEFAULT_OUTREACH_STATUSES)


def set_outreach_statuses(con: sqlite3.Connection, lst: list[str]) -> None:
    _set_status_list(con, OUTREACH_STATUSES_SETTING, lst)


def application_stages(con: sqlite3.Connection) -> list[str]:
    """The configured application-stage labels (or the default)."""
    return _status_list(con, APPLICATION_STAGES_SETTING, DEFAULT_APPLICATION_STAGES)


def set_application_stages(con: sqlite3.Connection, lst: list[str]) -> None:
    _set_status_list(con, APPLICATION_STAGES_SETTING, lst)
