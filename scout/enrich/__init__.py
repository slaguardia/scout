"""scout.enrich — about-page fetch + summary, with an optional fact-extraction
pass (port of internal/enrich).

Public surface (imported by the web/CLI run paths and the capture flow):
    Enricher           — the run driver: Enricher(con=, ...).run(force) -> Result
    Result             — run summary (considered/fetched/ok/failed/skipped/filled)
    new_http_client    — the shared httpx client (timeout + redirect cap)
    fetch_page         — fetch one URL -> (text, final_url, status)  [capture flow]
    fetch_page_html    — fetch_page that also returns the raw body bytes
    vertical_vocab     — vertical-tag steering prompt line (shared with capture)
"""
from .enrich import (
    CANDIDATE_PATHS,
    DEFAULT_TIMEOUT,
    DEFAULT_WORKERS,
    MAX_SUMMARY_RUNES,
    MIN_CONTENT_RUNES,
    Enricher,
    Result,
    extract_text,
    fetch_page,
    fetch_page_html,
    looks_like_challenge,
    looks_like_not_found,
    new_http_client,
    status_for_bad_code,
)
from .facts import FACTS_CONTRACT, name_placeholder, parse_facts, vertical_vocab

__all__ = [
    "CANDIDATE_PATHS",
    "DEFAULT_TIMEOUT",
    "DEFAULT_WORKERS",
    "MAX_SUMMARY_RUNES",
    "MIN_CONTENT_RUNES",
    "Enricher",
    "Result",
    "extract_text",
    "fetch_page",
    "fetch_page_html",
    "looks_like_challenge",
    "looks_like_not_found",
    "new_http_client",
    "status_for_bad_code",
    "FACTS_CONTRACT",
    "name_placeholder",
    "parse_facts",
    "vertical_vocab",
]
