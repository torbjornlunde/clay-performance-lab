import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

type AnalyticsRow = { user_id: string | null; event_name: string; occurred_at: string; feature: string | null };

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

function daysAgo(days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return date; }
function dayKey(value: string) { return value.slice(0, 10); }
function countBy(rows: AnalyticsRow[], getter: (row: AnalyticsRow) => string | null | undefined, limit = 10) {
  const counts = new Map<string, number>();
  for (const row of rows) { const key = getter(row); if (key) counts.set(key, (counts.get(key) || 0) + 1); }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
}
function funnel(rows: AnalyticsRow[], names: string[]) { return names.map((name) => ({ name, count: rows.filter((row) => row.event_name === name).length })); }
function uniqueUsers(rows: AnalyticsRow[]) { return new Set(rows.map((row) => row.user_id).filter(Boolean)).size; }

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const service = serviceClient();
  if (!service) return NextResponse.json({ error: "Missing service-role Supabase context." }, { status: 500 });

  const since30 = daysAgo(30).toISOString();
  const { data, error } = await service.from("analytics_events").select("user_id,event_name,occurred_at,feature").gte("occurred_at", since30).order("occurred_at", { ascending: false }).limit(5000);
  if (error) return NextResponse.json({ error: "Could not load analytics summary." }, { status: 500 });

  const rows = (data || []) as AnalyticsRow[];
  const since7 = daysAgo(7).getTime();
  const since14 = daysAgo(14).getTime();
  const rows7 = rows.filter((row) => new Date(row.occurred_at).getTime() >= since7);
  const rows14 = rows.filter((row) => new Date(row.occurred_at).getTime() >= since14);
  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) byDay.set(dayKey(daysAgo(i).toISOString()), 0);
  for (const row of rows14) byDay.set(dayKey(row.occurred_at), (byDay.get(dayKey(row.occurred_at)) || 0) + 1);

  return NextResponse.json({
    totalEvents7d: rows7.length,
    activeUsers7d: uniqueUsers(rows7),
    activeUsers30d: uniqueUsers(rows),
    eventsByDay14d: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })),
    topEventNames14d: countBy(rows14, (row) => row.event_name),
    featureUsage14d: countBy(rows14, (row) => row.feature),
    importFunnel14d: funnel(rows14, ["leirdue_search_started", "leirdue_search_completed", "leirdue_import_saved"]),
    scorecardFunnel14d: funnel(rows14, ["scorecard_photo_uploaded", "scorecard_analysis_completed", "scorecard_review_applied"]),
    trainingUsage14d: funnel(rows14, ["training_score_sheet_created", "training_score_sheet_saved"]),
    recentErrors7d: rows7.filter((row) => row.event_name === "error_reported").length,
  });
}

export const __test = { requireAdmin };
