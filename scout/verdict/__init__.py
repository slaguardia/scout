"""scout.verdict — the verdict engine (port of internal/verdict).

Public surface (imported by the web/CLI run paths):
    Scorer  — the run driver: Scorer(con=, taste=, filter=, client=, ...).run() -> Result
    Result  — run summary (scored/skipped/failed/by_verdict + cache token totals)
    build_system_prompt, build_user_prompt, parse_verdict  — prompt + parse helpers
"""
from .verdict import (
    BUILTIN_RUBRIC,
    HARD_CONTRACT,
    HARD_GATE_RUBRIC,
    Result,
    Scorer,
    build_system_prompt,
    build_user_prompt,
    parse_verdict,
)

__all__ = [
    "BUILTIN_RUBRIC",
    "HARD_CONTRACT",
    "HARD_GATE_RUBRIC",
    "Result",
    "Scorer",
    "build_system_prompt",
    "build_user_prompt",
    "parse_verdict",
]
