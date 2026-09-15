import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBillingMode } from "@/lib/entitlements/check";
import { createEntitlementUserContext } from "@/lib/entitlements/userContext";
import { FeatureAccessError, recordFeatureUsage, requirePaidCostAccess } from "@/lib/entitlements/server";
import { reflectionEvidenceJsonSchema, validateReflectionEvidenceOutput } from "@/lib/ai/reflectionEvidence";

export const dynamic = "force-dynamic";
type Deps = { env?: NodeJS.ProcessEnv; createSupabaseClient?: typeof createClient; openAiFetch?: typeof fetch };
const instructions = `Extract only statements supported by this one clay-shooting competition reflection. Use self_report for direct statements and ai_inference only for a narrowly worded hypothesis. Never invent scores, misses, target labels, locations, post numbers, equipment, or causes. Existing context tags are supplied only to avoid generic duplicates. Return no duplicate unless the reflection adds a meaningful reference.`;
function client(request: Request, deps: Deps) { const env = deps.env || process.env; if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null; const authorization = request.headers.get("authorization") || undefined; return (deps.createSupabaseClient || createClient)(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: authorization ? { Authorization: authorization } : {} } }); }
function responseText(json: any) { if (typeof json?.output_text === "string") return json.output_text; return (Array.isArray(json?.output) ? json.output : []).flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).map((part: any) => part?.text || "").join("").trim(); }

export async function handleReflectionInterpret(request: Request, deps: Deps = {}) {
  const supabase = client(request, deps); if (!supabase) return NextResponse.json({ error: "Missing Supabase auth context." }, { status: 500 });
  const { data: authData } = await supabase.auth.getUser(); const userId = authData.user?.id;
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body?.noteId !== "string") return NextResponse.json({ error: "A saved reflection is required." }, { status: 400 });
  const { data: note, error: noteError } = await supabase.from("private_session_notes").select("id,user_id,session_id,note_scope,body,context_tags,updated_at,sessions!inner(session_type,user_id)").eq("id", body.noteId).maybeSingle();
  if (noteError || !note || note.user_id !== userId || note.note_scope !== "session" || (note as any).sessions?.user_id !== userId || String((note as any).sessions?.session_type).toLowerCase() !== "competition") return NextResponse.json({ error: "Reflection not found." }, { status: 404 });
  const reflection = String(note.body || "").trim(); if (!reflection) return NextResponse.json({ error: "Save a reflection before interpreting it." }, { status: 400 });
  const profile = await supabase.from("user_access_profiles").select("user_id,access_status,system_role").eq("user_id", userId).maybeSingle();
  const entitlement = await supabase.from("user_entitlements").select("plan,status,valid_until").eq("user_id", userId).maybeSingle();
  if (profile.error) return NextResponse.json({ error: "AI access could not be verified." }, { status: 403 });
  try { requirePaidCostAccess("ai.reflection_interpretation", createEntitlementUserContext({ userId, accessProfile: profile.data || null, entitlement: entitlement.error ? null : entitlement.data || null, billingMode: getBillingMode(deps.env || process.env) })); } catch (error) { if (error instanceof FeatureAccessError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
  const env = deps.env || process.env; if (!env.OPENAI_API_KEY) return NextResponse.json({ error: "Reflection interpretation is not configured." }, { status: 503 });
  try {
    const ai = await (deps.openAiFetch || fetch)("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_REFLECTION_MODEL || env.OPENAI_COACH_REPORT_MODEL || "gpt-4.1-mini", input: [{ role: "system", content: [{ type: "input_text", text: instructions }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify({ reflection, existing_context_tags: Array.isArray(note.context_tags) ? note.context_tags : [] }) }] }], text: { format: { type: "json_schema", name: "reflection_evidence", strict: true, schema: reflectionEvidenceJsonSchema } }, temperature: 0.1 }) });
    if (!ai.ok) return NextResponse.json({ error: "Interpretation failed. Your saved reflection is unchanged." }, { status: 502 });
    let parsed: unknown; try { parsed = JSON.parse(responseText(await ai.json())); } catch { return NextResponse.json({ error: "Interpretation returned an invalid result. Nothing was saved." }, { status: 502 }); }
    let items; try { items = validateReflectionEvidenceOutput(parsed); } catch { return NextResponse.json({ error: "Interpretation returned unsupported evidence. Nothing was saved." }, { status: 502 }); }
    const rows = items.map((item) => ({ ...item, user_id: userId, session_id: note.session_id, source_note_id: note.id, source_note_updated_at: note.updated_at, review_status: "pending" }));
    if (rows.length) { const inserted = await supabase.from("private_reflection_evidence").insert(rows).select("*"); if (inserted.error) return NextResponse.json({ error: "Interpretation could not be saved. Existing evidence is unchanged." }, { status: 500 }); await recordFeatureUsage(supabase, "ai.reflection_interpretation", userId, { route: "/api/reflections/interpret", itemCount: rows.length }); return NextResponse.json({ items: inserted.data || [] }); }
    await recordFeatureUsage(supabase, "ai.reflection_interpretation", userId, { route: "/api/reflections/interpret", itemCount: 0 }); return NextResponse.json({ items: [] });
  } catch { return NextResponse.json({ error: "Interpretation failed. Your saved reflection is unchanged." }, { status: 500 }); }
}
export async function POST(request: Request) { return handleReflectionInterpret(request); }
export const __test = { handleReflectionInterpret, responseText };
