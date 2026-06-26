"""Deterministic voice/length lint backstops. Port of internal/outreach/voice.go.

These are non-blocking flags surfaced in the review panel — the honesty checker
is the only gate; voice nits are the user's call to fix on review.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LintFinding:
    """One deterministic voice violation in model-written text."""

    code: str = ""
    message: str = ""


# bannedPhrases are AI-isms scout flags in model-written spans. The humanizer
# pass is meant to remove them, but LLM cleanup reintroduces patterns, so this
# deterministic backstop catches what slips through.
BANNED_PHRASES = [
    "excited to", "excited about", "passionate about", "thrilled", "super excited",
    "pick your brain", "huge fan", "resonate", "deeply aligned",
    "hope you're doing well",
    # stating your own interest/preference — the email already is the interest signal
    "caught my attention", "drew my attention", "want to be doing",
    "interested in joining", "enjoy most", "what i love", "love doing",
    # the doctrine's kill list — openings and frames that mark a template email
    "hope this email finds you well", "finds you well",
    "my name is", "i'm writing to", "i am writing to", "i just applied",
    "a leader in", "leader in the",
]


def voice_findings(text: str) -> list[LintFinding]:
    """Flag deterministic voice violations (em dashes, banned phrases) in text.
    Run it on the MODEL-WRITTEN spans (the filled holes) or an edited body —
    never on the subject line, whose em dash is intentional by design."""
    out: list[LintFinding] = []
    if "—" in text:
        out.append(LintFinding(code="em_dash", message="contains an em dash"))
    lower = text.lower()
    for p in BANNED_PHRASES:
        if p in lower:
            out.append(LintFinding(code="banned_phrase", message=f'banned phrase: "{p}"'))
    return out


# lengthFlagAt is the word count above which the rendered email body is flagged —
# a little headroom over the doctrine's ~120-word target so a few words never nag.
LENGTH_FLAG_AT = 130


def length_findings(email: str) -> list[LintFinding]:
    """Flag an over-long email BODY: everything after the first line starting with
    "Subject:" (the subject line itself is not counted; an email with no subject
    line is counted whole). Like voice_findings it is a non-blocking flag, run on
    the RENDERED email — verbatim prose included, since the reader scrolls the
    whole thing."""
    lines = email.split("\n")
    body = lines
    for i, l in enumerate(lines):
        if l.startswith("Subject:"):
            body = lines[i + 1:]
            break
    n = len("\n".join(body).split())
    if n <= LENGTH_FLAG_AT:
        return []
    return [LintFinding(code="too_long", message=f"email body is {n} words (doctrine target ≤120)")]
