import { createHmac, timingSafeEqual } from "node:crypto";

export type ApprovalEmailDeliveryStatus = "accepted" | "delivered" | "bounced" | "failed";

export type ResendDeliveryEvent = {
  id: string;
  type: "email.delivered" | "email.bounced" | "email.failed";
  createdAt: string;
  messageId: string;
};

function webhookSecretBytes(secret: string) {
  const value = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(value, "base64");
}

export function verifyResendWebhookSignature(input: { payload: string; id: string; timestamp: string; signature: string; secret: string; now?: number }) {
  const timestampSeconds = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestampSeconds) || Math.abs(now - timestampSeconds * 1000) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", webhookSecretBytes(input.secret))
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest();
  return input.signature.split(" ").some((candidate) => {
    const [, encoded] = candidate.split(",", 2);
    if (!encoded) return false;
    let actual: Buffer;
    try { actual = Buffer.from(encoded, "base64"); } catch { return false; }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function parseResendDeliveryEvent(payload: string, webhookId: string): ResendDeliveryEvent | null {
  let value: unknown;
  try { value = JSON.parse(payload); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const event = value as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  if (event.type !== "email.delivered" && event.type !== "email.bounced" && event.type !== "email.failed") return null;
  if (!webhookId || typeof event.created_at !== "string" || typeof event.data?.email_id !== "string") return null;
  if (!Number.isFinite(Date.parse(event.created_at))) return null;
  return { id: webhookId, type: event.type, createdAt: event.created_at, messageId: event.data.email_id };
}

export function deliveryStatusForEvent(type: ResendDeliveryEvent["type"]): ApprovalEmailDeliveryStatus {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced") return "bounced";
  return "failed";
}

export function shouldApplyDeliveryEvent(current: { messageId: string | null; eventId: string | null; updatedAt: string | null }, event: ResendDeliveryEvent) {
  if (current.messageId !== event.messageId || current.eventId === event.id) return false;
  return !current.updatedAt || Date.parse(event.createdAt) > Date.parse(current.updatedAt);
}
