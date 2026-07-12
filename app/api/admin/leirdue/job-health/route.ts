import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";
import { leirdueAlertEmailConfigStatus } from "@/lib/leirdue/adminEmailAlerts";
import { deriveLeirdueHealthState, LEIRDUE_RECENT_REFRESH_JOB_NAME, type LeirdueJobHealthRow } from "@/lib/leirdue/jobHealth";

export const dynamic = "force-dynamic";

function anonClient(authorization: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: authorization ? { Authorization: authorization } : {} } });
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAdmin(request: Request) {
  const supabase = anonClient(request.headers.get("authorization"));
  if (!supabase) return { ok: false as const, status: 500, error: "Missing Supabase auth context." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false as const, status: 401, error: "You must be signed in." };
  const { data: profile } = await supabase.from("user_access_profiles").select("access_status,system_role").eq("user_id", userId).maybeSingle();
  if (!canManageBetaAccess(profile)) return { ok: false as const, status: 403, error: "Owner/admin access required." };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const service = serviceClient();
  if (!service) return NextResponse.json({ error: "Missing service-role Supabase context." }, { status: 500 });
  const { data, error } = await service.from("leirdue_job_health").select("job_name,started_at,finished_at,status,refreshed_count,error_count,last_success_at,failure_reason,affected_scope,updated_at,last_alert_email_sent_at,last_alert_email_status,last_alert_email_error,last_alert_incident_key,last_recovery_email_sent_at").eq("job_name", LEIRDUE_RECENT_REFRESH_JOB_NAME).maybeSingle<LeirdueJobHealthRow>();
  if (error) return NextResponse.json({ error: "Could not read Leirdue job health." }, { status: 500 });
  const state = deriveLeirdueHealthState(data);
  return NextResponse.json({ jobName: LEIRDUE_RECENT_REFRESH_JOB_NAME, state, healthy: state === "healthy", row: data || null, staleAfterHours: 36, emailAlerts: { status: leirdueAlertEmailConfigStatus() } });
}

export const __test = { requireAdmin };
