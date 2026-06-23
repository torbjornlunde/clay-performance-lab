import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canManageBetaAccess } from "@/lib/access";
import { nordicSafeNameKey, normalizeLeirdueDisciplineLabel } from "@/lib/leirdue/normalize";

export const dynamic = "force-dynamic";

const BASE = "https://www.leirdue.net/";
const EVENT_BATCH_LIMIT = 8;
const LIST_BATCH_LIMIT = 20;
const FETCH_TIMEOUT_MS = 8000;
const PARSER_VERSION = "leirdue-shared-v1";

type Service = SupabaseClient;

type EventRow = { event_id: string; source_url: string | null; event_title: string | null; year: number | null };
type ListRow = { event_id: string; liste_id: string; source_url: string | null; list_title: string | null; year?: number | null };

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

function absoluteUrl(url: string) { return new URL(url.replace(/&amp;/g, "&"), BASE).toString(); }
function stripTags(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function eventIdFromUrl(url: string) { try { return new URL(url, BASE).searchParams.get("stevne"); } catch { return null; } }
function listeIdFromUrl(url: string) { try { return new URL(url, BASE).searchParams.get("liste_id"); } catch { return null; } }
function eventMenuUrl(eventId: string) { return `${BASE}?stevne=${encodeURIComponent(eventId)}&meny=resultater`; }
function resultIdentity(row: { year: number; event_id: string | null; liste_id: string | null; source_url: string; normalized_name: string; discipline: string | null; event_date: string | null; score: number | null; total_targets: number | null }) { return createHash("sha256").update([row.year, row.event_id || "", row.liste_id || "", row.source_url, row.normalized_name, row.discipline || "", row.event_date || "", row.score ?? "", row.total_targets ?? ""].join("|")).digest("hex"); }

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "ClayPerformanceLab Leirdue shared ingestion/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}

function eventLinksForYear(html: string, year: number) {
  const marked = html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_all, href, label) => `\n[[LINK ${absoluteUrl(href)}]]${stripTags(label)}[[/LINK]]\n`).replace(/<(br|p|div|tr|td|th|li|h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  let currentYear: number | null = null;
  const events = new Map<string, { event_id: string; source_url: string; event_title: string; raw_overview_text: string }>();
  for (const raw of marked.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^20\d{2}$/.test(line)) { currentYear = Number(line); continue; }
    const match = line.match(/^\[\[LINK (.*?)\]\](.*?)\[\[\/LINK\]\]$/);
    if (!match || currentYear !== year) continue;
    const eventId = eventIdFromUrl(match[1]);
    if (eventId) events.set(eventId, { event_id: eventId, source_url: eventMenuUrl(eventId), event_title: match[2] || `Leirdue event ${eventId}`, raw_overview_text: line });
  }
  return Array.from(events.values());
}

function listeLinksFromHtml(html: string, eventId: string, year: number) {
  const links = new Map<string, { event_id: string; liste_id: string; source_url: string; list_title: string; year: number }>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*liste_id=\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1]);
    const listeId = listeIdFromUrl(url);
    if (listeId) links.set(listeId, { event_id: eventId, liste_id: listeId, source_url: url, list_title: stripTags(match[2]) || `Result list ${listeId}`, year });
  }
  for (const match of html.matchAll(/liste_id=(\d+)/gi)) {
    const listeId = match[1];
    links.set(listeId, links.get(listeId) || { event_id: eventId, liste_id: listeId, source_url: `${BASE}?stevne=${eventId}&meny=resultater&liste_id=${listeId}`, list_title: `Result list ${listeId}`, year });
  }
  return Array.from(links.values());
}

