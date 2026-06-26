-- Change-aware criteria cache (FEAT-20260609_204543-5a0c): store the brain's
-- opaque change cursor and a verified_at stamp beside the cached brief, so the
-- resolver's cost cascade can tell "confirmed current as of T" apart from
-- "written at T" and skip work when nothing moved.
--
-- cursor    : the brain's opaque /changes stamp at the last confirmed-current
--             check (compare for equality only; never parse). DEFAULT '' so a
--             pre-existing row reads as "no cursor yet" → cold path on next resolve.
-- verified_at: when the brief was last CONFIRMED current against the brain
--             (a fresh distill, a Tier 0 no-op, or a Tier 1 basis match). NULL on
--             a pre-existing row so it reads as never-verified (sentinel age -1).
ALTER TABLE brain_profile_cache ADD COLUMN cursor TEXT NOT NULL DEFAULT '';
ALTER TABLE brain_profile_cache ADD COLUMN verified_at TEXT;
