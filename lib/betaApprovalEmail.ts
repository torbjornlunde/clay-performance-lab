type EmailEnv = Record<string, string | undefined>;

export function appLoginUrl(env: EmailEnv = process.env) {
  const base = env.NEXT_PUBLIC_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
  return base ? `${base.replace(/\/$/, "")}/login` : "/login";
}

export function isBetaApprovalEmailConfigured(env: EmailEnv = process.env) {
  return Boolean(env.RESEND_API_KEY && (env.BETA_APPROVAL_EMAIL_FROM || env.ADMIN_ALERT_EMAIL_FROM));
}

export function buildBetaApprovalEmail(input: { name: string; email: string }, env: EmailEnv = process.env) {
  const loginUrl = appLoginUrl(env);
  const body = [
    `Hi ${input.name},`,
    "",
    "Your Clay Performance Lab beta access has been approved.",
    "",
    `Approved email address: ${input.email}`,
    `Log in or sign up here: ${loginUrl}`,
    "",
    "Please use the approved email address when you sign up or log in. Clay Performance Lab is still a closed beta, so features, wording and workflows may change while we test with shooters.",
    "",
    "Thank you for helping test Clay Performance Lab.",
  ].join("\n");
  return { subject: "Clay Performance Lab beta access", body };
}

export async function sendBetaApprovalEmail(input: { name: string; email: string }, env: EmailEnv = process.env, fetchImpl: typeof fetch = fetch) {
  if (!isBetaApprovalEmailConfigured(env)) throw new Error("Approval email is not configured.");
  const from = env.BETA_APPROVAL_EMAIL_FROM || env.ADMIN_ALERT_EMAIL_FROM;
  const email = buildBetaApprovalEmail(input, env);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: input.email, subject: email.subject, text: email.body }),
  });
  if (!response.ok) throw new Error(`Resend email failed with HTTP ${response.status}`);
}
