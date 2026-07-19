import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260719120000_user_notifications.sql", "utf8");
const pushMigration = readFileSync("supabase/migrations/20260719143000_web_push_subscriptions.sql", "utf8");
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

const swRegistration = readFileSync("app/components/ServiceWorkerRegistration.tsx", "utf8");
const sw = readFileSync("public/sw.js", "utf8");
const pushControls = readFileSync("app/components/WebPushControls.tsx", "utf8");
const pushRoute = readFileSync("app/api/notifications/process-push-queue/route.ts", "utf8");
const serverPush = readFileSync("lib/notifications/serverPush.ts", "utf8");
const betaInterestRoute = readFileSync("app/api/beta-interest/route.ts", "utf8");
const feedbackPage = readFileSync("app/feedback/page.tsx", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));

assert.match(pushMigration, /create table if not exists public\.web_push_subscriptions/, "push subscription table exists");
assert.match(pushMigration, /references auth\.users\(id\) on delete cascade/, "push subscriptions are user-owned");
assert.match(pushMigration, /unique index[^;]+web_push_subscriptions_endpoint_unique_idx[\s\S]+endpoint\);/, "push subscriptions dedupe by endpoint");
assert.match(pushMigration, /for select to authenticated using \(auth\.uid\(\) = user_id\)/, "users can select only own push subscriptions");
assert.match(pushMigration, /for delete to authenticated using \(auth\.uid\(\) = user_id\)/, "users can delete only own push subscriptions");
assert.match(pushMigration, /upsert_my_web_push_subscription[\s\S]+on conflict \(endpoint\) do update[\s\S]+where public\.web_push_subscriptions\.user_id = auth\.uid\(\)/, "push subscription upsert cannot transfer endpoint ownership");
assert.doesNotMatch(pushMigration, /on conflict \(endpoint\) do update[\s\S]+set user_id = auth\.uid\(\)/, "push subscription conflict does not reassign user_id");
assert.match(pushMigration, /delete_my_web_push_subscription[\s\S]+where user_id = auth\.uid\(\) and endpoint = subscription_endpoint/, "push subscription removal is scoped to owner");
assert.match(pushControls, /Notification\.requestPermission\(\)/, "push permission is requested only from explicit UI action");
assert.match(pushControls, /Notification\.permission === "denied"/, "denied permission is treated as blocked without repeat prompt");
assert.match(sw, /self\.addEventListener\("push"/, "service worker handles push events");
assert.match(sw, /self\.addEventListener\("notificationclick"/, "service worker handles notification clicks");
assert.match(sw, /safeNotificationHref/, "service worker validates notification hrefs");
assert.match(packageJson, /"web-push": "\^3\.6\.7"/, "standards-compliant maintained Web Push package is declared");
assert.match(serverPush, /require\("web-push"\)/, "server push uses a traceable maintained web-push runtime dependency");
assert.doesNotMatch(serverPush, /createSign|X-CPL-Notification|Authorization: `vapid/, "server push does not hand-roll VAPID or send payload in custom headers");
assert.match(serverPush, /webPush\.sendNotification[\s\S]+JSON\.stringify\(payload\)/, "encrypted Web Push payload is sent through web-push request body");
assert.match(serverPush, /from\("web_push_delivery_jobs"\)[\s\S]+notification:user_notifications/, "push delivery is tied to queued in-app notifications");
assert.match(serverPush, /\.in\("status", \["pending", "failed"\]\)[\s\S]+\.select\("id"\)/, "queue jobs are atomically claimed before delivery");
assert.match(serverPush, /eq\("status", "processing"\)[\s\S]+staleProcessingCutoff/, "stale processing jobs are recovered for retry");
assert.match(pushMigration, /web_push_delivery_jobs_notification_unique_idx[\s\S]+notification_id/, "push jobs dedupe by notification id");
assert.match(pushMigration, /after insert on public\.user_notifications/, "push jobs are created from in-app notification inserts");
assert.match(serverPush, /statusCode === 404 \|\| statusCode === 410/, "permanently invalid subscriptions are removed");
assert.match(pushRoute, /process\.env\.CRON_SECRET[\s\S]+process\.env\.PUSH_DELIVERY_TOKEN/, "cron and manual trusted delivery use server-only bearer secrets");
assert.match(pushRoute, /supabase\.auth\.getUser\(jwt\)/, "authenticated queue kicks validate the user JWT on the server");
assert.match(pushRoute, /export async function GET\(request: Request\)/, "push queue exposes the GET handler required by Vercel Cron");
assert.match(pushRoute, /export async function POST\(request: Request\)/, "push queue exposes an authenticated POST kick for immediate delivery");
assert.doesNotMatch(pushRoute, /request\.json\(/, "queue endpoint accepts no client-controlled push payload");
assert.doesNotMatch(betaInterestRoute + feedbackPage + pushRoute + serverPush, /push-admin-event/, "removed arbitrary event-based push endpoint is not referenced");
assert.match(betaInterestRoute, /await processPendingPushJobs\(10\)\.catch\(\(\) => undefined\)/, "beta access requests immediately attempt server-side queue delivery");
assert.match(feedbackPage, /fetch\("\/api\/notifications\/process-push-queue"[\s\S]+authorization: `Bearer \$\{token\}`/, "beta feedback immediately requests an authenticated queue drain");
assert.doesNotMatch(header + page + client + swRegistration, /Notification\.requestPermission/, "no automatic push permission prompt occurs in shell or notification loading");
assert.ok(
  vercelConfig.crons.some((cron) => cron.path === "/api/leirdue/refresh-recent"),
  "existing Leirdue cron remains registered",
);
assert.ok(
  vercelConfig.crons.some((cron) => cron.path === "/api/notifications/process-push-queue" && cron.schedule === "41 4 * * *"),
  "Hobby-compatible daily fallback scheduler invokes the push queue",
);

console.log("Notification foundation regression tests passed.");
