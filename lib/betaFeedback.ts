import { OWNER_EMAILS } from "@/lib/access";
import { appBuildLabel } from "@/lib/appBuildInfo";

export const BETA_FEEDBACK_EMAIL = OWNER_EMAILS[0];

export function betaFeedbackMailto(area = "General beta") {
  const subject = `Clay Performance Lab beta feedback - ${area}`;
  const body = [
    "Clay Performance Lab beta feedback",
    "",
    `App area: ${area}`,
    `App version/build: ${appBuildLabel()}`,
    typeof window === "undefined" ? "URL: Not available" : `URL: ${window.location.href}`,
    typeof navigator === "undefined" ? "Browser/device: Not available" : `Browser/device: ${navigator.userAgent}`,
    "",
    "What happened?",
    "",
    "What did you expect?",
    "",
    "Screenshot attached?",
  ].join("\n");

  return `mailto:${BETA_FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
