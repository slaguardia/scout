"""Store-layer exceptions.

The Go store returns sentinel errors (sql.ErrNoRows, ErrDomainTaken, …) that the
web layer maps to HTTP status codes. Python's idiom is exceptions, so each Go
sentinel becomes a class here. The web layer catches these and sets the status.

Mapping:
    NotFound        ← sql.ErrNoRows          → HTTP 404
    DomainTaken     ← store.ErrDomainTaken    → HTTP 409
    UnknownCompany  ← store.ErrUnknownCompany → HTTP 400
    (plain ValueError, raised with a field-prefixed message, for validation → 400)
"""
from __future__ import annotations


class NotFound(Exception):
    """A row addressed by id does not exist (Go's sql.ErrNoRows)."""


class DomainTaken(Exception):
    """Another company already holds the requested domain identity."""

    def __init__(self, message: str = "another company already uses that website"):
        super().__init__(message)


class UnknownCompany(Exception):
    """An operation targeted a company id that doesn't exist (and won't be created)."""

    def __init__(self, message: str = "company not found"):
        super().__init__(message)
