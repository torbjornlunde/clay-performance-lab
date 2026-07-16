import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchCoachReportLeirdueContext, type CoachReportLeirdueCompetitionContext } from "@/lib/analysis/coachReportLeirdueContext";

export const dynamic = "force-dynamic";

function supabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: authorization ? { Authorization: authorization } : {} } });
}

function supabaseForLeirdueCacheRead(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) return createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabaseForRequest(request);
}

function sanitizeSessions(value: unknown): CoachReportLeirdueCompetitionContext[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).filter((session: any) => session && typeof session.id === "string").map((session: any) => ({ id: session.id, name: session.name || null, discipline: session.discipline || null, competition_date: session.competition_date || null, shooting_ground: session.shooting_ground || null, leirdue_result_url: session.leirdue_result_url || null, event_id: session.event_id || null, liste_id: session.liste_id || null, session_type: session.session_type || null } as CoachReportLeirdueCompetitionContext));
}

export async function POST(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return NextResponse.json({ status: "unavailable", rows: [], errors: ["Missing Supabase auth context."] }, { status: 500 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return NextResponse.json({ status: "unavailable", rows: [], errors: ["You must be signed in."] }, { status: 401 });
  let body: { sessions?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ status: "unavailable", rows: [], errors: ["Invalid Leirdue context request."] }, { status: 400 }); }
  const result = await fetchCoachReportLeirdueContext(supabaseForLeirdueCacheRead(request) || supabase, sanitizeSessions(body.sessions));
  return NextResponse.json(result, { status: result.status === "available" ? 200 : 207 });
}
