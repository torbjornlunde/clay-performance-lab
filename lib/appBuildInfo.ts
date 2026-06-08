import packageJson from "@/package.json";

export const APP_VERSION = packageJson.version;

export const APP_BUILD_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
  "local";

export const APP_BUILD_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV || "local";

export function appBuildLabel() {
  const shortSha = APP_BUILD_SHA === "local" ? APP_BUILD_SHA : APP_BUILD_SHA.slice(0, 7);
  return `v${APP_VERSION} · ${shortSha} · ${APP_BUILD_ENV}`;
}
