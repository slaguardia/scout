// Outreach drafts — the per-posting draft queue + its mutations. The query polls
// every 4s while the newest draft is still researching (fire-and-forget drafting).
import { useQuery } from "@tanstack/react-query";
import { getJSON, putJSON, postJSON, request } from "./client";
import type { Draft } from "./types";

export function draftsKey(postingId: string | null) {
  return ["drafts", postingId] as const;
}

export function useDrafts(postingId: string | null) {
  return useQuery({
    queryKey: draftsKey(postingId),
    queryFn: async () => (await getJSON<{ drafts?: Draft[] }>(`/api/postings/${postingId}/outreach`)).drafts ?? [],
    enabled: postingId !== null,
    refetchInterval: (query) => (query.state.data?.[0]?.status === "researching" ? 4000 : false),
  });
}

/** POST the draft pipeline. Returns the raw Response so the caller can branch on
 *  202 (started) / 409 (active) / 412 (input gate) / 503 (no engine). */
export function startDraftRequest(
  postingId: string,
  opts: { regenerate?: boolean; skipResearch?: boolean } = {},
): Promise<Response> {
  const params = new URLSearchParams();
  if (opts.regenerate) params.set("regenerate", "1");
  if (opts.skipResearch) params.set("research", "0");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return fetch(`/api/postings/${postingId}/outreach${qs}`, { method: "POST" });
}

export function cancelDraft(id: string): Promise<unknown> {
  return postJSON(`/api/outreach/drafts/${id}/cancel`);
}

export function deleteDraft(id: string): Promise<void> {
  return request<void>(`/api/outreach/drafts/${id}`, { method: "DELETE" });
}

export function saveDraftEdit(id: string, edited: string): Promise<Draft> {
  return putJSON<Draft>(`/api/outreach/drafts/${id}`, { edited });
}

export function sendDraftGmail(id: string, contact_id: string): Promise<{ to?: string }> {
  return postJSON<{ to?: string }>(`/api/outreach/drafts/${id}/send-gmail`, { contact_id: contact_id || "" });
}

export function markDraftSent(id: string, contact_id: string): Promise<unknown> {
  return postJSON(`/api/outreach/drafts/${id}/sent`, { contact_id: contact_id || "" });
}
