"""Port of internal/filter/filter_test.go."""
from scout import filter as flt


def _base() -> flt.Taste:
    t = flt.Taste()
    t.enabled = True
    t.location.remote_ok = True
    return t


def test_disabled_filter_passes_everything():
    # A disabled pre-filter must pass every company so a bulk verdict run scores
    # everything — even a row that an enabled filter would drop.
    t = flt.Taste()
    t.verticals.excluded = ["Law Enforcement"]
    t.location.remote_ok = True
    row = flt.Survivor(id="1", name="Peregrine", vertical="Law Enforcement, GovTech")

    t.enabled = True
    assert t.evaluate(row) == "vertical_excluded"

    t.enabled = False
    assert t.evaluate(row) == ""


# Vertical matching is whole-tag, not substring: excluding "law" must NOT drop a
# company whose vertical carries the distinct tag "Law Enforcement". Excluding the
# actual tag does. This is the bug the structured form was built to kill.
_ROW = flt.Survivor(id="1", vertical="Law Enforcement, GovTech")


def test_vertical_fragment_does_not_match():
    t = _base()
    t.verticals.excluded = ["law"]
    assert t.evaluate(_ROW) == ""


def test_vertical_whole_tag_matches_case_insensitively():
    t = _base()
    t.verticals.excluded = ["law enforcement"]
    assert t.evaluate(_ROW) == "vertical_excluded"


def test_vertical_allowed_needs_whole_tag():
    t = _base()
    t.verticals.allowed = ["GovTech"]
    assert t.evaluate(_ROW) == ""
    t.verticals.allowed = ["Gov"]  # substring of "GovTech", not a whole tag
    assert t.evaluate(_ROW) == "vertical_not_allowed"


def test_stage_normalization_match():
    # Funding stage matches on the normalized canonical label, so messy raw data
    # and a saved rule converge.
    for raw, rule in [("Pre Seed", "Pre-Seed"), ("series a", "Series A"), ("Seed", "Seed")]:
        t = flt.Taste()
        t.enabled = True
        t.location.remote_ok = True
        t.funding_stage.allowed = [rule]
        assert t.evaluate(flt.Survivor(id="1", stage=raw)) == "", f"stage {raw!r} vs rule {rule!r}"
    # A stage outside the allowed set is dropped.
    t = flt.Taste()
    t.enabled = True
    t.location.remote_ok = True
    t.funding_stage.allowed = ["Seed"]
    assert t.evaluate(flt.Survivor(id="2", stage="Series B")) == "funding_stage"


def test_normalize_stage():
    cases = {
        "Pre Seed": "Pre-Seed", "pre-seed": "Pre-Seed",
        "Seed": "Seed", "SERIES A": "Series A", "series-b": "Series B",
        "Series E": "Series E+", "Growth Equity": "Growth", "IPO": "Public",
        "": "", "Crowdfunding": "Crowdfunding",  # unknown passes through trimmed
    }
    for raw, want in cases.items():
        assert flt.normalize_stage(raw) == want, f"normalize_stage({raw!r})"


def test_parse_taste_enabled_by_default():
    # ParseTaste yields an enabled filter by default (a directly parsed rule set
    # behaves like an active filter; the DB layer sets enabled explicitly).
    t = flt.parse_taste(flt.DEFAULT_TASTE_TOML)
    assert t.enabled
