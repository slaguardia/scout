"""scout.ingest — CSV ingest + dedup-aware company writes (port of internal/ingest).

Public surface (imported by capture, the web layer, and the CLI):
    CSV, Result, Collision               — the CSV ingester and its report
    add_manual, ManualCompany, CompanyExists
    set_company_domain
    ensure_company, CapturedCompany      — the link-capture resolution
    identity_domain                       — shared identity rules for hosts
    parse_headcount                       — free-form employee-count parser
"""
from .capture import CapturedCompany, ensure_company
from .csv import (
    CSV,
    Collision,
    CompanyExists,
    ManualCompany,
    Result,
    add_manual,
    identity_domain,
    parse_headcount,
    set_company_domain,
)

__all__ = [
    "CSV",
    "Collision",
    "CompanyExists",
    "ManualCompany",
    "Result",
    "add_manual",
    "identity_domain",
    "parse_headcount",
    "set_company_domain",
    "CapturedCompany",
    "ensure_company",
]
