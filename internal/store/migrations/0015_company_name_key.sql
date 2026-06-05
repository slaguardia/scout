-- scout schema, name_key for Unicode-correct name dedup
-- The reverse fold (a domain-less arrival recognized as a duplicate of an
-- existing domain-keyed company with the same name) needs to match names with
-- the SAME case-folding the primary key uses — Go's full-Unicode strings.ToLower.
-- SQLite's built-in lower() folds ASCII only, so matching in SQL silently misses
-- accented / non-Latin names ("Évora", "İstanbul", Cyrillic/Greek). Store a
-- Go-folded identity name and match on it.
--
-- The backfill uses SQLite lower() (ASCII-only) as a best effort for any rows
-- already present; scout.db is a disposable working set, so a re-ingest
-- repopulates name_key correctly via the Go path (see store.normName).

ALTER TABLE companies ADD COLUMN name_key TEXT;
UPDATE companies SET name_key = lower(trim(name));
CREATE INDEX IF NOT EXISTS idx_companies_name_key ON companies(name_key);
