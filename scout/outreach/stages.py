"""The editable pipeline stage registry.

The outreach pipeline is four LLM stages, each driven by a system prompt. Each
stage's prompt is fully editable from the dashboard (stored per-stage in the
`prompt_overrides` table); an empty/absent override falls back to the compiled-in
default. A bad edit is recoverable with reset-to-default.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from scout.store import prompt_overrides

from .prompts import (
    FILL_SYSTEM_DEFAULT,
    HONESTY_CHECKER_SYSTEM,
    HUMANIZE_SYSTEM,
    RESEARCHER_SYSTEM,
)


@dataclass
class Stage:
    """One editable pipeline stage for the dashboard. default is the compiled-in
    default prompt (not listed; fetched per-stage)."""

    stage: str = ""  # json: "stage"
    title: str = ""
    description: str = ""
    default: str = ""  # json:"-" — compiled-in default prompt


def stages() -> list[Stage]:
    """The pipeline in execution order. title/description drive the dashboard
    "Pipeline" view; default is the compiled-in prompt each stage uses until the
    user saves an override."""
    return [
        Stage(
            "researcher",
            "Researcher",
            "Searches the web for true company facts and the best referenceable hooks to open with.",
            RESEARCHER_SYSTEM,
        ),
        Stage(
            "fill",
            "Writer",
            "Writes the email's blanks from the research, your experience, and your voice.",
            FILL_SYSTEM_DEFAULT,
        ),
        Stage(
            "humanizer",
            "Humanizer",
            "Strips AI tells and matches your voice — never changes a fact.",
            HUMANIZE_SYSTEM,
        ),
        Stage(
            "honesty",
            "Honesty check",
            "Vetoes any claim about you beyond your documented experience.",
            HONESTY_CHECKER_SYSTEM,
        ),
    ]


def stage_by_key(key: str) -> Stage | None:
    """Look up a stage by its key, or None when unknown."""
    for s in stages():
        if s.stage == key:
            return s
    return None


class _StagesMixin:
    """Engine methods that resolve a stage's editable prompt + on/off flag. Mixed
    into Engine (which provides self.con)."""

    con: sqlite3.Connection | None

    def stage_prompt(self, key: str) -> str:
        """Resolve a stage's system prompt: the user's saved override if present,
        else the compiled-in default. Never blocks a draft on a read error."""
        if self.con is not None:
            try:
                content, _ = prompt_overrides.get_stage(self.con, key)
                if content.strip() != "":
                    return content.strip()
            except Exception:  # noqa: BLE001 - a read error falls back to the default
                pass
        s = stage_by_key(key)
        if s is not None:
            return s.default
        return ""

    def stage_enabled(self, key: str) -> bool:
        """Whether a stage should run. The Writer (fill) is never skippable; every
        other stage is on unless the user toggled it off. A read error defaults to
        on (never silently skip work)."""
        if key == "fill":
            return True
        if self.con is not None:
            try:
                _, enabled = prompt_overrides.get_stage(self.con, key)
                return enabled
            except Exception:  # noqa: BLE001 - default to on
                pass
        return True
