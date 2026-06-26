-- scout schema, M54
-- Deleting a detected application question is now a hard delete, so a later
-- re-detect can bring the question back (the old soft delete flipped status to
-- 'dismissed' and was sticky across re-detection). Purge any rows still parked
-- in that state so they no longer hide the question and a re-detect resurfaces
-- it; their answer/edited text was already cleared when they were dismissed.
DELETE FROM posting_answers WHERE status = 'dismissed';
