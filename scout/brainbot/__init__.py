"""scout.brainbot — read-only HTTP/JSON client for the brain (port of internal/brainbot).

Public surface (imported by distill, outreach):
    Client, new, is_not_found, HTTPError
    Chunk, RecallResult, Doc, MapSource, MapResult, ChangesResult
"""
from .client import (
    ChangesResult,
    Chunk,
    Client,
    Doc,
    HTTPError,
    MapResult,
    MapSource,
    RecallResult,
    is_not_found,
    new,
)

__all__ = [
    "ChangesResult",
    "Chunk",
    "Client",
    "Doc",
    "HTTPError",
    "MapResult",
    "MapSource",
    "RecallResult",
    "is_not_found",
    "new",
]
