type EmailEnv = Record<string, string | undefined>;

export type BetaApprovalEmailConfigStatus = {
  configured: boolean;
  hasResendApiKey: boolean;
  hasFromAddress: boolean;
  hasSiteUrl: boolean;
  fromAddressConfigured: boolean;
  fromAddress: string | null;
  siteUrlPreview: string | null;
  missing: string[];
};

function cleanEnvValue(value: string | undefined) {
  return value?.trim() || "";
}

export function appLoginUrl(env: EmailEnv = process.env) {
  const base = cleanEnvValue(env.NEXT_PUBLIC_SITE_URL) || (cleanEnvValue(env.VERCEL_URL) ? `https://${cleanEnvValue(env.VERCEL_URL)}` : "");
  return base ? `${base.replace(/\/$/, "")}/login` : "/login";
}

export function getBetaApprovalEmailConfigStatus(env: EmailEnv = process.env): BetaApprovalEmailConfigStatus {
  const hasResendApiKey = Boolean(cleanEnvValue(env.RESEND_API_KEY));
  const betaFromAddress = cleanEnvValue(env.BETA_APPROVAL_EMAIL_FROM);
  const fallbackFromAddress = cleanEnvValue(env.ADMIN_ALERT_EMAIL_FROM);
  const fromAddress = betaFromAddress || fallbackFromAddress;
  const hasFromAddress = Boolean(fromAddress);
  const hasSiteUrl = Boolean(cleanEnvValue(env.NEXT_PUBLIC_SITE_URL));
  const siteUrlPreview = hasSiteUrl ? appLoginUrl(env) : null;
  const missing = [
    ...(!hasResendApiKey ? ["RESEND_API_KEY"] : []),
    ...(!hasFromAddress ? ["BETA_APPROVAL_EMAIL_FROM"] : []),
    ...(!hasSiteUrl ? ["NEXT_PUBLIC_SITE_URL"] : []),
  ];

  return {
    configured: hasResendApiKey && hasFromAddress && hasSiteUrl,
    hasResendApiKey,
    hasFromAddress,
    hasSiteUrl,
    fromAddressConfigured: hasFromAddress,
    fromAddress: fromAddress || null,
    siteUrlPreview,
    missing,
  };
}

export function isBetaApprovalEmailConfigured(env: EmailEnv = process.env) {
  return getBetaApprovalEmailConfigStatus(env).configured;
}

export function betaApprovalEmailConfigurationError(env: EmailEnv = process.env) {
  const status = getBetaApprovalEmailConfigStatus(env);
  if (status.configured) return null;
  return `Approval email is not configured: missing ${status.missing.join(", ")}`;
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
  const configurationError = betaApprovalEmailConfigurationError(env);
  if (configurationError) throw new Error(configurationError);
  const from = getBetaApprovalEmailConfigStatus(env).fromAddress;
  const email = buildBetaApprovalEmail(input, env);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: input.email, subject: email.subject, text: email.body }),
  });
  if (!response.ok) throw new Error(`Resend email failed with HTTP ${response.status}`);
}
