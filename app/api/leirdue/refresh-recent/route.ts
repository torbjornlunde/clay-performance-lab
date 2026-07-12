import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nordicSafeNameKey } from "@/lib/leirdue/normalize";
import { isAuthorizedLeirdueRefreshRequest } from "@/lib/leirdue/refreshAuth";
import { parseLeirdueSharedResultListHtml } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

const BASE = "https://www.leirdue.net/";
const RECENT_WINDOW_DAYS = 14;
const EVENT_BATCH_LIMIT = 8;
const LIST_BATCH_LIMIT = 20;
const FETCH_TIMEOUT_MS = 8000;
const PARSER_VERSION = "leirdue-shared-v1";
const JOB_NAME = "leirdue_refresh_recent";

type Service = SupabaseClient;
type EventRow = { event_id: string; source_url: string | null; event_title: string | null; event_date: string | null; year: number | null };
type ListRow = { event_id: string; liste_id: string; source_url: string | null; list_title: string | null; year?: number | null; ingestion_error?: string | null };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function authorized(request: Request) {
  return isAuthorizedLeirdueRefreshRequest(request);
}

function absoluteUrl(url: string) { return new URL(url.replace(/&amp;/g, "&"), BASE).toString(); }
function stripTags(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function eventIdFromUrl(url: string) { try { return new URL(url, BASE).searchParams.get("stevne"); } catch { return null; } }
function listeIdFromUrl(url: string) { try { return new URL(url, BASE).searchParams.get("liste_id"); } catch { return null; } }
function eventMenuUrl(eventId: string) { return `${BASE}?stevne=${encodeURIComponent(eventId)}&meny=resultater`; }
function resultIdentity(row: { year: number; event_id: string | null; liste_id: string | null; source_url: string; normalized_name: string; discipline: string | null; event_date: string | null; score: number | null; total_targets: number | null }) { return createHash("sha256").update([row.year, row.event_id || "", row.liste_id || "", row.source_url, row.normalized_name, row.discipline || "", row.event_date || "", row.score ?? "", row.total_targets ?? ""].join("|")).digest("hex"); }

function cutoffDate(now = new Date(), windowDays = RECENT_WINDOW_DAYS) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - windowDays);
  return date.toISOString().slice(0, 10);
}

function parseNorwegianDate(text: string, fallbackYear: number) {
  const full = text.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](20\d{2})\b/);
  const partial = full || text.match(/\b(\d{1,2})[.\/](\d{1,2})(?![.\/])\b/);
  if (!partial) return null;
  const day = Number(partial[1]);
  const month = Number(partial[2]);
  const year = full ? Number(full[3]) : fallbackYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "ClayPerformanceLab Leirdue recent refresh/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}

