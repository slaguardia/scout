// Company contacts + the posting's outreach log (per-contact tracking, follow-ups).
import { useQuery } from "@tanstack/react-query";
import { getOrNull, putJSON, postJSON, request } from "./client";
import type { Contact, OutreachLogEntry } from "./types";

export function contactsKey(companyId: string | null) {
  return ["contacts", companyId] as const;
}
export function outreachLogKey(postingId: string | null) {
  return ["outreach-log", postingId] as const;
}

export function useContacts(companyId: string | null) {
  return useQuery({
    queryKey: contactsKey(companyId),
    queryFn: async () => (await getOrNull<Contact[]>(`/api/companies/${companyId}/contacts`)) ?? [],
    enabled: companyId !== null,
  });
}

export function useOutreachLog(postingId: string | null) {
  return useQuery({
    queryKey: outreachLogKey(postingId),
    queryFn: async () => (await getOrNull<OutreachLogEntry[]>(`/api/postings/${postingId}/outreach-log`)) ?? [],
    enabled: postingId !== null,
  });
}

/* ---- mutations ------------------------------------------------------------- */

export function addContact(companyId: string, body: { name: string; role: string; email: string }): Promise<Contact> {
  return postJSON<Contact>(`/api/companies/${companyId}/contacts`, body);
}
export function updateContact(id: string, body: { name: string; role: string; email: string }): Promise<Contact> {
  return putJSON<Contact>(`/api/contacts/${id}`, body);
}
export function deleteContact(id: string): Promise<void> {
  return request<void>(`/api/contacts/${id}`, { method: "DELETE" });
}

export function logOutreach(
  postingId: string,
  body: { contact_id: string; sent_at: string; body: string },
): Promise<OutreachLogEntry> {
  return postJSON<OutreachLogEntry>(`/api/postings/${postingId}/outreach-log`, body);
}

/** PUT full follow-up state (carrying sent_at/body/note unchanged). */
export function putOutreachEntry(id: string, body: Record<string, unknown>): Promise<OutreachLogEntry> {
  return putJSON<OutreachLogEntry>(`/api/outreach-log/${id}`, body);
}

/** Record a manual follow-up nudge: stamp followed-up + re-arm the next reminder. */
export function markFollowedUp(id: string): Promise<OutreachLogEntry> {
  return putJSON<OutreachLogEntry>(`/api/outreach-log/${id}/followed-up`, {});
}

export function deleteOutreachEntry(id: string): Promise<void> {
  return request<void>(`/api/outreach-log/${id}`, { method: "DELETE" });
}

export function sendFollowup(postingId: string, contact_id: string, body: string): Promise<unknown> {
  return postJSON(`/api/postings/${postingId}/send-followup`, { contact_id, body });
}
