"""Port of internal/store/brain_profile_test.go."""
from scout.store import brain_profile
from scout.store import db as db_module


def test_brain_profile_put_get_touch(db):
    url = "http://brain.test"

    brain_profile.put_brain_profile(db, url, "BODY ONE", "hash-1", "cursor-A")
    cp = brain_profile.get_brain_profile(db, url)
    assert cp is not None
    assert cp.body == "BODY ONE" and cp.content_hash == "hash-1" and cp.cursor == "cursor-A"
    assert cp.verified_at != ""
    assert cp.verified_age_seconds >= 0
    fetched_at = cp.fetched_at

    brain_profile.touch_brain_profile(db, url, "cursor-B")
    cp2 = brain_profile.get_brain_profile(db, url)
    assert cp2 is not None
    assert cp2.cursor == "cursor-B"
    assert cp2.body == "BODY ONE" and cp2.content_hash == "hash-1"
    assert cp2.fetched_at == fetched_at


def test_touch_missing_row_no_op(db):
    brain_profile.touch_brain_profile(db, "http://nobody.test", "cursor-X")
    assert brain_profile.get_brain_profile(db, "http://nobody.test") is None


def test_pre_migration_row_reads_never_verified(db):
    url = "http://legacy.test"
    db.execute(
        "INSERT INTO brain_profile_cache (source_url, body, content_hash, fetched_at) "
        "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        (url, "LEGACY BODY", "legacy-hash"),
    )
    cp = brain_profile.get_brain_profile(db, url)
    assert cp is not None
    assert cp.cursor == ""
    assert cp.verified_at == ""
    assert cp.verified_age_seconds == -1


def test_migration_0037_applies_to_pre_existing_table(db):
    url = "http://preexisting.test"
    brain_profile.put_brain_profile(db, url, "OLD BODY", "old-hash", "old-cursor")
    for stmt in (
        "ALTER TABLE brain_profile_cache DROP COLUMN cursor",
        "ALTER TABLE brain_profile_cache DROP COLUMN verified_at",
        "DELETE FROM schema_migrations WHERE name = '0037_brain_profile_cursor.sql'",
    ):
        db.execute(stmt)
    # Re-run migrations: 0037 must ALTER the now-populated table cleanly.
    db_module._migrate(db)
    cp = brain_profile.get_brain_profile(db, url)
    assert cp is not None
    assert cp.body == "OLD BODY" and cp.content_hash == "old-hash"
    assert cp.cursor == "" and cp.verified_at == "" and cp.verified_age_seconds == -1
