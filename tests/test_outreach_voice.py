"""Port of internal/outreach/voice_test.go."""
from __future__ import annotations

from scout.outreach.voice import length_findings, voice_findings


def _codes(fs):
    return {f.code for f in fs}


def test_voice_findings():
    assert len(voice_findings("Plain honest words about the work I did.")) == 0
    assert "em_dash" in _codes(voice_findings("It caught my eye — specifically the framing."))
    assert "banned_phrase" in _codes(voice_findings("I'm excited to chat and pick your brain."))
    # The doctrine kill list.
    for bad in [
        "I hope this email finds you well.",
        "My name is Alex and I work on infra.",
        "I'm writing to ask about the role.",
        "I am writing to follow up.",
        "I just applied for the FDE role.",
        "Acme is a leader in the observability space.",
    ]:
        assert "banned_phrase" in _codes(voice_findings(bad)), f"kill-list phrase not flagged: {bad!r}"


def _words(n: int) -> str:
    return ("word " * n).strip()


def test_length_findings():
    # Under the flag line: nothing.
    assert len(length_findings("Subject: hi\n\n" + _words(120))) == 0
    assert len(length_findings("Subject: hi\n\n" + _words(130))) == 0

    # Over: flagged with the count.
    fs = length_findings("Subject: hi\n\n" + _words(150))
    assert len(fs) == 1 and fs[0].code == "too_long"
    assert fs[0].message == "email body is 150 words (doctrine target ≤120)"

    # The subject line's words don't count: 10 subject words + 125 body words
    # stays under the flag line.
    subject = "Subject: " + _words(9)
    assert len(length_findings(subject + "\n\n" + _words(125))) == 0

    # No subject line: the whole text is the body.
    assert len(length_findings(_words(140))) == 1
