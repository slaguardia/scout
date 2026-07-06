// Posting mutations — the application-tracker lifecycle (next-up, stage/status/
// notes) shared by the jobs-row inline controls and the pursuit pane. Expanded in
// Phase 4 with details/url/company/recapture/delete.
import { putJSON } from "./client";
import type { Posting } from "./types";

export function putNextUp(id: string, next_up: boolean): Promise<Posting> {
  return putJSON<Posting>(`/api/postings/${id}/next-up`, { next_up });
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
