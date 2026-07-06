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
  notes?: string | null;
  application_status_at?: string | null;
  outreach_count?: number | null;
  comp_range?: string | null;
  employment_type?: string | null;
  workplace_type?: string | null;
  department?: string | null;
  posted_at?: string | null;
  questions_status?: string | null;
}

/** A company-level contact (GET /api/companies/{id}/contacts). */
export interface Contact {
  id: string;
  name?: string | null;
  role?: string | null;
  email?: string | null;
}

/** An outreach-log entry (GET /api/postings/{id}/outreach-log). */
export interface OutreachLogEntry {
  id: string;
  contact_id?: string | null;
  sent_at?: string | null;
  body?: string | null;
  note?: string | null;
  followup_due_at?: string | null;
  followup_done_at?: string | null;
  gmail_thread_id?: string | null;
  gmail_message_id?: string | null;
}

/** An outreach draft (GET /api/postings/{id}/outreach). */
export interface Draft {
  id: string;
  status: string; // researching | awaiting_review | no_hook | needs_work | failed | superseded | sent
  stage?: string | null;
  skip_research?: boolean;
  draft?: string | null;
  edited?: string | null;
  hook?: string | null; // JSON
  research?: string | null; // JSON
  lint?: string | null; // JSON
  violations?: string | null; // JSON
  fail_reason?: string | null;
  sent_at?: string | null;
}

/** An application answer (GET /api/postings/{id}/answers). */
export interface Answer {
  id: string;
  prompt: string;
  status: string; // ready | needs_review | failed | generating | (blank = not drafted)
  answer?: string | null;
  edited?: string | null;
  max_length?: number | null;
  fail_reason?: string | null;
}

/** Gmail connection state (GET /api/gmail/status). */
export interface GmailState {
  connected: boolean;
  email?: string | null;
  configured?: boolean;
  autoflip?: boolean;
  last_sync_at?: string | null;
}

/** A posting summary as it appears in a company detail's postings list. */
export interface PostingSummary {
  id: string;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  source?: string | null;
  created_at?: string | null;
  application_status?: string | null;
  next_up?: boolean;
  outreach_count?: number | null;
  last_outreach_at?: string | null;
}

/** Full company detail (GET /api/companies/{id}). */
export interface CompanyDetail {
  company_id: string;
  name?: string | null;
  verdict?: string | null;
  has_verdict?: boolean;
  reason?: string | null;
  model?: string | null;
  taste_version?: string | null;
  scored_at?: string | null;
  fetch_status?: string | null;
  fetch_error?: string | null;
  has_enrichment?: boolean;
  website_url?: string | null;
  fetched_at?: string | null;
  domain?: string | null;
  raw_json?: Record<string, unknown> | null;
  flagged?: boolean;
  reviewed_at?: string | null;
  notes?: string | null;
  vertical?: string | null;
  location?: string | null;
  headcount?: number | string | null;
  funding_stage?: string | null;
  source?: string | null;
  source_id?: string | null;
  ingested_at?: string | null;
  postings?: PostingSummary[];
}

/** A decision-trail event (GET /api/companies/{id}/trace). */
export interface TraceEvent {
  verdict?: string | null;
  reason?: string | null;
  model?: string | null;
  scored_at?: string | null;
  criteria_source?: string | null;
  taste_version?: string | null;
  run_id?: string | null;
}

/** Configurable status vocabularies + follow-up config, loaded at boot. */
export interface StatusVocab {
  applicationStages: string[];
  outreachStatuses: string[];
  followupInterval: number;
  followupTemplate: string;
}