function inferDiscipline(text: string) { return normalizeLeirdueDisciplineLabel(text).discipline || "Other"; }
function rowsFromResultList(html: string, list: ListRow, year: number) {
  const eventDate = html.match(/(20\d{2})[-.](\d{1,2})[-.](\d{1,2})/)?.[0]?.replace(/\./g, "-") || null;
  const discipline = inferDiscipline(stripTags(html).slice(0, 2000));
  const chunks = Array.from(html.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map((m) => m[0]);
  const sourceRows = chunks.length ? chunks : html.split(/<br\s*\/?|\n/gi);
  const parsed = [] as Record<string, unknown>[];
  for (const chunk of sourceRows) {
    const raw = stripTags(chunk);
    if (!raw || /ranking|prosent|%|klassef|sum etter/i.test(raw)) continue;
    const scoreMatch = raw.match(/\b(\d{1,3})\s*[\/ ]\s*(50|75|100|125|150|200)\b/);
    if (!scoreMatch) continue;
    const score = Number(scoreMatch[1]);
    const total = Number(scoreMatch[2]);
    if (score <= 0 || score > total) continue;
    const before = raw.slice(0, scoreMatch.index).replace(/^\s*\d+\s*[.)-]?\s*/, "").trim();
    const name = before.split(/\s{2,}|\t/).find((part) => /[A-Za-zÆØÅæøå]{2,}/.test(part)) || before;
    if (!name || name.length < 3) continue;
    const placement = Number(raw.match(/^\s*(\d{1,3})\b/)?.[1] || "") || null;
    const winningScore = Math.max(score, Number(raw.match(/(?:vinner|winner|best)\D+(\d{1,3})/i)?.[1] || score));
    const normalized_name = nordicSafeNameKey(name);
    const row = { year, event_id: list.event_id, liste_id: list.liste_id, normalized_name, original_name: name, club: null, placement, score, total_targets: total, winning_score: winningScore, series_scores: [], discipline, event_date: eventDate, event_title: list.list_title, organizer: null, source_url: list.source_url || `${BASE}?stevne=${list.event_id}&meny=resultater&liste_id=${list.liste_id}`, raw_row: raw, validation_status: "needs_review", parser_version: PARSER_VERSION, parsed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    parsed.push({ ...row, result_identity: resultIdentity(row) });
  }
  return parsed;
}

async function refreshStatus(service: Service, year: number, duration: number, errors: unknown[] = []) {
  const [eventsAll, eventsPending, eventsCompleted, eventsFailed, listsAll, listsPending, listsValid, listsInvalid, listsReview, rows] = await Promise.all([
    service.from("leirdue_event_index").select("id", { count: "exact", head: true }).eq("year", year),
    service.from("leirdue_event_index").select("id", { count: "exact", head: true }).eq("year", year).eq("ingestion_status", "pending"),
    service.from("leirdue_event_index").select("id", { count: "exact", head: true }).eq("year", year).eq("ingestion_status", "completed"),
    service.from("leirdue_event_index").select("id", { count: "exact", head: true }).eq("year", year).eq("ingestion_status", "failed"),
    service.from("leirdue_result_list_index").select("id", { count: "exact", head: true }).eq("year", year),
    service.from("leirdue_result_list_index").select("id", { count: "exact", head: true }).eq("year", year).eq("ingestion_status", "pending"),
    service.from("leirdue_result_list_index").select("id", { count: "exact", head: true }).eq("year", year).eq("is_valid_single_event_result", true),
    service.from("leirdue_result_list_index").select("id", { count: "exact", head: true }).eq("year", year).eq("ingestion_status", "failed"),
    service.from("leirdue_result_list_index").select("id", { count: "exact", head: true }).eq("year", year).eq("ingestion_status", "needs_review"),
    service.from("leirdue_shared_shooter_results").select("id", { count: "exact", head: true }).eq("year", year),
  ]);
  const remaining = (eventsPending.count || 0) + (listsPending.count || 0) + (listsReview.count || 0);
  const status = remaining === 0 && ((eventsCompleted.count || 0) > 0 || (rows.count || 0) > 0) ? "complete" : "incomplete";
  const payload = { year, parser_version: PARSER_VERSION, status, discovered_events: eventsAll.count || 0, pending_events: eventsPending.count || 0, completed_events: eventsCompleted.count || 0, failed_events: eventsFailed.count || 0, result_lists_discovered: listsAll.count || 0, pending_result_lists: listsPending.count || 0, valid_result_lists: listsValid.count || 0, invalid_result_lists: listsInvalid.count || 0, needs_review_result_lists: listsReview.count || 0, shooter_result_rows: rows.count || 0, remaining_work_count: remaining, last_batch_duration_ms: duration, latest_errors: errors.slice(-10), updated_at: new Date().toISOString() };
  await service.from("leirdue_year_ingestion_status").upsert(payload, { onConflict: "year" });
  return payload;
}

async function discoverYear(service: Service, year: number) {
  const html = await fetchHtml(`${BASE}?resultater=`);
  const events = eventLinksForYear(html, year);
  if (events.length) await service.from("leirdue_event_index").upsert(events.map((event) => ({ ...event, year, ingestion_status: "pending", last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })), { onConflict: "event_id" });
  return { eventsDiscovered: events.length };
}

async function eventBatch(service: Service, year: number) {
  const { data } = await service.from("leirdue_event_index").select("event_id,source_url,event_title,year").eq("year", year).eq("ingestion_status", "pending").limit(EVENT_BATCH_LIMIT);
  let eventsProcessed = 0, listeIdsDiscovered = 0; const errors: unknown[] = [];
  for (const event of (data || []) as EventRow[]) {
    try {
      const html = await fetchHtml(event.source_url || eventMenuUrl(event.event_id));
      const lists = listeLinksFromHtml(html, event.event_id, year);
      if (lists.length) await service.from("leirdue_result_list_index").upsert(lists.map((list) => ({ ...list, list_type: list.list_title, ingestion_status: "pending", updated_at: new Date().toISOString() })), { onConflict: "event_id,liste_id" });
      await service.from("leirdue_event_index").update({ ingestion_status: "completed", last_fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(), ingestion_error: null }).eq("event_id", event.event_id);
      eventsProcessed += 1; listeIdsDiscovered += lists.length;
    } catch (error) {
      errors.push({ eventId: event.event_id, error: String(error) });
      await service.from("leirdue_event_index").update({ ingestion_status: "failed", ingestion_error: String(error), updated_at: new Date().toISOString() }).eq("event_id", event.event_id);
    }
  }
  return { eventsProcessed, listeIdsDiscovered, errors };
}

async function resultListBatch(service: Service, year: number) {
  const { data } = await service.from("leirdue_result_list_index").select("event_id,liste_id,source_url,list_title,year").eq("year", year).in("ingestion_status", ["pending", "needs_review"]).limit(LIST_BATCH_LIMIT);
  let listsProcessed = 0, shooterRows = 0, needsReview = 0, invalid = 0; const errors: unknown[] = [];
  for (const list of (data || []) as ListRow[]) {
    try {
      const html = await fetchHtml(list.source_url || `${BASE}?stevne=${list.event_id}&meny=resultater&liste_id=${list.liste_id}`);
      const rows = rowsFromResultList(html, list, year);
      if (rows.length) await service.from("leirdue_shared_shooter_results").upsert(rows, { onConflict: "result_identity" });
      const ingestion_status = rows.length ? "completed" : "needs_review";
      await service.from("leirdue_result_list_index").update({ ingestion_status, is_valid_single_event_result: rows.length > 0, last_fetched_at: new Date().toISOString(), ingestion_error: rows.length ? null : "No shooter rows parsed", updated_at: new Date().toISOString() }).eq("event_id", list.event_id).eq("liste_id", list.liste_id);
      listsProcessed += 1; shooterRows += rows.length; if (!rows.length) needsReview += 1;
    } catch (error) {
      errors.push({ listeId: list.liste_id, error: String(error) }); invalid += 1;
      await service.from("leirdue_result_list_index").update({ ingestion_status: "failed", is_valid_single_event_result: false, ingestion_error: String(error), updated_at: new Date().toISOString() }).eq("event_id", list.event_id).eq("liste_id", list.liste_id);
    }
  }
  return { listsProcessed, shooterRows, needsReview, invalid, errors };
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
    service.from("leirdue_result_list_index").select("liste_id", { count: "exact", head: true }).eq("year", year),
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
  const started = Date.now(); const errors: unknown[] = []; let result = {};
  if (action === "discoverYear") result = await discoverYear(service, year);
  else if (action === "eventBatch") result = await eventBatch(service, year);
  else if (action === "resultListBatch") result = await resultListBatch(service, year);
  else if (action === "retryFailed") {
    await Promise.all([service.from("leirdue_event_index").update({ ingestion_status: "pending" }).eq("year", year).eq("ingestion_status", "failed"), service.from("leirdue_result_list_index").update({ ingestion_status: "pending" }).eq("year", year).eq("ingestion_status", "failed")]);
    result = { retried: true };
  } else {
    const eventResult = await eventBatch(service, year); const listResult = await resultListBatch(service, year); result = { ...eventResult, ...listResult };
  }
  if (typeof result === "object" && result && "errors" in result && Array.isArray((result as { errors?: unknown[] }).errors)) errors.push(...((result as { errors: unknown[] }).errors));
  const status = await refreshStatus(service, year, Date.now() - started, errors);
  return NextResponse.json({ ok: true, year, action, result, status, message: `Ingestion action ${action} executed.` });
}
