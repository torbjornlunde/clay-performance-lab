export function configuredLeirdueRefreshSecrets(env: Record<string, string | undefined> = process.env) {
  return [env.LEIRDUE_REFRESH_SECRET, env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function isAuthorizedLeirdueRefreshRequest(request: Request, secrets = configuredLeirdueRefreshSecrets()) {
  if (secrets.length === 0) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const cronHeader = request.headers.get("x-cron-secret")?.trim() || null;
  return Boolean((bearer && secrets.includes(bearer)) || (cronHeader && secrets.includes(cronHeader)));
}
