"""Tests for scout.taste."""

from scout import taste


def test_from_brain():
    text = "  The user wants AI infra roles.\n\nHard no: crypto, legal tech.  "
    b = taste.from_brain(text, "brain:brief@http://127.0.0.1:8100")
    assert b.text == "The user wants AI infra roles.\n\nHard no: crypto, legal tech."
    assert b.source == "brain:brief@http://127.0.0.1:8100"
    assert b.version == taste.hash(b.text)


def test_from_brain_version_tracks_content():
    # When the brain learns something new, the text changes → version changes →
    # verdicts re-score. This is the intended behavior.
    a = taste.from_brain("criteria v1", "brain")
    b = taste.from_brain("criteria v1 plus a new rule", "brain")
    assert a.version != b.version
