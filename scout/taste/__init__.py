"""Package taste loads the criteria block (what the user wants) fed to the verdict
stage.

The primary source is the brain: the distilled company-fit brief, rendered into a
criteria block; see from_brain. A local markdown file (taste.md) is the offline
fallback for when the brain is unreachable; see load_file. version is the first 12
hex chars of sha256(content) — it changes whenever the criteria change (brain
learns something, or the file is edited), which re-scores cached verdicts on the
next run.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass
class Block:
    """The resolved criteria context."""

    text: str = ""  # raw criteria block fed to the LLM
    version: str = ""  # short hash for cache keys
    source: str = ""  # 'brain:brief@<url>' (primary) or 'file:taste.md' (fallback)


def from_brain(text: str, source: str) -> Block:
    """Build a criteria Block from brain-sourced text (the company-fit brief).
    source is a label like "brain:brief@http://127.0.0.1:8100". The text is opaque
    to from_brain."""
    text = text.strip()
    return Block(text=text, version=hash(text), source=source)


def load_file(path: str) -> Block:
    """Read taste from a local file."""
    with open(path, encoding="utf-8") as f:
        text = f.read().strip()
    return Block(text=text, version=hash(text), source="file:" + path)


def hash(s: str) -> str:
    """The canonical taste_version for a piece of text."""
    return hashlib.sha256(s.strip().encode()).hexdigest()[:12]
