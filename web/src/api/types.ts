// Shared API payload types. Grown per phase as each view is ported — a field
// appears here the moment the React code that reads it is written, so the two
// stay in lockstep and `tsc --noEmit` stays meaningful.

/** A row in the companies table (GET /api/companies). */
export interface Company {
  company_id: string;
  name: string;
  verdict?: string | null;
  reason?: string | null;
  vertical?: string | null;
  location?: string | null;
  headcount?: number | null;
  stage?: string | null;
  reviewed_at?: string | null;
  website_url?: string | null;
  flagged?: boolean;
  enriched?: boolean;
}

/** A saved job posting / application-tracker row (GET /api/postings). Expanded in Phase 4. */
export interface Posting {
  posting_id: string;
  company_id: string;
  company: string;
  title?: string | null;
  url?: string | null;
  verdict?: string | null;
  application_status?: string | null;
  outreach_status?: string | null;
  next_up?: boolean;
  followups_due?: number | null;
  last_outreach_at?: string | null;
  contacts?: string | null;
  description?: string | null;
  location?: string | null;
  created_at?: string | null;
  outreach_draft_status?: string | null;
}

/** A company-level contact (GET /api/companies/{id}/contacts). Expanded in Phase 4b. */
export interface Contact {
  id: string;
  name?: string | null;
  role?: string | null;
  email?: string | null;
  [k: string]: unknown;
}

/** An outreach-log entry (GET /api/postings/{id}/outreach-log). Expanded in Phase 4b. */
export interface OutreachLogEntry {
  id: string;
  contact_id?: string | null;
  sent_at?: string | null;
  body?: string | null;
  [k: string]: unknown;
}

/** Configurable status vocabularies + follow-up config, loaded at boot. */
export interface StatusVocab {
  applicationStages: string[];
  outreachStatuses: string[];
  followupInterval: number;
  followupTemplate: string;
}
