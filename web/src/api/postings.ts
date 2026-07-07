// Posting mutations — the application-tracker lifecycle (next-up, stage/status/
// notes) shared by the jobs-row inline controls and the pursuit pane. Expanded in
// Phase 4 with details/url/company/recapture/delete.
import { putJSON, postJSON, del } from "./client";
import type { Posting } from "./types";

export function putNextUp(id: string, next_up: boolean): Promise<Posting> {
  return putJSON<Posting>(`/api/postings/${id}/next-up`, { next_up });
}

export function putArchived(id: string, archived: boolean): Promise<Posting> {
  return putJSON<Posting>(`/api/postings/${id}/archive`, { archived });
}

/** PUT the posting's lifecycle (current overlaid with the change); server folds. */
export function putPostingTracking(j: Posting, patch: Record<string, unknown>): Promise<Posting> {
  const body = {
    application_status: j.application_status || "",
    outreach_status: j.outreach_status || "",
    notes: j.notes || "",
    ...patch,
  };
  return putJSON<Posting>(`/api/postings/${j.posting_id}`, body);
}

/** PUT the editable role details (one field changed; server folds the rest). */
export function putPostingDetails(j: Posting, key: string, val: string): Promise<Posting> {
  const body: Record<string, unknown> = {
    title: j.title || "",
    location: j.location || "",
    comp_range: j.comp_range || "",
    employment_type: j.employment_type || "",
    workplace_type: j.workplace_type || "",
    department: j.department || "",
    description: j.description || "",
    [key]: val,
  };
  return putJSON<Posting>(`/api/postings/${j.posting_id}/details`, body);
}

export function putPostingURL(id: string, url: string): Promise<Posting> {
  return putJSON<Posting>(`/api/postings/${id}/url`, { url });
}

export function putPostingCompany(id: string, company_id: string): Promise<Posting & { company_name?: string }> {
  return putJSON<Posting & { company_name?: string }>(`/api/postings/${id}/company`, { company_id });
}

export function recapturePosting(id: string): Promise<Posting> {
  return postJSON<Posting>(`/api/postings/${id}/recapture`);
}

export function deletePosting(id: string): Promise<void> {
  return del<void>(`/api/postings/${id}`);
}
