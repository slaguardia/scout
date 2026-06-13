-- The pipeline stage an in-flight (researching) draft is currently on —
-- research | fill | humanize | honesty | judge. Powers the staged progress bar
-- in the pursuit panel. Empty once the run reaches a terminal/review status.
ALTER TABLE outreach_drafts ADD COLUMN stage TEXT NOT NULL DEFAULT '';
