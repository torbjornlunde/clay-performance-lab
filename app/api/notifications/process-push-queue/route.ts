import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processPendingPushJobs } from "@/lib/notifications/serverPush";

export const runtime = "nodejs";

function configuredSecrets() {
  return [process.env.CRON_SECRET, process.env.PUSH_DELIVERY_TOKEN]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function hasTrustedBearer(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return Boolean(bearer && configuredSecrets().includes(bearer));
}

async function hasAuthenticatedUserBearer(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;
  const jwt = authorization.slice(7).trim();
  if (!jwt) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(jwt);
  return !error && Boolean(data.user);
}

async function runQueue() {
  try {
    const result = await processPendingPushJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Push queue could not be processed." },
      { status: 500 },
    );
  }
}

// Vercel Cron uses GET and sends CRON_SECRET as a bearer token.
export async function GET(request: Request) {
  if (!hasTrustedBearer(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return runQueue();
}

// Signed-in users may request a queue drain, but cannot choose payloads or recipients.
// All actual push data comes from deduplicated server-created user_notifications rows.
export async function POST(request: Request) {
  if (!hasTrustedBearer(request) && !(await hasAuthenticatedUserBearer(request))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return runQueue();
}
