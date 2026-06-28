-- Fold the outreach + follow-up signatures into their body fields. The signature
-- is no longer a separate concept — it lives at the bottom of the body. Any saved
-- signature is appended so nothing is lost, then the now-merged rows + the
-- "same as email signature" flag are dropped. Runs once; a fresh install (no
-- 'signature'/'followup' rows) is a no-op.

-- outreach: append the saved email signature to the email body
UPDATE outreach_template
SET content = RTRIM(content) || char(10) || char(10)
            || TRIM((SELECT content FROM outreach_template WHERE key = 'signature'))
WHERE key = 'default'
  AND TRIM(COALESCE((SELECT content FROM outreach_template WHERE key = 'signature'), '')) <> '';

-- follow-up: append the resolved sign-off (its own field, or the email signature
-- when "same" was ticked) to the follow-up body
UPDATE outreach_template
SET content = RTRIM(content) || char(10) || char(10) || TRIM(
      CASE WHEN COALESCE((SELECT value FROM settings WHERE key = 'followup_signature_same'), '') = '1'
           THEN COALESCE((SELECT content FROM outreach_template WHERE key = 'signature'), '')
           ELSE COALESCE((SELECT content FROM outreach_template WHERE key = 'followup_signature'), '')
      END)
WHERE key = 'followup'
  AND TRIM(
      CASE WHEN COALESCE((SELECT value FROM settings WHERE key = 'followup_signature_same'), '') = '1'
           THEN COALESCE((SELECT content FROM outreach_template WHERE key = 'signature'), '')
           ELSE COALESCE((SELECT content FROM outreach_template WHERE key = 'followup_signature'), '')
      END) <> '';

DELETE FROM outreach_template WHERE key IN ('signature', 'followup_signature');
DELETE FROM settings WHERE key = 'followup_signature_same';
