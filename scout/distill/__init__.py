"""scout.distill — the brain distiller.

Public surface (imported by the criteria resolver in the web/CLI run paths):
    Distiller  — the driver. Phases:
        .gather() -> (chunks, basis)        recall fan-out + dedup, no LLM
        .synthesize(chunks) -> brief        classify → synthesize over gathered chunks
        .run() -> Result                    gather → synthesize (full)
        .distill() -> (brief, basis)        run(), returning just brief + basis
    Result     — brief + chunks + items + basis
    basis_of   — the stable version key over (prompts + chunk content)
    COMPANY_QUESTIONS, DEFAULT_K
"""

from .distill import (
    COMPANY_QUESTIONS,
    DEFAULT_K,
    Distiller,
    Result,
    basis_of,
    chunk_label,
    format_chunks,
)

__all__ = [
    "COMPANY_QUESTIONS",
    "DEFAULT_K",
    "Distiller",
    "Result",
    "basis_of",
    "chunk_label",
    "format_chunks",
]
