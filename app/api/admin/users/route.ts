import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { canManageBetaAccess, isProtectedOwnerEmail } from "@/lib/access";

export const dynamic = "force-dynamic";

type Action = "pause" | "close" | "restore" | "remove";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Account management is not configured." }, { status: 503 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userResult } = await client.auth.getUser(token);
  if (!userResult.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: actor } = await client.from("user_access_profiles").select("access_status,system_role")
    .eq("user_id", userResult.user.id).maybeSingle();
  if (!canManageBetaAccess(actor)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "all";
  const sort = params.get("sort") === "name" ? "full_name" : params.get("sort") === "activity" ? "updated_at" : "created_at";
  const ascending = params.get("direction") === "asc";
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.get("page") || "0", 10) || 0));
  const query = (params.get("q") || "").trim().slice(0, 100);
  if (!["all", "approved", "paused", "revoked", "rejected", "removed", "pending"].includes(status)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }
  let rows = client.from("user_access_profiles")
    .select("user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by,removed_at", { count: "exact" });
  if (status !== "all") rows = rows.eq("access_status", status);
  if (query) {
    // Keep PostgREST's `or` expression free of user supplied syntax.
    const safeQuery = query.replace(/[^\p{L}\p{N}@. +_-]/gu, "").trim();
    if (safeQuery) rows = rows.or(`email.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%`);
  }
  const { data, count, error } = await rows.order(sort, { ascending, nullsFirst: false }).range(page * 50, page * 50 + 49);
  if (error) return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  return NextResponse.json({ users: data || [], count: count || 0, page, pageSize: 50 });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "Account management is not configured." }, { status: 503 });

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userResult, error: userError } = await client.auth.getUser(token);
  if (userError || !userResult.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { data: actor, error: actorError } = await client.from("user_access_profiles")
    .select("access_status,system_role").eq("user_id", userResult.user.id).maybeSingle();
  if (actorError || !canManageBetaAccess(actor)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const targetUserId = body?.userId;
  const action = body?.action as Action;
  if (typeof targetUserId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(targetUserId) ||
      !["pause", "close", "restore", "remove"].includes(action)) {
    return NextResponse.json({ error: "Invalid account action." }, { status: 400 });
  }
  if (targetUserId === userResult.user.id) return NextResponse.json({ error: "You cannot change your own account here." }, { status: 403 });

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: target, error: targetError } = await service.from("user_access_profiles")
    .select("user_id,email,access_status,system_role").eq("user_id", targetUserId).maybeSingle();
  if (targetError || !target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (isProtectedOwnerEmail(target.email) || target.system_role === "owner") {
    return NextResponse.json({ error: "Owner accounts cannot be changed here." }, { status: 403 });
  }
  if (target.access_status === "removed") return NextResponse.json({ error: "This account was already removed." }, { status: 409 });
  if (action === "remove" && body?.confirmEmail !== target.email) {
    return NextResponse.json({ error: "Type the account email exactly to confirm removal." }, { status: 400 });
  }

  const nextStatus = action === "pause" ? "paused" : action === "restore" ? "approved" : "revoked";
  const { error: updateError } = await client.rpc("admin_update_user_access", {
    target_user_id: targetUserId, new_access_status: nextStatus, new_system_role: target.system_role,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  if (action === "remove") {
    const { error: blockError } = await service.from("beta_blocked_emails").upsert({
      email_hash: `\\x${createHash("sha256").update(target.email?.trim().toLowerCase() || "").digest("hex")}`,
    });
    if (blockError) return NextResponse.json({ error: `Account closed, but removal was blocked: ${blockError.message}` }, { status: 502 });
    // Soft deletion removes the sign-in identity without relying on cascading
    // deletion of competition records shared with other shooters.
    const { error: deleteError } = await service.auth.admin.deleteUser(targetUserId, true);
    if (deleteError) return NextResponse.json({ error: `Account closed, but removal failed: ${deleteError.message}` }, { status: 502 });
    const { error: profileError } = await service.from("user_access_profiles").update({
      access_status: "removed", email: null, full_name: null, removed_at: new Date().toISOString(),
    }).eq("user_id", targetUserId);
    if (profileError) return NextResponse.json({ error: `Sign-in removed, but profile cleanup failed: ${profileError.message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, status: action === "remove" ? "removed" : nextStatus });
}
