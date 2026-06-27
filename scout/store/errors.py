"""Store-layer exceptions.

Each distinct failure mode is its own exception class; the web layer catches
these and maps them to HTTP status codes.

Mapping:
    NotFound        → HTTP 404
    DomainTaken     → HTTP 409
    UnknownCompany  → HTTP 400
    (plain ValueError, raised with a field-prefixed message, for validation → 400)
"""

from __future__ import annotations


class NotFound(Exception):
    """A row addressed by id does not exist."""


class DomainTaken(Exception):
    """Another company already holds the requested domain identity."""

    def __init__(self, message: str = "another company already uses that website"):
        super().__init__(message)


class UnknownCompany(Exception):
    """An operation targeted a company id that doesn't exist (and won't be created)."""

    def __init__(self, message: str = "company not found"):
        super().__init__(message)
