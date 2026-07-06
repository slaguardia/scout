// Gmail connection state + reconcile sync. Feeds the contacts manager's tracking
// bar, the draft send controls, and the Settings integrations card.
import { useQuery } from "@tanstack/react-query";
import { getOrNull, postJSON } from "./client";
import type { GmailState } from "./types";

const DEFAULT: GmailState = { connected: false };

export const gmailKey = ["gmail"] as const;

export function useGmail() {
  return useQuery({
    queryKey: gmailKey,
    queryFn: async (): Promise<GmailState> => (await getOrNull<GmailState>("/api/gmail/status")) ?? DEFAULT,
    placeholderData: DEFAULT,
  });
}

/** Reconcile pass — treat Gmail as source of truth; re-add missing sends/replies. */
export function syncGmail(reconcile = true): Promise<unknown> {
  return postJSON(`/api/gmail/sync${reconcile ? "?reconcile=1" : ""}`);
}

/** fmtSyncTime — a stored UTC timestamp → a friendly relative label. */
export function fmtSyncTime(s: string, now: number): string {
  const t = Date.parse(s.replace(" ", "T") + "Z");
  if (isNaN(t)) return s;
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
