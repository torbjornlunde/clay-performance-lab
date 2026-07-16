import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";
import { sendBetaApprovalEmail } from "@/lib/betaApprovalEmail";

export const dynamic = "force-dynamic";

type ActionPayload = { interestId?: unknown; action?: unknown; adminNote?: unknown };
type InterestRow = { id: string; name: string; email: string; admin_status: string };

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
  return { ok: true as const, supabase, userId };
}

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, 1000) || null;
}

export async function POST(request: Request) {
  let payload: ActionPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid beta admin request." }, { status: 400 }); }
  const interestId = typeof payload.interestId === "string" ? payload.interestId : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  if (!interestId || (action !== "preapprove" && action !== "resend_email" && action !== "reject")) return NextResponse.json({ error: "Unsupported beta interest action." }, { status: 400 });

  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const supabase = admin.supabase;

  if (action === "reject") {
    const { error } = await supabase.from("beta_interest_submissions").update({ admin_status: "rejected", handled_at: new Date().toISOString(), handled_by: admin.userId, admin_note: cleanNote(payload.adminNote) }).eq("id", interestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, emailStatus: "not_sent" });
  }

  let row: InterestRow | null = null;
  if (action === "preapprove") {
    const { data, error } = await supabase.rpc("admin_preapprove_beta_interest", { target_interest_id: interestId, admin_note_value: cleanNote(payload.adminNote) }).single<InterestRow>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    row = data;
  } else {
    const { data, error } = await supabase.from("beta_interest_submissions").select("id,name,email,admin_status").eq("id", interestId).single<InterestRow>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    row = data;
  }

  try {
    await sendBetaApprovalEmail({ name: row.name, email: row.email });
    await supabase.from("beta_interest_submissions").update({ approval_email_sent_at: new Date().toISOString(), approval_email_error: null }).eq("id", row.id);
    return NextResponse.json({ ok: true, row, emailStatus: "sent" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("beta_interest_submissions").update({ approval_email_error: message }).eq("id", row.id);
    return NextResponse.json({ ok: true, row, emailStatus: "failed", warning: `Access was approved, but the approval email failed: ${message}` });
  }
}