function eventLinksForRecentWindow(html: string, year: number, cutoff: string) {
  const marked = html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_all, href, label) => `\n[[LINK ${absoluteUrl(href)}]]${stripTags(label)}[[/LINK]]\n`).replace(/<(br|p|div|tr|td|th|li|h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  let currentYear: number | null = null;
  const events = new Map<string, { event_id: string; source_url: string; event_title: string; raw_overview_text: string; event_date: string | null }>();
  for (const raw of marked.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^20\d{2}$/.test(line)) { currentYear = Number(line); continue; }
    const match = line.match(/^\[\[LINK (.*?)\]\](.*?)\[\[\/LINK\]\]$/);
    if (!match || currentYear !== year) continue;
    const eventId = eventIdFromUrl(match[1]);
    if (!eventId) continue;
    const eventDate = parseNorwegianDate(line, year);
    if (eventDate && eventDate < cutoff) continue;
    events.set(eventId, { event_id: eventId, source_url: eventMenuUrl(eventId), event_title: match[2] || `Leirdue event ${eventId}`, raw_overview_text: line, event_date: eventDate });
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

function rowsFromResultList(html: string, list: ListRow, year: number) {
  const sourceUrl = list.source_url || `${BASE}?stevne=${list.event_id}&meny=resultater&liste_id=${list.liste_id}`;
  return parseLeirdueSharedResultListHtml({ html, url: sourceUrl, year, listTitle: list.list_title }).map((parsed) => {
    const row = { year, event_id: list.event_id, liste_id: list.liste_id, normalized_name: nordicSafeNameKey(parsed.originalName), original_name: parsed.originalName, club: parsed.club, placement: parsed.placement, score: parsed.score, total_targets: parsed.totalTargets, winning_score: parsed.winningScore, series_scores: parsed.seriesScores, discipline: parsed.discipline, event_date: parsed.eventDate, event_title: parsed.eventTitle, organizer: parsed.organizer, source_url: sourceUrl, raw_row: parsed.rawRow, validation_status: parsed.validationStatus, parser_version: PARSER_VERSION, parsed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    return { ...row, result_identity: resultIdentity(row) };
  });
}

async function recordJobHealth(service: Service, input: { startedAt: string; status: "success" | "partial" | "failed"; refreshedCount: number; errorCount: number; failureReason: string | null; affectedScope: Record<string, unknown> }) {
  const finishedAt = new Date().toISOString();
  const { data: previous } = await service.from("leirdue_job_health").select("last_success_at").eq("job_name", JOB_NAME).maybeSingle();
  await service.from("leirdue_job_health").upsert({ job_name: JOB_NAME, started_at: input.startedAt, finished_at: finishedAt, status: input.status, refreshed_count: input.refreshedCount, error_count: input.errorCount, last_success_at: input.status === "success" || input.status === "partial" ? finishedAt : previous?.last_success_at || null, failure_reason: input.failureReason, affected_scope: input.affectedScope, updated_at: finishedAt }, { onConflict: "job_name" });
}

async function refreshRecent(service: Service, now = new Date()) {
  const year = now.getUTCFullYear();
  const cutoff = cutoffDate(now);
  const errors: unknown[] = [];
  let eventsDiscovered = 0, eventsProcessed = 0, listsDiscovered = 0, listsProcessed = 0, shooterRows = 0;
  const html = await fetchHtml(`${BASE}?resultater=`);
  const recentEvents = eventLinksForRecentWindow(html, year, cutoff);
  eventsDiscovered = recentEvents.length;
  if (recentEvents.length) await service.from("leirdue_event_index").upsert(recentEvents.map((event) => ({ ...event, year, ingestion_status: "pending", last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })), { onConflict: "event_id" });

  const { data: eventData } = await service.from("leirdue_event_index").select("event_id,source_url,event_title,event_date,year").eq("year", year).or(`event_date.gte.${cutoff},event_date.is.null`).order("event_date", { ascending: false, nullsFirst: false }).limit(EVENT_BATCH_LIMIT);
  for (const event of (eventData || []) as EventRow[]) {
    try {
      const eventHtml = await fetchHtml(event.source_url || eventMenuUrl(event.event_id));
      const lists = listeLinksFromHtml(eventHtml, event.event_id, year);
      if (lists.length) await service.from("leirdue_result_list_index").upsert(lists.map((list) => ({ ...list, list_type: list.list_title, ingestion_status: "pending", updated_at: new Date().toISOString() })), { onConflict: "event_id,liste_id" });
      await service.from("leirdue_event_index").update({ ingestion_status: "completed", last_fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(), ingestion_error: null }).eq("event_id", event.event_id);
      eventsProcessed += 1; listsDiscovered += lists.length;
    } catch (error) { errors.push({ eventId: event.event_id, error: String(error) }); }
  }

  const { data: listData } = await service.from("leirdue_result_list_index").select("event_id,liste_id,source_url,list_title,year,ingestion_error").eq("year", year).in("ingestion_status", ["pending", "completed", "needs_review"]).limit(LIST_BATCH_LIMIT);
  for (const list of (listData || []) as ListRow[]) {
    try {
      const listHtml = await fetchHtml(list.source_url || `${BASE}?stevne=${list.event_id}&meny=resultater&liste_id=${list.liste_id}`);
      const rows = rowsFromResultList(listHtml, list, year);
      if (rows.length) await service.from("leirdue_shared_shooter_results").upsert(rows, { onConflict: "result_identity" });
      await service.from("leirdue_result_list_index").update({ ingestion_status: rows.length ? "completed" : "needs_review", is_valid_single_event_result: rows.length > 0, last_fetched_at: new Date().toISOString(), ingestion_error: rows.length ? null : "Recent refresh found no shooter rows", updated_at: new Date().toISOString() }).eq("event_id", list.event_id).eq("liste_id", list.liste_id);
      listsProcessed += 1; shooterRows += rows.length;
    } catch (error) { errors.push({ listeId: list.liste_id, error: String(error) }); }
  }
  return { year, cutoff, eventsDiscovered, eventsProcessed, listsDiscovered, listsProcessed, shooterRows, errors };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const service = serviceClient();
  if (!service) return NextResponse.json({ error: "Missing service-role Supabase context." }, { status: 500 });
  const startedAt = new Date().toISOString();
  try {
    const result = await refreshRecent(service);
    const status = result.errors.length === 0 ? "success" : result.shooterRows > 0 || result.listsProcessed > 0 || result.eventsProcessed > 0 ? "partial" : "failed";
    await recordJobHealth(service, { startedAt, status, refreshedCount: result.shooterRows, errorCount: result.errors.length, failureReason: result.errors.length ? JSON.stringify(result.errors.slice(-3)) : null, affectedScope: { year: result.year, recentWindowDays: RECENT_WINDOW_DAYS, cutoff: result.cutoff, eventsDiscovered: result.eventsDiscovered, eventsProcessed: result.eventsProcessed, listsDiscovered: result.listsDiscovered, listsProcessed: result.listsProcessed } });
    return NextResponse.json({ ok: status !== "failed", jobName: JOB_NAME, status, recentWindowDays: RECENT_WINDOW_DAYS, ...result });
  } catch (error) {
    await recordJobHealth(service, { startedAt, status: "failed", refreshedCount: 0, errorCount: 1, failureReason: String(error), affectedScope: { recentWindowDays: RECENT_WINDOW_DAYS } });
    return NextResponse.json({ ok: false, jobName: JOB_NAME, status: "failed", error: "Recent Leirdue refresh failed." }, { status: 500 });
  }
}

export const POST = GET;
export const __test = { RECENT_WINDOW_DAYS, cutoffDate, eventLinksForRecentWindow, authorized };
