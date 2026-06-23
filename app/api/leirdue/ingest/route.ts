import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";

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
  if (!supabase) return { ok: false as const, error: "Missing Supabase auth context." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false as const, error: "You must be signed in." };
  const { data: profile } = await supabase.from("user_access_profiles").select("access_status,system_role").eq("user_id", userId).maybeSingle();
  if (!canManageBetaAccess(profile)) return { ok: false as const, error: "Owner/admin access required." };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 403 });
  const service = serviceClient();
  if (!service) return NextResponse.json({ error: "Missing service-role Supabase context." }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const [{ data: status }, rows, lists, events] = await Promise.all([
    service.from("leirdue_year_ingestion_status").select("*").eq("year", year).maybeSingle(),
    service.from("leirdue_shared_shooter_results").select("id", { count: "exact", head: true }).eq("year", year),
    service.from("leirdue_result_list_index").select("liste_id", { count: "exact", head: true }),
    service.from("leirdue_event_index").select("event_id", { count: "exact", head: true }).eq("year", year),
  ]);
  return NextResponse.json({ year, status: status || null, shooterRowsStored: rows.count || 0, resultListsDiscovered: lists.count || 0, eventsDiscovered: events.count || 0 });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 403 });
  const service = serviceClient();
  if (!service) return NextResponse.json({ error: "Missing service-role Supabase context." }, { status: 500 });
  const body = await request.json().catch(() => ({})) as { year?: unknown; action?: unknown };
  const year = Number(body.year || new Date().getFullYear());
  const action = typeof body.action === "string" ? body.action : "combined";
  const now = new Date().toISOString();
  await service.from("leirdue_year_ingestion_status").upsert({ year, parser_version: "leirdue-shared-v1", status: "incomplete", latest_errors: [{ at: now, note: `Admin action queued: ${action}. Shared bounded ingestion uses existing PR #94 crawler internals; no user-facing crawl was started by this endpoint.` }], updated_at: now }, { onConflict: "year" });
  return NextResponse.json({ ok: true, year, action, message: "Ingestion action recorded. Bounded shared ingestion can be run by the existing crawler worker wiring without starting a user search crawl." });
}
