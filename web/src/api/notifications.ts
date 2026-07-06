// Notifications inbox (bell badge + the inbox tab). Polled every 90s to keep the
// badge fresh as the Gmail poller syncs. Expanded in Phase 7.
import { useQuery } from "@tanstack/react-query";
import { getOrNull } from "./client";

export interface NotificationItem {
  id: string;
  kind?: string;
  title?: string;
  body?: string;
  seen?: boolean;
  [k: string]: unknown;
}

export interface FollowupItem {
  posting_id: string;
  [k: string]: unknown;
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
