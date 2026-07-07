// Notifications inbox (bell badge + the inbox tab). Polled every 90s to keep the
// badge fresh as the Gmail poller syncs.
import { useQuery } from "@tanstack/react-query";
import { getOrNull, postJSON, del } from "./client";

export interface NotificationItem {
  id: string;
  kind?: string;
  title: string;
  detail?: string | null;
  company?: string | null;
  role?: string | null;
  created_at?: string | null;
  seen?: boolean;
  suggested_status?: string | null;
  actioned?: boolean;
  posting_id?: string | null;
}

export interface FollowupItem {
  posting_id: string;
  contact_name?: string | null;
  company?: string | null;
  role?: string | null;
  due_at?: string | null;
}

export interface NotificationsData {
  notifications: NotificationItem[];
  unread: number;
  followups: FollowupItem[];
}

const EMPTY: NotificationsData = { notifications: [], unread: 0, followups: [] };

export const notificationsKey = ["notifications"] as const;

export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: async (): Promise<NotificationsData> =>
      (await getOrNull<NotificationsData>("/api/notifications")) ?? EMPTY,
    refetchInterval: 90000,
    placeholderData: EMPTY,
  });
}

export function markNotifSeen(id: string): Promise<unknown> {
  return postJSON(`/api/notifications/${id}/seen`);
}
export function markAllNotifsSeen(): Promise<unknown> {
  return postJSON(`/api/notifications/seen-all`);
}
export function deleteNotif(id: string): Promise<unknown> {
  return del(`/api/notifications/${id}`);
}
export function applyNotif(id: string): Promise<{ applied?: string }> {
  return postJSON<{ applied?: string }>(`/api/notifications/${id}/apply`);
}
export function linkNotif(id: string, posting_id: string): Promise<unknown> {
  return postJSON(`/api/notifications/${id}/link`, { posting_id });
}
export function syncGmailNow(): Promise<unknown> {
  return postJSON(`/api/gmail/sync`);
}
