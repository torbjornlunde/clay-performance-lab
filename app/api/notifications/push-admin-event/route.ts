import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safePushHref } from "@/lib/notifications/push";
import { createSign } from "crypto";

type EventType = "beta_access_request" | "beta_feedback";
type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };


function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service configuration.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function eventPayload(eventType: EventType) {
  return eventType === "beta_access_request"
    ? { title: "New beta access request", body: "A new beta access request is ready for review.", href: "/beta/admin" }
    : { title: "New beta feedback", body: "A new beta feedback submission is ready for review.", href: "/admin/feedback" };
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function vapidJwt(audience: string, subject: string, publicKey: string, privateKey: string) {
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const body = base64url(JSON.stringify({ aud: audience, exp, sub: subject }));
  const unsigned = `${header}.${body}`;
  const signature = createSign("SHA256").update(unsigned).end().sign(Buffer.from(privateKey.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  return `${unsigned}.${base64url(signature)}`;
}

async function sendWebPush(subscription: SubscriptionRow, payload: ReturnType<typeof eventPayload>) {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:admin@clay-performance-lab.local";
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { skipped: true, gone: false };
  try {
    const endpoint = new URL(subscription.endpoint);
    const jwt = vapidJwt(endpoint.origin, subject, publicKey, privateKey);
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Urgency: "normal",
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        "X-CPL-Notification": JSON.stringify({ ...payload, href: safePushHref(payload.href) }),
      },
    });
    return { skipped: false, gone: response.status === 404 || response.status === 410 };
  } catch {
    return { skipped: false, gone: false };
  }
}

export async function POST(request: Request) {
  let body: { eventType?: EventType; eventId?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (body.eventType !== "beta_access_request" && body.eventType !== "beta_feedback") return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  if (!body.eventId || !/^[0-9a-f-]{36}$/i.test(body.eventId)) return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  const supabase = serviceClient();
  const table = body.eventType === "beta_access_request" ? "beta_interest_submissions" : "beta_feedback";
  const { data: eventRow } = await supabase.from(table).select("id").eq("id", body.eventId).maybeSingle<{ id: string }>();
  if (!eventRow) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const { data: recipients } = await supabase.from("user_access_profiles").select("user_id").eq("access_status", "approved").in("system_role", ["owner", "admin"]);
  const recipientIds = (recipients ?? []).map((row: { user_id: string }) => row.user_id);
  if (!recipientIds.length) return NextResponse.json({ ok: true, attempted: 0 });
  const { data: subscriptions } = await supabase.from("web_push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id", recipientIds).eq("active", true).returns<SubscriptionRow[]>();
  let attempted = 0;
  for (const subscription of subscriptions ?? []) {
    attempted += 1;
    const result = await sendWebPush(subscription, eventPayload(body.eventType));
    if (result.gone) await supabase.from("web_push_subscriptions").delete().eq("id", subscription.id);
  }
  return NextResponse.json({ ok: true, attempted });
}
