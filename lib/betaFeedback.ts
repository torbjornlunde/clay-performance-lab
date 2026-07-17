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

export function betaFeedbackHref(area = "General beta") {
  const params = new URLSearchParams({ context: area });
  return `/feedback?${params.toString()}`;
}

export function betaFeedbackContext(area = "General beta") {
  return {
    area,
    appBuild: appBuildLabel(),
  };
}
