-- reviewed_at returns — this time as a last-reviewed stamp, not a boolean.
-- Every "Mark reviewed" click updates it to now; the table sorts on it so the
-- user can cycle through companies oldest-reviewed-first instead of always
-- landing on the same ones. NULL = never reviewed (sorts first ascending).
-- Preserved across re-ingest, since UpsertCompany never writes this column.
ALTER TABLE companies ADD COLUMN reviewed_at DATETIME;
