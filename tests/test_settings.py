"""Port of internal/store/settings_test.go (folds in the earlier smoke test)."""
from scout.store import settings
from scout.store.settings import ANTHROPIC_KEY_SETTING


def test_settings_round_trip(db):
    # Get on an absent key returns "" — not an error.
    assert settings.get_setting(db, ANTHROPIC_KEY_SETTING) == ""

    # Set then Get round-trips.
    settings.set_setting(db, ANTHROPIC_KEY_SETTING, "sk-abc")
    assert settings.get_setting(db, ANTHROPIC_KEY_SETTING) == "sk-abc"

    # Set again upserts (no duplicate-key error, value replaced).
    settings.set_setting(db, ANTHROPIC_KEY_SETTING, "sk-def")
    assert settings.get_setting(db, ANTHROPIC_KEY_SETTING) == "sk-def"

    # Delete removes it; a second delete is a no-op.
    settings.delete_setting(db, ANTHROPIC_KEY_SETTING)
    assert settings.get_setting(db, ANTHROPIC_KEY_SETTING) == ""
    settings.delete_setting(db, ANTHROPIC_KEY_SETTING)
