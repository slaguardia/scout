-- The doctrine judge's verdict JSON — depth, proof tier, weaknesses,
-- experience gaps — shown on the draft card. Empty until the judge has run.
ALTER TABLE outreach_drafts ADD COLUMN critique TEXT NOT NULL DEFAULT '';
