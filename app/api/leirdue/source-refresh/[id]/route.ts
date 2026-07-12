import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyableSessionPatch, refreshLeirdueSource, type LeirdueSourceDiff, type LeirdueRefreshSession } from "@/lib/leirdue/sourceRefresh";

export const dynamic = "force-dynamic";

function supabaseForRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const authorization = request.headers.get("authorization") || undefined;
  return createClient(url, key, { auth: { persistSession: false }, global: { headers: authorization ? { Authorization: authorization } : {} } });
}

async function requireSession(request: Request, id: string) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return { ok: false as const, status: 500, error: "Missing Supabase auth context." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false as const, status: 401, error: "You must be signed in." };
  const { data: session, error } = await supabase.from("sessions").select("id,user_id,name,competition_date,discipline,shooting_ground,own_score,winning_score,total_targets,leirdue_result_url,notes,last_source_checked_at,last_source_status,source_change_summary").eq("id", id).eq("user_id", userId).maybeSingle<LeirdueRefreshSession & { user_id: string; last_source_checked_at?: string | null; last_source_status?: string | null; source_change_summary?: unknown }>();
  if (error) return { ok: false as const, status: 500, error: "Could not load saved result." };
  if (!session) return { ok: false as const, status: 404, error: "Saved result not found." };
  return { ok: true as const, supabase, session };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await requireSession(request, id);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const checkedAt = new Date().toISOString();
  const result = await refreshLeirdueSource(loaded.session);
  await loaded.supabase.from("sessions").update({ last_source_checked_at: checkedAt, last_source_status: result.status, source_change_summary: { checkedAt, status: result.status, diffs: result.diffs, error: result.error, sourceUrl: result.sourceUrl } }).eq("id", id).eq("user_id", loaded.session.user_id);
  return NextResponse.json({ ...result, checkedAt });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await requireSession(request, id);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  let body: { confirmed?: boolean; selectedFields?: string[]; diffs?: LeirdueSourceDiff[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid update request." }, { status: 400 }); }
  if (body.confirmed !== true) return NextResponse.json({ error: "Explicit confirmation is required before updating a saved result." }, { status: 400 });
  const diffs = Array.isArray(body.diffs) ? body.diffs : [];
  const patch = applyableSessionPatch(diffs, Array.isArray(body.selectedFields) ? body.selectedFields : []);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No selected safe source changes to apply." }, { status: 400 });
  const checkedAt = new Date().toISOString();
  const { error } = await loaded.supabase.from("sessions").update({ ...patch, last_source_checked_at: checkedAt, last_source_status: "applied", source_change_summary: { checkedAt, status: "applied", appliedFields: Object.keys(patch), diffs } }).eq("id", id).eq("user_id", loaded.session.user_id);
  if (error) return NextResponse.json({ error: "Could not apply selected source changes." }, { status: 500 });
  return NextResponse.json({ status: "applied", appliedFields: Object.keys(patch), checkedAt });
}

export const __test = { requireSession };
