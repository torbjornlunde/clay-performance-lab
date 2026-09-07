import { Resend } from "resend";

export type ApprovalEmailDeliveryStatus = "accepted" | "delivered" | "bounced" | "failed" | "suppressed";

export type ResendDeliveryEvent = {
  id: string;
  type: "email.delivered" | "email.bounced" | "email.failed" | "email.suppressed";
  createdAt: string;
  messageId: string;
};

type ResendWebhookHeaders = { id: string; timestamp: string; signature: string };
type ResendWebhookVerifier = (input: {
  payload: string;
  headers: ResendWebhookHeaders;
  webhookSecret: string;
}) => unknown | Promise<unknown>;

export async function verifyAndParseResendWebhook(
  input: { payload: string; headers: ResendWebhookHeaders; secret: string },
  verify: ResendWebhookVerifier = (value) => new Resend().webhooks.verify(value),
) {
  const verified = await verify({ payload: input.payload, headers: input.headers, webhookSecret: input.secret });
  return parseResendDeliveryEvent(verified, input.headers.id);
}

export function parseResendDeliveryEvent(value: unknown, webhookId: string): ResendDeliveryEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  if (event.type !== "email.delivered" && event.type !== "email.bounced" && event.type !== "email.failed" && event.type !== "email.suppressed") return null;
  if (!webhookId || typeof event.created_at !== "string" || typeof event.data?.email_id !== "string") return null;
  if (!Number.isFinite(Date.parse(event.created_at))) return null;
  return { id: webhookId, type: event.type, createdAt: event.created_at, messageId: event.data.email_id };
}

export function deliveryStatusForEvent(type: ResendDeliveryEvent["type"]): ApprovalEmailDeliveryStatus {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced") return "bounced";
  if (type === "email.suppressed") return "suppressed";
  return "failed";
}

export function shouldApplyDeliveryEvent(current: { messageId: string | null; eventId: string | null; updatedAt: string | null }, event: ResendDeliveryEvent) {
  if (current.messageId !== event.messageId || current.eventId === event.id) return false;
  return !current.updatedAt || Date.parse(event.createdAt) > Date.parse(current.updatedAt);
}
