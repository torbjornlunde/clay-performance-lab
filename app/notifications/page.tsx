"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadMyNotifications, markAllMyNotificationsRead, markMyNotificationRead, safeNotificationHref, type UserNotification } from "@/lib/notifications/client";
import { supabase } from "@/lib/supabase/client";

function compactTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace("/login");
      return;
    }
    const { data, error: loadError } = await loadMyNotifications();
    if (loadError) setError("Notifications could not be loaded right now.");
    setNotifications(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  async function openNotification(notification: UserNotification) {
    setSaving(true);
    await markMyNotificationRead(notification.id);
    setSaving(false);
    const href = safeNotificationHref(notification.href);
    if (href) router.push(href);
    else void refresh();
  }

  async function markAllRead() {
    setSaving(true);
    const { error: markError } = await markAllMyNotificationsRead();
    setSaving(false);
    if (markError) {
      setError("Notifications could not be marked as read right now.");
      return;
    }
    await refresh();
  }

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <main className="notificationsPage">
      <section className="heroCard notificationsHero">
        <div>
          <p className="eyebrow">Notifications</p>
          <h2>Notification center</h2>
          <p>Useful event notifications from Clay Performance Lab.</p>
        </div>
        <div className="btns">
          <button type="button" className="secondary" onClick={markAllRead} disabled={saving || unreadCount === 0}>Mark all as read</button>
          <Link className="button secondary" href="/dashboard">Dashboard</Link>
        </div>
      </section>

      {loading ? <div className="card">Loading notifications...</div> : null}
      {error ? <div className="error" role="alert">{error}</div> : null}
      {!loading && notifications.length === 0 ? <div className="card emptyState">No notifications yet.</div> : null}
      {!loading && notifications.length > 0 ? (
        <section className="card notificationList" aria-label="Notifications">
          {notifications.map((notification) => (
            <button key={notification.id} type="button" className={`notificationRow ${notification.read_at ? "" : "unread"}`} onClick={() => openNotification(notification)} disabled={saving}>
              <span className="notificationRowText">
                <strong>{notification.title}</strong>
                {notification.body ? <span>{notification.body}</span> : null}
              </span>
              <span className="notificationTime">{compactTime(notification.created_at)}</span>
            </button>
          ))}
        </section>
      ) : null}
    </main>
  );
}
