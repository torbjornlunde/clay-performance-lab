import { supabase } from "@/lib/supabase/client";

export type UserNotification = {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown> | null;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
};

export function safeNotificationHref(href: string | null | undefined) {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
  try {
    const url = new URL(href, "https://clay-performance-lab.local");
    if (url.origin !== "https://clay-performance-lab.local") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export async function loadMyNotifications(limit = 50) {
  return supabase
    .from("user_notifications")
    .select("id,user_id,notification_type,title,body,href,metadata,dedupe_key,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<UserNotification[]>();
}

export async function loadMyUnreadNotificationCount() {
  const { count, error } = await supabase
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return { count: count ?? 0, error };
}

export async function markMyNotificationRead(notificationId: string) {
  return supabase.rpc("mark_my_notification_read", { notification_id: notificationId });
}

export async function markAllMyNotificationsRead() {
  return supabase.rpc("mark_all_my_notifications_read");
}
