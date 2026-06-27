"""scout.outreach — the outreach + application-answer engine.

The web layer drives it through the Engine class and the module-level discovery
helpers; everything reasons over the brain knowledge bundle cached in
outreach_sources and never writes back to the brain.
"""

from __future__ import annotations

from .answers import ANSWER_SYSTEM, AnswerContext, answer_length_guide
from .discover import (
    DISCOVERY_SYSTEM,
    KNOWLEDGE_NEEDS,
    DiscoveryResult,
    ErrNoExperience,
    Need,
    NeedResult,
    SourcePage,
    discover,
    ensure_knowledge,
)
from .engine import Engine
from .jdfetch import JD_MAX_CHARS, JDResult, fetch_jd, strip_tags, trunc
from .prompts import (
    FILL_SYSTEM_DEFAULT,
    HONESTY_CHECKER_SYSTEM,
    HUMANIZE_SYSTEM,
    RESEARCHER_SYSTEM,
)
from .stages import Stage, stage_by_key, stages
from .template import (
    DEFAULT_FOLLOWUP_TEMPLATE,
    DEFAULT_TEMPLATE,
    Hole,
    Template,
    parse_template,
    template_or_default,
)
from .voice import LintFinding, length_findings, voice_findings

__all__ = [
    "Engine",
    "discover",
    "ensure_knowledge",
    "ErrNoExperience",
    "Need",
    "NeedResult",
    "SourcePage",
    "DiscoveryResult",
    "KNOWLEDGE_NEEDS",
    "DISCOVERY_SYSTEM",
    "Stage",
    "stages",
    "stage_by_key",
    "Template",
    "Hole",
    "parse_template",
    "template_or_default",
    "DEFAULT_TEMPLATE",
    "DEFAULT_FOLLOWUP_TEMPLATE",
    "JDResult",
    "fetch_jd",
    "strip_tags",
    "trunc",
    "JD_MAX_CHARS",
    "voice_findings",
    "length_findings",
    "LintFinding",
    "AnswerContext",
    "answer_length_guide",
    "ANSWER_SYSTEM",
    "RESEARCHER_SYSTEM",
    "FILL_SYSTEM_DEFAULT",
    "HUMANIZE_SYSTEM",
    "HONESTY_CHECKER_SYSTEM",
]
