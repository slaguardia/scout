-- Whether this draft skipped the web-research stage (the "skip research" control).
-- Persisted so the pursuit panel's progress bar can drop the Research node across
-- polls/reloads, and so a draft records how it was produced. 0 = ran/will run
-- research, 1 = skipped (drafted from on-file info only).
ALTER TABLE outreach_drafts ADD COLUMN skip_research INTEGER NOT NULL DEFAULT 0;
