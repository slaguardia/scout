-- A master on/off switch for the pre-filter, independent of the rules text so
-- toggling it never touches the rules. Disabled means a bulk verdict run scores
-- every company (the gate passes everything); the rules are preserved for when
-- it's re-enabled. Default 1 (on) preserves existing behavior.
ALTER TABLE taste_filter ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
