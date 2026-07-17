import { appBuildLabel } from "@/lib/appBuildInfo";

export const BETA_FEEDBACK_TYPES = [
  "Bug",
  "Feature request",
  "Confusing flow",
  "Data/import problem",
  "Other",
] as const;
export const BETA_FEEDBACK_SEVERITIES = [
  "Low",
  "Normal",
  "High",
  "Blocker",
] as const;
export const BETA_FEEDBACK_ATTACHMENT_BUCKET = "beta-feedback-attachments";
export const BETA_FEEDBACK_ATTACHMENT_MAX_FILES = 3;
export const BETA_FEEDBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const BETA_FEEDBACK_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type BetaFeedbackType = (typeof BETA_FEEDBACK_TYPES)[number];
export type BetaFeedbackSeverity = (typeof BETA_FEEDBACK_SEVERITIES)[number];

export function safeInternalFeedbackPath(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  try {
    const parsed = new URL(trimmed, "https://clay-performance-lab.local");
    if (parsed.origin !== "https://clay-performance-lab.local") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function betaFeedbackHref(area = "General beta", from?: string | null) {
  const params = new URLSearchParams({ context: area });
  const safeFrom = safeInternalFeedbackPath(from);
  if (safeFrom) params.set("from", safeFrom);
  return `/feedback?${params.toString()}`;
}

export function betaFeedbackContext(area = "General beta") {
  return {
    area,
    appBuild: appBuildLabel(),
  };
}
