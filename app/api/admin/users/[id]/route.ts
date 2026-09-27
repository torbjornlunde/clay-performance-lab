import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!USER_ID.test(id)) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "Account details are not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: viewer, error: authError } = await client.auth.getUser(token);
  if (authError || !viewer.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: actor, error: actorError } = await client.from("user_access_profiles")
    .select("access_status,system_role").eq("user_id", viewer.user.id).maybeSingle();
  if (actorError || !canManageBetaAccess(actor)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: account, error: accountError } = await service.from("user_access_profiles")
    .select("user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,removed_at")
    .eq("user_id", id).maybeSingle();
  if (accountError) return NextResponse.json({ error: "Could not load this account." }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const count = async (table: string, ownerColumn: string, filter?: { column: string; value: string }) => {
    let query = service.from(table).select("id", { count: "exact", head: true }).eq(ownerColumn, id);
    if (filter) query = query.eq(filter.column, filter.value);
    const result = await query;
    return result.error ? null : result.count ?? 0;
  };
  const [profile, entitlement, authUser, sessionCount, competitionCount, trainingCount, scoreSheets, trainingLogs, scorecards, weapons, ammunition, notes, feedback, events30, recentEvents, aiEvents] = await Promise.all([
    service.from("shooter_profiles").select("shooter_name,first_name,last_name,country,my_disciplines,shooter_directory_visible,created_at,updated_at").eq("user_id", id).maybeSingle(),
    service.from("user_entitlements").select("plan,status,valid_until").eq("user_id", id).maybeSingle(),
    service.auth.admin.getUserById(id),
    count("sessions", "user_id"),
    count("sessions", "user_id", { column: "session_type", value: "Competition" }),
    count("sessions", "user_id", { column: "session_type", value: "Training" }),
    count("training_score_sheets", "owner_user_id"),
    count("training_logs", "owner_user_id"),
    count("scorecard_imports", "user_id"),
    count("equipment_weapons", "user_id"),
    count("equipment_ammunition_profiles", "user_id"),
    count("private_session_notes", "user_id"),
    count("beta_feedback", "user_id"),
    service.from("analytics_events").select("id", { count: "exact", head: true }).eq("user_id", id).gte("occurred_at", since30),
    service.from("analytics_events").select("event_name,feature,occurred_at").eq("user_id", id).order("occurred_at", { ascending: false }).limit(10),
    service.from("feature_usage_events").select("feature_key,created_at", { count: "exact" }).eq("user_id", id).eq("event_type", "used").like("feature_key", "ai.%").order("created_at", { ascending: false }).limit(500),
  ]);

  const aiByFeature = new Map<string, { count: number; lastUsedAt: string }>();
  for (const row of aiEvents.data || []) {
    const current = aiByFeature.get(row.feature_key);
    aiByFeature.set(row.feature_key, { count: (current?.count || 0) + 1, lastUsedAt: current?.lastUsedAt || row.created_at });
  }
  const unavailable = [
    profile.error && "shooter profile", entitlement.error && "entitlement", authUser.error && "authentication details",
    sessionCount === null && "sessions", competitionCount === null && "competitions", trainingCount === null && "training sessions",
    scoreSheets === null && "score sheets", trainingLogs === null && "training logs", scorecards === null && "scorecard imports",
    weapons === null && "weapons", ammunition === null && "ammunition", notes === null && "note count", feedback === null && "feedback count",
    events30.error && "app activity", recentEvents.error && "recent activity", aiEvents.error && "AI usage",
  ].filter((value): value is string => typeof value === "string");

  return NextResponse.json({
    account,
    shooterProfile: profile.error ? null : profile.data,
    entitlement: entitlement.error ? null : entitlement.data,
    authentication: authUser.error ? null : { emailConfirmedAt: authUser.data.user?.email_confirmed_at ?? null, lastSignInAt: authUser.data.user?.last_sign_in_at ?? null },
    activity: { sessions: sessionCount, competitions: competitionCount, trainingSessions: trainingCount, scoreSheets, trainingLogs, scorecardImports: scorecards, weapons, ammunition, privateNotes: notes, feedback, events30Days: events30.error ? null : events30.count ?? 0, recentEvents: recentEvents.error ? [] : recentEvents.data || [] },
    aiUsage: { total: aiEvents.error ? null : aiEvents.count ?? 0, byFeature: [...aiByFeature].map(([featureKey, values]) => ({ featureKey, ...values })).sort((a, b) => b.count - a.count), limitedBreakdown: !aiEvents.error && (aiEvents.count || 0) > (aiEvents.data?.length || 0) },
    unavailable,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
