import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260719120000_user_notifications.sql", "utf8");
assert.match(migration, /create table if not exists public\.user_notifications/, "notification table exists");
assert.match(migration, /references auth\.users\(id\) on delete cascade/, "notifications are user-owned and cascade with auth user");
assert.match(migration, /unique index[^;]+user_notifications_user_dedupe_key_unique_idx[\s\S]+where dedupe_key is not null;/, "dedupe is user + non-null dedupe key only");
assert.match(migration, /for select to authenticated\s+using \(auth\.uid\(\) = user_id\)/, "users can select only their own notifications");
assert.doesNotMatch(migration, /for insert to authenticated|for update to authenticated|for delete to authenticated/, "normal clients have no broad write policies");
assert.match(migration, /mark_my_notification_read[\s\S]+where id = notification_id\s+and user_id = auth\.uid\(\)/, "mark-one RPC is scoped to auth.uid");
assert.match(migration, /mark_all_my_notifications_read[\s\S]+where user_id = auth\.uid\(\)\s+and read_at is null/, "mark-all RPC is scoped to auth.uid unread rows");
assert.match(migration, /p\.access_status = 'approved'[\s\S]+p\.system_role in \('owner', 'admin'\)/, "admin recipients use approved owner/admin semantics");
assert.match(migration, /after insert on public\.beta_interest_submissions/, "beta access notifications are insert-only");
assert.match(migration, /after insert on public\.beta_feedback/, "beta feedback notifications are insert-only");
assert.match(migration, /'beta-access-request:' \|\| new\.id::text/, "beta access dedupe key uses canonical row id");
assert.match(migration, /'beta-feedback:' \|\| new\.id::text/, "beta feedback dedupe key uses canonical row id");
assert.doesNotMatch(migration, /insert into public\.user_notifications[\s\S]+from public\.beta_interest_submissions/, "migration does not backfill beta interest rows");
assert.doesNotMatch(migration, /insert into public\.user_notifications[\s\S]+from public\.beta_feedback/, "migration does not backfill beta feedback rows");

for (const signature of [
  "public.notify_access_admins(text, text, text, text, jsonb, text)",
  "public.notify_admins_of_new_beta_interest()",
  "public.notify_admins_of_new_beta_feedback()",
]) {
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[().]/g, "\\$&")} from public;`), `${signature} is revoked from PUBLIC`);
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[().]/g, "\\$&")} from anon;`), `${signature} is revoked from anon`);
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[().]/g, "\\$&")} from authenticated;`), `${signature} is revoked from authenticated`);
}

for (const signature of ["public.mark_my_notification_read(uuid)", "public.mark_all_my_notifications_read()"]){
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[().]/g, "\\$&")} from public;`), `${signature} default PUBLIC execution is revoked`);
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[().]/g, "\\$&")} from anon;`), `${signature} is not callable by anon`);
  assert.match(migration, new RegExp(`grant execute on function ${signature.replace(/[().]/g, "\\$&")} to authenticated;`), `${signature} is explicitly granted to authenticated`);
}
assert.doesNotMatch(migration, /grant execute on function public\.notify_.* to authenticated/, "internal notify helpers are not granted to authenticated clients");

const header = readFileSync("app/components/AuthHeader.tsx", "utf8");
assert.match(header, /ready && authenticated && \(/, "authenticated header block gates the bell");
assert.match(header, /className="notificationBell"/, "authenticated users can see the notification bell");
assert.match(header, /unreadNotifications > 0 \? <span className="notificationBadge">/, "zero unread does not render badge");
assert.match(header, /unreadNotifications > 9 \? "9\+"/, "badge caps large unread counts");
assert.match(header, /visibilitychange/, "foreground refresh updates unread count");
assert.match(header, /window\.addEventListener\(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged\)/, "header listens for shared notification refresh event");
assert.match(header, /window\.removeEventListener\(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged\)/, "header cleans up shared notification refresh listener");

const page = readFileSync("app/notifications/page.tsx", "utf8");
assert.match(page, /No notifications yet\./, "notification center has empty state");
assert.match(page, /Promise\.all\(\[\s*loadMyNotifications\(\),\s*loadMyUnreadNotificationCount\(\),/s, "notification center loads list and exact unread count separately");
assert.match(page, /disabled=\{saving \|\| unreadCount === 0\}/, "mark-all availability uses exact unread count, not only displayed rows");
assert.doesNotMatch(page, /notifications\.filter\(\(notification\) => !notification\.read_at\)\.length/, "mark-all unread count is not derived from limited newest 50 rows");
assert.match(page, /markMyNotificationRead\(notification\.id\)/, "opening notification marks it read");
assert.match(page, /setNotifications\(\(current\) => current\.map/, "successful mark-one updates local state");
assert.match(page, /setUnreadCount\(\(current\) => Math\.max\(0, current - \(notification\.read_at \? 0 : 1\)\)\)/, "successful mark-one updates exact unread count optimistically");
assert.match(page, /notifyNotificationsChanged\(\);\s*\n\s*if \(href\) router\.push\(href\);\s*\n\s*else void refresh\(\);/, "notification without valid href still marks read, updates bell, and refreshes locally");
assert.match(page, /safeNotificationHref\(notification\.href\)/, "opening notification sanitizes internal href");
assert.match(page, /markAllMyNotificationsRead\(\)/, "mark all as read is wired");
assert.match(page, /setUnreadCount\(0\);\s*\n\s*notifyNotificationsChanged\(\);/s, "successful mark-all clears exact count and signals bell refresh");
assert.match(page, /Notification could not be marked as read right now\./, "failed mark-one surfaces a compact error");

const client = readFileSync("lib/notifications/client.ts", "utf8");
assert.match(client, /NOTIFICATIONS_CHANGED_EVENT = "cpl:notifications-changed"/, "shared notification refresh event is named and exported");
assert.match(client, /dispatchEvent\(new Event\(NOTIFICATIONS_CHANGED_EVENT\)\)/, "shared helper dispatches notification refresh event");
assert.match(client, /href\.startsWith\("\/"\).*href\.startsWith\("\/\/"\)/s, "href helper accepts only internal app paths");

const sw = readFileSync("app/components/ServiceWorkerRegistration.tsx", "utf8");
assert.doesNotMatch(header + page + client + sw, /Notification\.requestPermission|PushManager|pushManager|serviceWorker\.ready/, "no push permission or Web Push subscription was added");

console.log("Notification foundation regression tests passed.");
