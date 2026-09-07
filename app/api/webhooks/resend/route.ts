import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deliveryStatusForEvent, shouldApplyDeliveryEvent, verifyAndParseResendWebhook } from "@/lib/resendWebhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const id = request.headers.get("svix-id") || "";
  const timestamp = request.headers.get("svix-timestamp") || "";
  const signature = request.headers.get("svix-signature") || "";
  const payload = await request.text();
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let event;
  try {
    event = await verifyAndParseResendWebhook({ payload, headers: { id, timestamp, signature }, secret });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  if (!event) return NextResponse.json({ received: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Webhook storage is not configured." }, { status: 503 });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: row, error: readError } = await supabase.from("beta_interest_submissions")
    .select("id,approval_email_message_id,approval_email_webhook_event_id,approval_email_status_updated_at")
    .eq("approval_email_message_id", event.messageId).maybeSingle();
  if (readError) return NextResponse.json({ error: "Unable to store webhook event." }, { status: 500 });
  // Resend webhooks are account-level, so unrelated messages are expected here.
  // Acknowledge unknown IDs instead of causing repeated provider retries.
  if (!row) return NextResponse.json({ received: true });
  if (!shouldApplyDeliveryEvent({ messageId: row.approval_email_message_id, eventId: row.approval_email_webhook_event_id, updatedAt: row.approval_email_status_updated_at }, event)) {
    return NextResponse.json({ received: true });
  }
  const status = deliveryStatusForEvent(event.type);
  const { error: updateError } = await supabase.from("beta_interest_submissions").update({
    approval_email_delivery_status: status,
    approval_email_status_updated_at: event.createdAt,
    approval_email_webhook_event_id: event.id,
    approval_email_error: status === "delivered" ? null : `Resend reported ${status}`,
  }).eq("id", row.id).eq("approval_email_message_id", event.messageId)
    .or(`approval_email_status_updated_at.is.null,approval_email_status_updated_at.lt.${event.createdAt}`);
  if (updateError) return NextResponse.json({ error: "Unable to store webhook event." }, { status: 500 });
  return NextResponse.json({ received: true });
}
