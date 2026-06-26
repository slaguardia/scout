"""Port of internal/outreach/doctrine_test.go (stage prompt resolution + the warm
Writer default)."""
from __future__ import annotations

from scout.outreach import Engine, stage_by_key
from scout.outreach.prompts import FILL_SYSTEM_DEFAULT
from scout.store import prompt_overrides


def test_stage_prompt_or_default(db):
    rs = stage_by_key("researcher")
    assert rs is not None and rs.default.strip() != ""

    # No DB → compiled-in default.
    assert Engine().stage_prompt("researcher") == rs.default

    e = Engine(con=db)
    assert e.stage_prompt("researcher") == rs.default  # empty override → default

    prompt_overrides.put_prompt_override(db, "researcher", "my own researcher prompt\n")
    assert e.stage_prompt("researcher") == "my own researcher prompt"  # saved (trimmed)

    prompt_overrides.put_prompt_override(db, "researcher", "  \n")
    assert e.stage_prompt("researcher") == rs.default  # blank override → default back


def test_fill_system_default_is_warm_and_self_contained():
    for want in [
        "warm, human cold email",   # the register
        "NEVER invent",             # integrity
        "manufacture a connection", # the anti-fabrication rule
        '{"no_send": true',         # the JSON contract
        '{"fills":',                # the JSON contract
    ]:
        assert want in FILL_SYSTEM_DEFAULT, f"fill default prompt missing {want!r}"
