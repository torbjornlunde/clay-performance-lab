import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

type Payload = { userIds?: unknown };

function anonClient(authorization: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: authorization ? { Authorization: authorization } : {} } });
}

async function requireAdmin(request: Request) {
  const supabase = anonClient(request.headers.get("authorization"));
  if (!supabase) return { ok: false as const, status: 500, error: "Missing Supabase auth context." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false as const, status: 401, error: "You must be signed in." };
  await supabase.rpc("sync_my_access_profile");
  const { data: profile } = await supabase.from("user_access_profiles").select("access_status,system_role").eq("user_id", userId).maybeSingle();
  if (!canManageBetaAccess(profile)) return { ok: false as const, status: 403, error: "Owner/admin access required." };
  return { ok: true as const };
}

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid last sign-in request." }, { status: 400 });
  }

  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured for server-side Auth admin reads." }, { status: 503 });
  }

  const requestedUserIds = Array.isArray(payload.userIds) ? payload.userIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 200) : [];
  if (requestedUserIds.length === 0) return NextResponse.json({ ok: true, lastSignIns: {} });

  const serviceSupabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const lastSignIns: Record<string, { lastSignInAt: string | null }> = {};

  await Promise.all(requestedUserIds.map(async (userId) => {
    const { data, error } = await serviceSupabase.auth.admin.getUserById(userId);
    lastSignIns[userId] = { lastSignInAt: error ? null : data.user?.last_sign_in_at ?? null };
  }));

  return NextResponse.json({ ok: true, lastSignIns });
}
