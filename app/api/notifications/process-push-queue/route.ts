import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safePushHref } from "@/lib/notifications/push";

export const runtime = "nodejs";

type JobRow = {
  id: string;
  notification_id: string;
  attempt_count: number;
  notification: {
    id: string;
    user_id: string;
    title: string;
    body: string | null;
    href: string | null;
    notification_type: string;
  };
};
type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };
type WebPush = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: unknown,
    payload: string,
    options?: { TTL?: number; urgency?: string },
  ) => Promise<unknown>;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service configuration.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(request: Request) {
  const authorization = request.headers.get("authorization");
  const acceptedTokens = [process.env.CRON_SECRET, process.env.PUSH_DELIVERY_TOKEN].filter(
    (token): token is string => Boolean(token),
  );
  return acceptedTokens.some((token) => authorization === `Bearer ${token}`);
}

function loadWebPush() {
  // Keep this as a literal require so Next/Vercel can trace the runtime dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("web-push") as WebPush;
}

async function send(subscription: SubscriptionRow, payload: { title: string; body?: string; href: string }) {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return { skipped: true, gone: false, error: "Web Push VAPID keys are not configured." };
  }

  try {
    const webPush = loadWebPush();
    webPush.setVapidDetails(
      process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:admin@clay-performance-lab.local",
      publicKey,
      privateKey,
    );
    await webPush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 86400, urgency: "normal" },
    );
    return { skipped: false, gone: false, error: "" };
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
    return {
      skipped: false,
      gone: statusCode === 404 || statusCode === 410,
      error: error instanceof Error ? error.message : "Web Push delivery failed.",
    };
  }
}

async function processPushQueue(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = serviceClient();
  const { data: jobs, error } = await supabase
    .from("web_push_delivery_jobs")
    .select("id,notification_id,attempt_count,notification:user_notifications(id,user_id,title,body,href,notification_type)")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(25)
    .returns<JobRow[]>();

  if (error) return NextResponse.json({ error: "Queue could not be loaded." }, { status: 500 });

  let delivered = 0;
  let skipped = 0;

  for (const job of jobs ?? []) {
    const notification = job.notification;
    const { data: claimedJob } = await supabase
      .from("web_push_delivery_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!claimedJob) continue;

    const { data: subscriptions } = await supabase
      .from("web_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", notification.user_id)
      .eq("active", true)
      .returns<SubscriptionRow[]>();

    if (!subscriptions?.length) {
      skipped += 1;
      await supabase
        .from("web_push_delivery_jobs")
        .update({ status: "skipped", last_error: "No active subscription.", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      continue;
    }

    const payload = {
      title: notification.title,
      body: notification.body || undefined,
      href: safePushHref(notification.href),
    };
    const failures: string[] = [];
    let successfulDeliveries = 0;
    let removedSubscriptions = 0;

    for (const subscription of subscriptions) {
      const result = await send(subscription, payload);
      if (result.gone) {
        removedSubscriptions += 1;
        await supabase.from("web_push_subscriptions").delete().eq("id", subscription.id);
        continue;
      }
      if (result.error) failures.push(result.error);
      else if (!result.skipped) successfulDeliveries += 1;
    }

    if (successfulDeliveries > 0) {
      delivered += 1;
      await supabase
        .from("web_push_delivery_jobs")
        .update({ status: "delivered", last_error: failures[0] || null, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    } else if (removedSubscriptions === subscriptions.length) {
      skipped += 1;
      await supabase
        .from("web_push_delivery_jobs")
        .update({ status: "skipped", last_error: "All subscriptions were expired.", updated_at: new Date().toISOString() })
        .eq("id", job.id);
    } else {
      await supabase
        .from("web_push_delivery_jobs")
        .update({
          status: "failed",
          attempt_count: job.attempt_count + 1,
          last_error: failures[0] || "Web Push delivery failed.",
          next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }

  return NextResponse.json({ ok: true, processed: jobs?.length ?? 0, delivered, skipped });
}

export async function GET(request: Request) {
  return processPushQueue(request);
}

export async function POST(request: Request) {
  return processPushQueue(request);
}
