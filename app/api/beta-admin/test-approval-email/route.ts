import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";
import { getBetaApprovalEmailConfigStatus, sendBetaApprovalEmail } from "@/lib/betaApprovalEmail";

export const dynamic = "force-dynamic";

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
  const user = userData.user;
  if (!user) return { ok: false as const, status: 401, error: "You must be signed in." };
  await supabase.rpc("sync_my_access_profile");
  const { data: profile } = await supabase.from("user_access_profiles").select("access_status,system_role,full_name,email").eq("user_id", user.id).maybeSingle();
  if (!canManageBetaAccess(profile)) return { ok: false as const, status: 403, error: "Owner/admin access required." };
  return { ok: true as const, user, profile };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  return NextResponse.json({ ok: true, config: getBetaApprovalEmailConfigStatus() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const recipient = admin.user.email;
  if (!recipient) return NextResponse.json({ error: "Your admin account does not have an email address for the test email." }, { status: 400 });

  try {
    await sendBetaApprovalEmail({ name: admin.profile?.full_name || recipient, email: recipient });
    return NextResponse.json({ ok: true, message: "Test email sent.", config: getBetaApprovalEmailConfigStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, config: getBetaApprovalEmailConfigStatus() }, { status: 500 });
  }
}
