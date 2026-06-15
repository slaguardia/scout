-- job_postings carried two text columns for "what this posting is": `summary`
-- (M22 — the 1-2 sentence blurb the LLM-capture path wrote) and `description`
-- (M28 — the full posting text the ATS resolver wrote). They were the same slot
-- under two names, filled by the two capture paths, and the consumers were
-- split (outreach + chat read `description`; the card read `summary`). Collapse
-- onto `description` — the full-text field outreach actually needs — and drop
-- `summary`. Preserve any blurb on a row that has no description yet, then drop
-- the column.
UPDATE job_postings SET description = summary
  WHERE (description IS NULL OR description = '')
    AND summary IS NOT NULL AND summary <> '';
ALTER TABLE job_postings DROP COLUMN summary;
