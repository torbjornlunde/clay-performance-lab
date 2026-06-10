import { appBuildLabel } from "@/lib/appBuildInfo";

export const BETA_FEEDBACK_EMAIL = "torbjorn.lunde@icloud.com";

export function betaFeedbackMailto(area = "General beta") {
  const subject = "Clay Performance Lab beta feedback";
  const body = [
    "Clay Performance Lab beta feedback",
    "",
    `App area: ${area}`,
    `App version/build: ${appBuildLabel()}`,
    typeof window === "undefined" ? "URL: Not available" : `URL: ${window.location.href}`,
    typeof navigator === "undefined" ? "Phone/browser: Not available" : `Phone/browser: ${navigator.userAgent}`,
    "",
    "What happened:",
    "",
    "Where in the app:",
    area,
    "",
    "Phone/browser:",
    "",
    "Screenshot attached:",
  ].join("\n");

  return `mailto:${BETA_FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
