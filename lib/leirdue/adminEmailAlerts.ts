import type { LeirdueJobHealthRow } from "@/lib/leirdue/jobHealth";

export const LEIRDUE_ALERT_RATE_LIMIT_HOURS = 12;
export const LEIRDUE_ADMIN_HEALTH_PATH = "/admin/leirdue-health";

type EmailEnv = Record<string, string | undefined>;

type AlertInput = {
  current: LeirdueJobHealthRow;
  previous: LeirdueJobHealthRow | null;
  now?: Date;
  env?: EmailEnv;
  fetchImpl?: typeof fetch;
};

export type LeirdueEmailAlertResult = {
  status: "sent" | "skipped_not_configured" | "skipped_rate_limited" | "skipped_not_incident" | "skipped_no_recovery" | "failed";
  incidentKey: string | null;
  error: string | null;
  sentAt: string | null;
  recoverySentAt: string | null;
};

export function isLeirdueAlertEmailConfigured(env: EmailEnv = process.env) {
  return Boolean(env.RESEND_API_KEY && env.ADMIN_ALERT_EMAIL_TO && env.ADMIN_ALERT_EMAIL_FROM);
}

export function leirdueAlertEmailConfigStatus(env: EmailEnv = process.env) {
  return isLeirdueAlertEmailConfigured(env) ? "configured" : "not_configured";
}

export function leirdueIncidentKey(row: Pick<LeirdueJobHealthRow, "job_name" | "status" | "failure_reason" | "affected_scope">) {
  const scope = row.affected_scope || {};
  const year = typeof scope.year === "string" || typeof scope.year === "number" ? String(scope.year) : "";
  const windowDays = typeof scope.recentWindowDays === "string" || typeof scope.recentWindowDays === "number" ? String(scope.recentWindowDays) : "";
  const cutoff = typeof scope.cutoff === "string" ? scope.cutoff : "";
  return [row.job_name, row.status, row.failure_reason || "", year, windowDays, cutoff].join("|");
}

function parseTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function withinRateLimit(value: string | null | undefined, now: Date) {
  const previous = parseTime(value);
  if (!previous) return false;
  return now.getTime() - previous < LEIRDUE_ALERT_RATE_LIMIT_HOURS * 60 * 60 * 1000;
}

function compactJson(value: unknown) {
  if (!value) return "None recorded";
  try { return JSON.stringify(value); } catch { return String(value); }
}

function adminHealthUrl(env: EmailEnv) {
  const base = env.NEXT_PUBLIC_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
  return base ? `${base.replace(/\/$/, "")}${LEIRDUE_ADMIN_HEALTH_PATH}` : LEIRDUE_ADMIN_HEALTH_PATH;
}

export function buildLeirdueAlertEmail(row: LeirdueJobHealthRow, kind: "incident" | "recovery", env: EmailEnv = process.env) {
  const degraded = row.status === "partial";
  const subjectStatus = kind === "recovery" ? "recovered" : degraded ? "degraded" : "failed";
  const body = [
    `Clay Performance Lab Leirdue refresh ${subjectStatus}.`,
    "",
    `Job name: ${row.job_name}`,
    `Status: ${row.status}`,
    `Last attempted refresh: ${row.finished_at || row.started_at || "Never"}`,
    `Last successful refresh: ${row.last_success_at || "Never"}`,
    `Refreshed count: ${row.refreshed_count}`,
    `Error count: ${row.error_count}`,
    `Failure reason: ${row.failure_reason || "None recorded"}`,
    `Affected scope: ${compactJson(row.affected_scope)}`,
    `Admin health page: ${adminHealthUrl(env)}`,
    "",
    kind === "recovery" ? "The recent Leirdue refresh is healthy again." : "Recent Leirdue results may be stale until fixed.",
  ].join("\n");
  return { subject: `Clay Performance Lab: Leirdue refresh ${subjectStatus}`, body };
}

async function sendResendEmail(params: { subject: string; body: string; env: EmailEnv; fetchImpl: typeof fetch }) {
  const response = await params.fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: params.env.ADMIN_ALERT_EMAIL_FROM, to: params.env.ADMIN_ALERT_EMAIL_TO, subject: params.subject, text: params.body }),
  });
  if (!response.ok) throw new Error(`Resend email failed with HTTP ${response.status}`);
}

export async function maybeSendLeirdueHealthEmailAlert(input: AlertInput): Promise<LeirdueEmailAlertResult> {
  const env = input.env || process.env;
  const now = input.now || new Date();
  const current = input.current;
  const previous = input.previous;
  const incidentKey = current.status === "success" ? null : leirdueIncidentKey(current);
  const wasIncident = previous?.status === "failed" || previous?.status === "partial";

  if (!isLeirdueAlertEmailConfigured(env)) {
    console.warn("Leirdue admin email alerts skipped: RESEND_API_KEY, ADMIN_ALERT_EMAIL_TO, or ADMIN_ALERT_EMAIL_FROM is not configured.");
    return { status: "skipped_not_configured", incidentKey, error: null, sentAt: null, recoverySentAt: null };
  }

  if (current.status === "success") {
    if (!wasIncident) return { status: "skipped_no_recovery", incidentKey: null, error: null, sentAt: null, recoverySentAt: null };
    if (withinRateLimit(previous?.last_recovery_email_sent_at, now)) return { status: "skipped_rate_limited", incidentKey: null, error: null, sentAt: null, recoverySentAt: null };
    try {
      const email = buildLeirdueAlertEmail(current, "recovery", env);
      await sendResendEmail({ ...email, env, fetchImpl: input.fetchImpl || fetch });
      return { status: "sent", incidentKey: null, error: null, sentAt: null, recoverySentAt: now.toISOString() };
    } catch (error) {
      return { status: "failed", incidentKey: null, error: error instanceof Error ? error.message : String(error), sentAt: null, recoverySentAt: null };
    }
  }

  if (current.status !== "failed" && current.status !== "partial") return { status: "skipped_not_incident", incidentKey, error: null, sentAt: null, recoverySentAt: null };
  const sameIncident = previous?.last_alert_incident_key === incidentKey;
  if (sameIncident && withinRateLimit(previous?.last_alert_email_sent_at, now)) return { status: "skipped_rate_limited", incidentKey, error: null, sentAt: null, recoverySentAt: null };

  try {
    const email = buildLeirdueAlertEmail(current, "incident", env);
    await sendResendEmail({ ...email, env, fetchImpl: input.fetchImpl || fetch });
    return { status: "sent", incidentKey, error: null, sentAt: now.toISOString(), recoverySentAt: null };
  } catch (error) {
    return { status: "failed", incidentKey, error: error instanceof Error ? error.message : String(error), sentAt: null, recoverySentAt: null };
  }
}
