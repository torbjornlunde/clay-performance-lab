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

const header = readFileSync("app/components/AuthHeader.tsx", "utf8");
assert.match(header, /ready && authenticated && \(/, "authenticated header block gates the bell");
assert.match(header, /className="notificationBell"/, "authenticated users can see the notification bell");
assert.match(header, /unreadNotifications > 0 \? <span className="notificationBadge">/, "zero unread does not render badge");
assert.match(header, /unreadNotifications > 9 \? "9\+"/, "badge caps large unread counts");
assert.match(header, /visibilitychange/, "foreground refresh updates unread count");

const page = readFileSync("app/notifications/page.tsx", "utf8");
assert.match(page, /No notifications yet\./, "notification center has empty state");
assert.match(page, /markMyNotificationRead\(notification\.id\)/, "opening notification marks it read");
assert.match(page, /safeNotificationHref\(notification\.href\)/, "opening notification sanitizes internal href");
assert.match(page, /markAllMyNotificationsRead\(\)/, "mark all as read is wired");

const client = readFileSync("lib/notifications/client.ts", "utf8");
assert.match(client, /href\.startsWith\("\/"\).*href\.startsWith\("\/\/"\)/s, "href helper accepts only internal app paths");

const sw = readFileSync("app/components/ServiceWorkerRegistration.tsx", "utf8");
assert.doesNotMatch(header + page + client + sw, /Notification\.requestPermission|PushManager|pushManager|serviceWorker\.ready/, "no push permission or Web Push subscription was added");

console.log("Notification foundation regression tests passed.");
