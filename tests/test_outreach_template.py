"""Port of internal/outreach/template_test.go."""
from __future__ import annotations

import pytest

from scout.outreach.template import parse_template


def test_parse_template_holes_and_vars():
    tmpl = ("Subject: [Name] | intro — {{role}}\n\nHi [Name],\n\n"
            "{{hook: one true thing about {{company}} tied to my work}}\n\n"
            "Fixed credentials here.\n\n{{closer: ask about the {{role}} role}}\n\nThanks,\nAlex")
    parsed = parse_template(tmpl)
    vars = {"role": "Backend Engineer", "company": "Acme"}

    holes = parsed.holes(vars)
    assert len(holes) == 2
    assert holes[0].name == "hook"
    assert holes[0].instr == "one true thing about Acme tied to my work"
    assert holes[1].name == "closer"
    assert holes[1].instr == "ask about the Backend Engineer role"

    email = parsed.render(vars, {
        "hook": "I saw you ship into customer environments.",
        "closer": "Open to a quick call about the Backend Engineer role?",
    })
    for w in [
        "Subject: [Name] | intro — Backend Engineer",  # {{role}} var resolved
        "I saw you ship into customer environments.",  # hook filled
        "Fixed credentials here.",                     # verbatim prose untouched
        "Open to a quick call about the Backend Engineer role?",
        "Thanks,\nAlex",
    ]:
        assert w in email, f"rendered email missing {w!r}:\n{email}"
    # The nested {{company}} only lived in an instruction, never the body.
    assert "{{" not in email, f"rendered email still has an unresolved token:\n{email}"


def test_parse_template_unfilled_hole_visible():
    parsed = parse_template("Hi,\n\n{{hook: something}}\n\n{{unknownvar}}")
    # No fill for hook, no value for unknownvar → both left as visible tokens.
    out = parsed.render({}, {})
    assert "{{hook}}" in out and "{{unknownvar}}" in out


def test_parse_template_malformed():
    for bad in [
        "hello {{unterminated",
        "hello {{ : no name}}",
        "hello {{1bad: starts with digit}}",
    ]:
        with pytest.raises(ValueError):
            parse_template(bad)


def test_parse_template_no_holes():
    parsed = parse_template("Hi [Name], applying for {{role}}. Thanks.")
    assert len(parsed.holes(None)) == 0
    assert parsed.render({"role": "SRE"}, None) == "Hi [Name], applying for SRE. Thanks."


def test_render_dewraps_hard_wrapped_prose():
    # A credential paragraph the user pasted hard-wrapped, plus a signature whose
    # short lines must keep their breaks.
    tmpl = ("Hi there,\n\n{{hook: observe}}\n\n"
            "I've spent the past 5 years at Lockheed Martin across a number of roles to help\n"
            "drive customer success. Most recently, I've been embedded with customer teams,\n"
            "leading enterprise deployments and bringing real feedback back to engineering.\n\n"
            "Thanks,\nYour Name")
    parsed = parse_template(tmpl)
    got = parsed.render(None, {"hook": "Nice work on the launch."})

    want = ("Hi there,\n\nNice work on the launch.\n\n"
            "I've spent the past 5 years at Lockheed Martin across a number of roles to help drive "
            "customer success. Most recently, I've been embedded with customer teams, leading enterprise "
            "deployments and bringing real feedback back to engineering.\n\n"
            "Thanks,\nYour Name")
    assert got == want, f"dewrap mismatch:\n got: {got!r}\nwant: {want!r}"
