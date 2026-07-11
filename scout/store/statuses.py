"""The two user-configurable status vocabularies.

Stored as JSON string arrays in the generic settings table (singletons). They
drive the dropdowns in the jobs view; "none" (empty) is always implicitly
available and is NOT part of either list.

The application axis has protected built-ins: "applied" is a fixed front anchor,
"rejected" and "archived" are fixed terminal anchors, and all are always present
— only the middle stages (screening/interview/offer…) are user-editable.
"archived" is an ordinary status the user sets and filters like any other; its
one special behavior is that a posting in it stops nagging for follow-ups (see
list_job_rows / contacts.followups_due).
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
# "applied" (front) plus "rejected" and "archived" (terminal) are protected
# anchors composed around the user's editable middle — always present, never
# duplicated into the middle.
ARCHIVED_STAGE = "archived"
_STAGE_FRONT = ["applied"]
_STAGE_TERMINAL = ["rejected", ARCHIVED_STAGE]
_RESERVED_STAGES = {"applied", "rejected", ARCHIVED_STAGE}
DEFAULT_APPLICATION_STAGES_MIDDLE = ["screening", "interview", "offer"]
# The effective out-of-the-box vocab, exposed for tests/consumers.
DEFAULT_APPLICATION_STAGES = _STAGE_FRONT + DEFAULT_APPLICATION_STAGES_MIDDLE + _STAGE_TERMINAL


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


def _sanitize_stage_middle(lst: list[str]) -> list[str]:
    """Trim, drop empties/over-long labels, drop the reserved built-ins
    (applied/rejected/archived), de-dupe case-insensitively, preserving order."""
    out: list[str] = []
    seen: set[str] = set()
    for s in lst:
        s = s.strip()
        if s == "" or len(s) > MAX_STATUS_LABEL_LEN:
            continue
        key = s.lower()
        if key in _RESERVED_STAGES or key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _stage_middle(con: sqlite3.Connection) -> list[str]:
    """The user's editable middle stages (between the applied/rejected anchors),
    falling back to the default when unset/unparseable."""
    v = settings.get_setting(con, APPLICATION_STAGES_SETTING)
    if v.strip() == "":
        return list(DEFAULT_APPLICATION_STAGES_MIDDLE)
    try:
        lst = json.loads(v)
    except (json.JSONDecodeError, ValueError):
        return list(DEFAULT_APPLICATION_STAGES_MIDDLE)
    if not isinstance(lst, list) or not all(isinstance(x, str) for x in lst):
        return list(DEFAULT_APPLICATION_STAGES_MIDDLE)
    # Tolerate a legacy full-list value (with the anchors inline) — the sanitizer
    # strips the reserved built-ins back down to the middle.
    return _sanitize_stage_middle(lst)


def application_stages(con: sqlite3.Connection) -> list[str]:
    """The effective application-stage vocab: the protected "applied" anchor, the
    user's middle stages, then the protected "rejected" and "archived" anchors."""
    return _STAGE_FRONT + _stage_middle(con) + _STAGE_TERMINAL


def set_application_stages(con: sqlite3.Connection, lst: list[str]) -> None:
    """Store the editable middle stages. The applied/rejected/archived built-ins
    are stripped (composed back in on read); an empty middle is allowed (the
    pipeline is then just applied → rejected). Errors are prefixed "statuses "
    so the web layer maps them to a 400."""
    middle = _sanitize_stage_middle(lst)
    if len(middle) > MAX_STATUS_LIST_LEN:
        raise ValueError(f"statuses list is too long (max {MAX_STATUS_LIST_LEN})")
    settings.set_setting(con, APPLICATION_STAGES_SETTING, json.dumps(middle))
