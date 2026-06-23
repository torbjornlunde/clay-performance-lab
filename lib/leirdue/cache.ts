import "server-only";
import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeirdueCandidate, LeirdueCheckedListDebug, LeirdueSearchDebug } from "@/lib/leirdue/types";
import { extractLeirdueSourceIdentifiers, leirdueNameMatchReason, namesLikelyMatch, nordicSafeNameKey, profileNameContainedInShooterText } from "@/lib/leirdue/normalize";

const CURRENT_YEAR_TTL_DAYS = 7;
const PAST_YEAR_TTL_DAYS = 90;

export type LeirdueCacheStats = {
  enabled: boolean;
  cachedCandidatesFound: number;
  liveCandidatesStored: number;
  cacheMiss: boolean;
  staleCache: boolean;
  staleRowsFound: number;
  cacheUsed: boolean;
  cacheReadOk: boolean;
  cachedImportableCandidatesFound: number;
  eventHits: number;
  listHits: number;
  invalidListKeys: string[];
  invalidListsStored: number;
  serviceRoleCacheWriteEnabled: boolean;
  cacheWriteOk: boolean;
  cacheWriteErrors: string[];
  cacheWriteWarnings: string[];
  cacheReadErrors: string[];
  note: string | null;
};

type CachedResultRow = {
  event_id: string | null;
  liste_id: string | null;
  source_url: string;
  year: number;
  event_date: string | null;
  event_title: string | null;
  organizer: string | null;
  discipline: string | null;
  shooter_name_display: string | null;
  club: string | null;
  own_score: number | null;
  total_targets: number | null;
  winning_score: number | null;
  placement: number | null;
  row_fingerprint: string;
  candidate_quality: string | null;
  is_importable: boolean | null;
  not_importable_reason: string | null;
  raw_row_text: string | null;
  parsed_at: string | null;
};

function supabaseReadClient(authorization: string | null | undefined): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !authorization) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

function supabaseServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export function emptyLeirdueCacheStats(note: string | null = null): LeirdueCacheStats {
  return { enabled: false, cachedCandidatesFound: 0, liveCandidatesStored: 0, cacheMiss: false, staleCache: false, staleRowsFound: 0, cacheUsed: false, cacheReadOk: false, cachedImportableCandidatesFound: 0, eventHits: 0, listHits: 0, invalidListKeys: [], invalidListsStored: 0, serviceRoleCacheWriteEnabled: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), cacheWriteOk: false, cacheWriteErrors: note ? [note] : [], cacheWriteWarnings: [], cacheReadErrors: note ? [note] : [], note };
}

export function leirdueCacheTtlDaysForYear(year: number) {
  const currentYear = new Date().getFullYear();
  if (year >= currentYear) return CURRENT_YEAR_TTL_DAYS;
  if (year >= currentYear - 1) return PAST_YEAR_TTL_DAYS;
  return 36500;
}

function ttlDaysForYear(year: number) {
  return leirdueCacheTtlDaysForYear(year);
}

export function leirdueCanonicalListeIdKey(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl.replace(/&amp;/g, "&"), "https://www.leirdue.net/");
    const listeId = url.searchParams.get("liste_id");
    const stevneId = url.searchParams.get("stevne");
    if (listeId) return `liste:${stevneId || "none"}:${listeId}`;
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

function freshCutoffIso(year: number) {
  return new Date(Date.now() - ttlDaysForYear(year) * 24 * 60 * 60 * 1000).toISOString();
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validIsoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sanitizeLeirdueDateForDb(value: string | null | undefined, context: string, warnings: string[]) {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const first = Number(iso[2]);
    const second = Number(iso[3]);
    const normal = validIsoDate(year, first, second);
    if (normal) return normal;
    const swapped = first > 12 ? validIsoDate(year, second, first) : null;
    if (swapped) {
      warnings.push(`${context}: corrected invalid date ${trimmed} to ${swapped}.`);
      return swapped;
    }
    warnings.push(`${context}: invalid date ${trimmed}; stored null.`);
    return null;
  }
  const norwegian = trimmed.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](20\d{2})$/);
  if (norwegian) {
    const normalized = validIsoDate(Number(norwegian[3]), Number(norwegian[2]), Number(norwegian[1]));
    if (normalized) return normalized;
    warnings.push(`${context}: invalid date ${trimmed}; stored null.`);
    return null;
  }
  warnings.push(`${context}: unparseable date ${trimmed}; stored null.`);
  return null;
}

function rowFingerprint(candidate: LeirdueCandidate) {
  return createHash("sha256")
    .update([candidate.leirdueUrl, candidate.date || "", candidate.shooterName || "", candidate.ownScore ?? "", candidate.totalTargets ?? "", candidate.winningScore ?? "", candidate.placement ?? ""].join("|"))
    .digest("hex");
}

function candidateToCacheRow(candidate: LeirdueCandidate, year: number) {
  const ids = { stevneId: candidate.stevneId || extractLeirdueSourceIdentifiers(candidate.leirdueUrl).stevneId, listeId: candidate.listeId || extractLeirdueSourceIdentifiers(candidate.leirdueUrl).listeId };
  const notImportable = candidate.category === "control" ? candidate.warnings?.[0] || candidate.notes || "Not importable." : null;
  const reviewableResult = candidate.category !== "control" && candidate.ownScore !== null && candidate.totalTargets !== null;
  return {
    event_id: ids.stevneId,
    liste_id: ids.listeId,
    source_url: candidate.leirdueUrl,
    year,
    event_date: candidate.date,
    event_title: candidate.name,
    organizer: candidate.shootingGround,
    discipline: candidate.discipline,
    shooter_name_normalized: nordicSafeNameKey(candidate.shooterName || ""),
    shooter_name_display: candidate.shooterName || null,
    club: candidate.shootingGround,
    own_score: candidate.ownScore,
    total_targets: candidate.totalTargets,
    winning_score: candidate.winningScore,
    placement: candidate.placement ?? null,
    row_fingerprint: rowFingerprint(candidate),
    candidate_quality: `${candidate.category}/${candidate.confidence}`,
    is_importable: reviewableResult,
    not_importable_reason: notImportable,
    raw_row_text: candidate.notes,
    parsed_at: new Date().toISOString(),
  };
}

function cacheRowToCandidate(row: CachedResultRow): LeirdueCandidate {
  const [storedCategory = "review", confidence = "medium"] = (row.candidate_quality || "review/medium").split("/");
  const category = storedCategory === "recommended" || storedCategory === "review" || storedCategory === "control" ? storedCategory : row.is_importable === false ? "control" : "review";
  return {
    date: row.event_date,
    name: row.event_title || "Leirdue.net cached result",
    shootingGround: row.organizer || row.club,
    discipline: row.discipline || "Other",
    ownScore: row.own_score,
    totalTargets: row.total_targets,
    winningScore: row.winning_score,
    maxScore: row.total_targets,
    placement: row.placement,
    seriesScores: [],
    shooterName: row.shooter_name_display,
    shooterClass: null,
    stevneId: row.event_id,
    listeId: row.liste_id,
    warnings: row.not_importable_reason ? [row.not_importable_reason] : [],
    duplicateStatus: "new",
    duplicateMatches: [],
    shooterMatchStatus: null,
    shooterMatchReason: null,
    leirdueUrl: row.source_url,
    listType: null,
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium",
    notes: `${row.raw_row_text || ""} Cache source: leirdue_parsed_result_cache. Cached at ${row.parsed_at || "unknown"}.`.trim(),
    category: category === "recommended" || category === "review" || category === "control" ? category : "review",
    importRecommended: row.is_importable === true && category === "recommended",
  };
}

export async function getCachedLeirdueCandidates(input: { shooterName: string; year: number; disciplines: string[]; authorization?: string | null }) {
  const supabase = supabaseReadClient(input.authorization);
  if (!supabase) return { candidates: [] as LeirdueCandidate[], stats: emptyLeirdueCacheStats("Cache read skipped: missing authenticated cache read context.") };
  const normalizedName = nordicSafeNameKey(input.shooterName);
  const cutoff = freshCutoffIso(input.year);
  const [{ data, error }, staleResult, eventResult, listResult] = await Promise.all([
    supabase
      .from("leirdue_parsed_result_cache")
      .select("*")
      .eq("year", input.year)
      .eq("shooter_name_normalized", normalizedName)
      .gte("parsed_at", cutoff)
      .limit(200),
    supabase
      .from("leirdue_parsed_result_cache")
      .select("id", { count: "exact", head: true })
      .eq("year", input.year)
      .eq("shooter_name_normalized", normalizedName)
      .lt("parsed_at", cutoff),
    supabase
      .from("leirdue_event_index")
      .select("event_id")
      .eq("year", input.year)
      .gte("last_fetched_at", cutoff)
      .limit(500),
    supabase
      .from("leirdue_result_list_index")
      .select("event_id,liste_id,source_url,is_valid_single_event_result,is_ranking_or_control,is_multi_event_or_cup,last_fetched_at")
      .gte("last_fetched_at", cutoff)
      .limit(1000),
  ]);
  if (error) return { candidates: [] as LeirdueCandidate[], stats: { ...emptyLeirdueCacheStats(`Cache read failed: ${error.message}`), cacheReadErrors: [`Cache read failed: ${error.message}`] } };
  const rows = (data || []) as CachedResultRow[];
  const listRows = (listResult.data || []) as { event_id: string; liste_id: string; source_url: string | null; is_valid_single_event_result: boolean; is_ranking_or_control: boolean; is_multi_event_or_cup: boolean }[];
  const invalidListKeys = listRows
    .filter((row) => !row.is_valid_single_event_result || row.is_ranking_or_control || row.is_multi_event_or_cup)
    .map((row) => leirdueCanonicalListeIdKey(row.source_url || `https://www.leirdue.net/?stevne=${row.event_id}&meny=resultater&liste_id=${row.liste_id}`));
  const filtered = input.disciplines.length > 0 ? rows.filter((row) => !row.discipline || input.disciplines.includes(row.discipline)) : rows;
  const candidates = filtered.map(cacheRowToCandidate);
  const reviewableCachedCandidates = candidates.filter((candidate) => candidate.category !== "control" && candidate.ownScore !== null && candidate.totalTargets !== null);
  const readErrors = [
    staleResult.error ? `Cache stale-row read failed: ${staleResult.error.message}` : null,
    listResult.error ? `Cache list read failed: ${listResult.error.message}` : null,
    eventResult.error ? `Cache event read failed: ${eventResult.error.message}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    candidates,
    stats: { enabled: true, cachedCandidatesFound: filtered.length, liveCandidatesStored: 0, cacheMiss: filtered.length === 0, staleCache: (staleResult.count || 0) > 0, staleRowsFound: staleResult.count || 0, cacheUsed: filtered.length > 0, cacheReadOk: readErrors.length === 0, cachedImportableCandidatesFound: reviewableCachedCandidates.length, eventHits: eventResult.data?.length || 0, listHits: listRows.length, invalidListKeys, invalidListsStored: 0, serviceRoleCacheWriteEnabled: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), cacheWriteOk: false, cacheWriteErrors: [], cacheWriteWarnings: [], cacheReadErrors: readErrors, note: readErrors[0] || null },
  };
}

export async function storeLeirdueCandidatesInCache(candidates: LeirdueCandidate[], year: number) {
  const supabase = supabaseServiceClient();
  if (!supabase || candidates.length === 0) return { ...emptyLeirdueCacheStats(!supabase ? "Cache write skipped: missing SUPABASE_SERVICE_ROLE_KEY." : null), serviceRoleCacheWriteEnabled: Boolean(supabase) };
  const dateWarnings: string[] = [];
  const rows = candidates.filter((candidate) => candidate.leirdueUrl && candidate.shooterName).map((candidate) => candidateToCacheRow(candidate, year));
  for (const row of rows) row.event_date = sanitizeLeirdueDateForDb(row.event_date, `parsed result ${row.event_id || row.source_url}`, dateWarnings);
  if (rows.length === 0) return { ...emptyLeirdueCacheStats("Cache write skipped: no cacheable candidates."), serviceRoleCacheWriteEnabled: Boolean(supabase) };
  const eventRows = Array.from(new Map(rows.filter((row) => row.event_id).map((row) => [row.event_id, {
    event_id: row.event_id,
    source_url: row.source_url,
    year: row.year,
    event_date: sanitizeLeirdueDateForDb(row.event_date, `event ${row.event_id || row.source_url}`, dateWarnings),
    event_title: row.event_title,
    organizer: row.organizer,
    detected_disciplines: row.discipline ? [row.discipline] : [],
    raw_overview_text: row.raw_row_text,
    is_ranking_or_control: row.is_importable === false,
    is_multi_event_or_cup: row.not_importable_reason ? /cup|series|multi-event|flere stevner/i.test(row.not_importable_reason) : false,
    last_seen_at: new Date().toISOString(),
    last_fetched_at: new Date().toISOString(),
  }])).values());
  const listRows = Array.from(new Map(rows.filter((row) => row.event_id && row.liste_id).map((row) => [`${row.event_id}:${row.liste_id}`, {
    event_id: row.event_id,
    liste_id: row.liste_id,
    source_url: row.source_url,
    list_title: row.event_title,
    list_type: row.candidate_quality,
    is_valid_single_event_result: row.is_importable === true,
    is_ranking_or_control: row.is_importable === false,
    is_multi_event_or_cup: row.not_importable_reason ? /cup|series|multi-event|flere stevner/i.test(row.not_importable_reason) : false,
    detected_disciplines: row.discipline ? [row.discipline] : [],
    last_fetched_at: new Date().toISOString(),
  }])).values());
  const writeErrors: string[] = [];
  if (eventRows.length > 0) {
    const { error } = await supabase.from("leirdue_event_index").upsert(eventRows, { onConflict: "event_id" });
    if (error) writeErrors.push(`Event cache write failed: ${error.message}`);
  }
  if (listRows.length > 0) {
    const { error } = await supabase.from("leirdue_result_list_index").upsert(listRows, { onConflict: "event_id,liste_id" });
    if (error) writeErrors.push(`List cache write failed: ${error.message}`);
  }
  const { error } = await supabase.from("leirdue_parsed_result_cache").upsert(rows, { onConflict: "source_url,row_fingerprint" });
  if (error) writeErrors.push(`Parsed result cache write failed: ${error.message}`);
  return { enabled: true, cachedCandidatesFound: 0, liveCandidatesStored: writeErrors.length ? 0 : rows.length, cacheMiss: false, staleCache: false, staleRowsFound: 0, cacheUsed: false, cacheReadOk: false, cachedImportableCandidatesFound: 0, eventHits: 0, listHits: 0, invalidListKeys: [], invalidListsStored: 0, serviceRoleCacheWriteEnabled: true, cacheWriteOk: writeErrors.length === 0, cacheWriteErrors: writeErrors, cacheWriteWarnings: dateWarnings, cacheReadErrors: [], note: writeErrors[0] || null };
}

export async function storeLeirdueInvalidListDecisionsInCache(checkedLists: LeirdueCheckedListDebug[]) {
  const supabase = supabaseServiceClient();
  if (!supabase) return emptyLeirdueCacheStats("Invalid list cache write skipped: missing SUPABASE_SERVICE_ROLE_KEY.");
  const now = new Date().toISOString();
  const rows = checkedLists
    .filter((item) => item.stevneId && item.listeId && item.reason && /invalid|summary|ranking|cup|multi-event|flere stevner|prosent|klassef.ring|control/i.test(item.reason))
    .map((item) => ({
      event_id: item.stevneId as string,
      liste_id: item.listeId as string,
      source_url: item.sourceUrl,
      list_title: item.eventName,
      list_type: item.status,
      is_valid_single_event_result: false,
      is_ranking_or_control: /ranking|klassef.ring|control|prosent/i.test(item.reason || ""),
      is_multi_event_or_cup: /cup|series|summary|multi-event|flere stevner|sammenlagt/i.test(item.reason || ""),
      detected_disciplines: [],
      last_fetched_at: now,
    }));
  const uniqueRows = Array.from(new Map(rows.map((row) => [`${row.event_id}:${row.liste_id}`, row])).values());
  if (uniqueRows.length === 0) return emptyLeirdueCacheStats(null);
  const { error } = await supabase.from("leirdue_result_list_index").upsert(uniqueRows, { onConflict: "event_id,liste_id" });
  return { ...emptyLeirdueCacheStats(error ? `Invalid list cache write failed: ${error.message}` : null), enabled: true, serviceRoleCacheWriteEnabled: true, cacheWriteOk: !error, cacheWriteErrors: error ? [`Invalid list cache write failed: ${error.message}`] : [], cacheWriteWarnings: [], invalidListsStored: error ? 0 : uniqueRows.length };
}


export type LeirdueCrawlProgress = {
  scope_key: string;
  selected_year: number;
  shooter_name_normalized: string;
  selected_disciplines: string[];
  status: "incomplete" | "complete" | "failed";
  continuation_token: string | null;
  scanned_event_ids: string[];
  scanned_liste_id_keys: string[];
  total_discovered_work: number | null;
  processed_work_count: number;
  remaining_work_count: number | null;
  last_stop_reason: string | null;
  last_completed_batch: number | null;
  last_run_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

export function leirdueSearchScopeKey(input: { shooterName: string; year: number; disciplines: string[] }) {
  const name = nordicSafeNameKey(input.shooterName);
  const disciplines = input.disciplines.map((discipline) => discipline.trim().toLowerCase()).filter(Boolean).sort();
  return `${input.year}:${name}:${disciplines.join("|")}`;
}

function decodeContinuationProgress(token: string | null | undefined) {
  if (!token) return { scannedEventIds: [] as string[], scannedListeIdKeys: [] as string[] };
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { scannedEventIds?: unknown; scannedListeIdKeys?: unknown };
    return {
      scannedEventIds: Array.isArray(parsed.scannedEventIds) ? parsed.scannedEventIds.filter((id): id is string => typeof id === "string") : [],
      scannedListeIdKeys: Array.isArray(parsed.scannedListeIdKeys) ? parsed.scannedListeIdKeys.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return { scannedEventIds: [] as string[], scannedListeIdKeys: [] as string[] };
  }
}

export async function getLeirdueCrawlProgress(input: { shooterName: string; year: number; disciplines: string[]; authorization?: string | null }) {
  const supabase = supabaseReadClient(input.authorization);
  if (!supabase) return { progress: null as LeirdueCrawlProgress | null, error: "Crawl progress read skipped: missing authenticated cache read context." };
  const scopeKey = leirdueSearchScopeKey(input);
  const { data, error } = await supabase.from("leirdue_search_crawl_state").select("*").eq("scope_key", scopeKey).maybeSingle();
  if (error) return { progress: null as LeirdueCrawlProgress | null, error: `Crawl progress read failed: ${error.message}` };
  return { progress: (data as LeirdueCrawlProgress | null) || null, error: null as string | null };
}

export async function storeLeirdueCrawlProgress(input: { shooterName: string; year: number; disciplines: string[]; debug: LeirdueSearchDebug; continuationToken?: string | null }) {
  const supabase = supabaseServiceClient();
  if (!supabase) return { ok: false, error: "Crawl progress write skipped: missing SUPABASE_SERVICE_ROLE_KEY." };
  const scopeKey = leirdueSearchScopeKey(input);
  const remainingWork = input.debug.pendingListeIdQueueRemaining + input.debug.remainingEventQueueCount;
  const complete = !input.continuationToken && input.debug.continuationAvailable === false && remainingWork === 0 && !input.debug.timedOut && !input.debug.limitReached && input.debug.cacheDiagnostics.completionProof.valid;
  const failed = !complete && Boolean(input.debug.errorMessage);
  const decoded = decodeContinuationProgress(input.continuationToken);
  const now = new Date().toISOString();
  const row = {
    scope_key: scopeKey,
    selected_year: input.year,
    shooter_name_normalized: nordicSafeNameKey(input.shooterName),
    selected_disciplines: input.disciplines,
    status: complete ? "complete" : failed ? "failed" : "incomplete",
    continuation_token: input.continuationToken || null,
    scanned_event_ids: decoded.scannedEventIds.length ? decoded.scannedEventIds : input.debug.eventIdsInspected,
    scanned_liste_id_keys: decoded.scannedListeIdKeys,
    total_discovered_work: input.debug.listeIdLinksExtracted + input.debug.selectedYearEventLinksCount,
    processed_work_count: input.debug.scannedListeIdTotal + input.debug.scannedEventTotal,
    remaining_work_count: remainingWork,
    last_stop_reason: complete ? "completionProofValid" : input.debug.continuationStopReason || input.debug.scanStoppedReason || input.debug.eventStopReason,
    last_completed_batch: input.debug.batchNumber,
    last_run_at: now,
    completed_at: complete ? now : null,
    updated_at: now,
  };
  const { error } = await supabase.from("leirdue_search_crawl_state").upsert(row, { onConflict: "scope_key" });
  return { ok: !error, error: error ? `Crawl progress write failed: ${error.message}` : null, status: row.status, remainingWork, processedWorkCount: row.processed_work_count };
}

export async function repairLeirdueInvalidCompleteState(input: { shooterName: string; year: number; disciplines: string[] }) {
  const supabase = supabaseServiceClient();
  if (!supabase) return { ok: false, error: "Invalid complete-state repair skipped: missing SUPABASE_SERVICE_ROLE_KEY.", status: null as string | null };
  const scopeKey = leirdueSearchScopeKey(input);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("leirdue_search_crawl_state")
    .update({
      status: "incomplete",
      continuation_token: null,
      remaining_work_count: 1,
      last_stop_reason: "invalidCompleteStateRevalidationRequired",
      completed_at: null,
      updated_at: now,
      last_run_at: now,
    })
    .eq("scope_key", scopeKey);
  return { ok: !error, error: error ? `Invalid complete-state repair failed: ${error.message}` : null, status: error ? null : "incomplete" };
}

export async function storeLeirdueCrawlIndexesInCache(debug: LeirdueSearchDebug, year: number) {
  const supabase = supabaseServiceClient();
  if (!supabase) return emptyLeirdueCacheStats("Crawl index cache write skipped: missing SUPABASE_SERVICE_ROLE_KEY.");
  const now = new Date().toISOString();
  const dateWarnings: string[] = [];
  const eventRows = debug.selectedYearEventLinks
    .filter((event) => event.eventId)
    .map((event) => ({
      event_id: event.eventId,
      source_url: event.url,
      year,
      event_date: sanitizeLeirdueDateForDb(event.actualEventDate || event.date, `event ${event.eventId}`, dateWarnings),
      event_title: event.eventTitle || event.titleText,
      organizer: event.organizerText,
      detected_disciplines: [],
      raw_overview_text: event.rawRowSnippet,
      is_ranking_or_control: /ranking|klasseføring|klasseforing|control|trening|training/i.test(`${event.titleText} ${event.eventTitle} ${event.rawRowSnippet}`),
      is_multi_event_or_cup: /cup|series|flere stevner|sammenlagt etter/i.test(`${event.titleText} ${event.eventTitle} ${event.rawRowSnippet}`),
      last_seen_at: now,
      last_fetched_at: event.inspected ? now : null,
    }));
  const checkedListRows = debug.checkedLists
    .filter((item) => item.stevneId && item.listeId)
    .map((item) => {
      const reason = item.reason || "";
      const invalid = item.status === "unsupported format" || /invalid|summary|ranking|cup|multi-event|flere stevner|prosent|klassef.ring|control/i.test(reason);
      return {
        event_id: item.stevneId as string,
        liste_id: item.listeId as string,
        source_url: item.sourceUrl,
        list_title: item.eventName,
        list_type: item.status,
        is_valid_single_event_result: !invalid && item.status === "parsed",
        is_ranking_or_control: /ranking|klassef.ring|control|prosent/i.test(reason),
        is_multi_event_or_cup: /cup|series|summary|multi-event|flere stevner|sammenlagt/i.test(reason),
        detected_disciplines: [],
        last_fetched_at: now,
      };
    });
  const resultMenuRows = debug.resultMenuDebug.flatMap((menu) =>
    menu.firstListeIdUrls.map((sourceUrl) => {
      const ids = extractLeirdueSourceIdentifiers(sourceUrl);
      return ids.stevneId && ids.listeId ? {
        event_id: ids.stevneId,
        liste_id: ids.listeId,
        source_url: sourceUrl,
        list_title: null,
        list_type: "discovered",
        is_valid_single_event_result: false,
        is_ranking_or_control: false,
        is_multi_event_or_cup: false,
        detected_disciplines: [],
        last_fetched_at: null,
      } : null;
    }).filter((row): row is NonNullable<typeof row> => Boolean(row)),
  );
  const uniqueEventRows = Array.from(new Map(eventRows.map((row) => [row.event_id, row])).values());
  const uniqueListRows = Array.from(new Map([...resultMenuRows, ...checkedListRows].map((row) => [`${row.event_id}:${row.liste_id}`, row])).values());
  const writeErrors: string[] = [];
  if (uniqueEventRows.length > 0) {
    const { error } = await supabase.from("leirdue_event_index").upsert(uniqueEventRows, { onConflict: "event_id" });
    if (error) writeErrors.push(`Crawl event index write failed: ${error.message}`);
  }
  if (uniqueListRows.length > 0) {
    const { error } = await supabase.from("leirdue_result_list_index").upsert(uniqueListRows, { onConflict: "event_id,liste_id" });
    if (error) writeErrors.push(`Crawl list index write failed: ${error.message}`);
  }
  return { ...emptyLeirdueCacheStats(writeErrors[0] || null), enabled: true, serviceRoleCacheWriteEnabled: true, cacheWriteOk: writeErrors.length === 0, cacheWriteErrors: writeErrors, cacheWriteWarnings: dateWarnings, invalidListsStored: checkedListRows.filter((row) => !row.is_valid_single_event_result).length };
}

export type SharedLeirdueSearchStats = {
  ok: boolean;
  error: string | null;
  queryDurationMs: number;
  rowsFound: number;
  totalRows: number;
  validCount: number;
  needsReviewCount: number;
  invalidCount: number;
  failedCount: number;
  reviewableCount: number;
  ignoredInvalidCount: number;
  exactNameRowsFound: number;
  clubSuffixedRowsFound: number;
  ambiguousNameRowsRejected: number;
  rowsBeforeSemanticDeduplication: number;
  canonicalCandidatesAfterSemanticDeduplication: number;
  duplicateSourceListsHidden: number;
  acceptedNameMatchReasons: string[];
  semanticEventGroupDiagnostics: string[];
  coverageStatus: "unknown" | "not_started" | "incomplete" | "complete";
  indexingComplete: boolean;
  liveCrawlStarted: false;
};

type SharedResultRow = {
  event_id: string | null;
  liste_id: string | null;
  normalized_name: string;
  original_name: string | null;
  club: string | null;
  placement: number | null;
  score: number | null;
  total_targets: number | null;
  winning_score: number | null;
  series_scores: number[] | null;
  discipline: string | null;
  event_date: string | null;
  event_title: string | null;
  organizer: string | null;
  source_url: string;
  raw_row: string | null;
  validation_status: "valid" | "needs_review" | "invalid" | "failed";
  parsed_at: string | null;
};



function sharedRowDerivedScoreAndTargets(row: SharedResultRow) {
  const numericCells = Array.isArray(row.series_scores) ? row.series_scores.filter((value) => Number.isFinite(value)) : [];
  const supportedTargetTotals = [25, 50, 75, 100, 125, 150, 200];
  const score = row.score;
  const storedTotal = row.total_targets;
  const trustedSeriesFor = (targetTotal: number | null) => {
    if (score === null || targetTotal === null || targetTotal % 25 !== 0) return [] as number[];
    const expectedSeriesCount = targetTotal / 25;
    if (expectedSeriesCount < 2 || expectedSeriesCount > 10 || numericCells.length < expectedSeriesCount) return [] as number[];
    const candidateSeries = numericCells.slice(-expectedSeriesCount);
    const candidateSum = candidateSeries.reduce((total, value) => total + value, 0);
    return candidateSeries.every((value) => value >= 0 && value <= 25) && candidateSum === score ? candidateSeries : [];
  };
  const evidenceFor = (seriesScores: number[], message: string) => {
    const excludedNumericValues = seriesScores.length ? numericCells.slice(0, Math.max(0, numericCells.length - seriesScores.length)) : numericCells;
    const trustedSeriesEvidence = seriesScores.length ? ` Trusted series values: ${seriesScores.join("+")}.` : "";
    const excludedNumericEvidence = excludedNumericValues.length ? ` Excluded numeric cells from score reconstruction: ${excludedNumericValues.join("+")}.` : "";
    return `${message}.${trustedSeriesEvidence}${excludedNumericEvidence}`.trim();
  };
  if (score === null || storedTotal === null) {
    return { score, totalTargets: storedTotal, seriesScores: [] as number[], evidence: evidenceFor([], "missing stored score or target evidence") };
  }
  if (supportedTargetTotals.includes(storedTotal)) {
    const trustedSeries = trustedSeriesFor(storedTotal);
    return { score, totalTargets: storedTotal, seriesScores: trustedSeries, evidence: evidenceFor(trustedSeries, "stored score/target columns") };
  }
  const nextSupportedTotal = supportedTargetTotals.find((targetTotal) => score <= targetTotal);
  const trustedSeriesForNextTotal = nextSupportedTotal === undefined ? [] as number[] : trustedSeriesFor(nextSupportedTotal);
  const canRepairNearProgrammeTotal = nextSupportedTotal !== undefined && Math.abs(nextSupportedTotal - storedTotal) <= 6 && (nextSupportedTotal <= 100 || trustedSeriesForNextTotal.length >= 2);
  if (canRepairNearProgrammeTotal) {
    const trustedSeries = trustedSeriesForNextTotal;
    return {
      score,
      totalTargets: nextSupportedTotal,
      seriesScores: trustedSeries,
      evidence: evidenceFor(trustedSeries, `stored shooter score with corrected programme target total ${storedTotal}->${nextSupportedTotal}`),
    };
  }
  return { score, totalTargets: storedTotal, seriesScores: [] as number[], evidence: evidenceFor([], `stored score with unsupported target total ${storedTotal}`) };
}

function sharedRowHasNonReviewableEvidence(row: SharedResultRow) {
  const text = `${row.event_title || ""} ${row.raw_row || ""} ${row.source_url || ""}`.toLowerCase();
  if (/\b\d{1,3}(?:[,.]\d+)?\s*%/.test(text) || /(prosent|percentage)/.test(text)) return true;
  if (/(ranking|cup sammenlagt|sammenlagt premiering|klasseføring|klasseforing|sesong|season|multieventsummary|cupsummary)/i.test(text)) return true;
  const derived = sharedRowDerivedScoreAndTargets(row);
  if (derived.score === null || derived.totalTargets === null || derived.score <= 0 || derived.totalTargets <= 0 || derived.score > derived.totalTargets) return true;
  const supportedTargetTotals = new Set([25, 50, 75, 100, 125, 150, 200]);
  if (!supportedTargetTotals.has(derived.totalTargets)) return true;
  return false;
}

function effectiveSharedValidationStatus(row: SharedResultRow): SharedResultRow["validation_status"] {
  if ((row.validation_status === "valid" || row.validation_status === "needs_review") && sharedRowHasNonReviewableEvidence(row)) return "invalid";
  return row.validation_status;
}

function sharedResultRowToCandidate(row: SharedResultRow): LeirdueCandidate {
  const effectiveStatus = effectiveSharedValidationStatus(row);
  const derived = sharedRowDerivedScoreAndTargets(row);
  const reviewable = effectiveStatus === "valid" || effectiveStatus === "needs_review";
  const category = effectiveStatus === "valid" ? "recommended" : effectiveStatus === "needs_review" ? "review" : "control";
  return {
    date: row.event_date,
    name: row.event_title || "Leirdue.net cached result",
    shootingGround: row.organizer || row.club,
    discipline: row.discipline || "Other",
    ownScore: derived.score,
    totalTargets: derived.totalTargets,
    winningScore: row.winning_score,
    maxScore: derived.totalTargets,
    placement: row.placement,
    seriesScores: derived.seriesScores,
    shooterName: row.original_name,
    shooterClass: null,
    stevneId: row.event_id,
    listeId: row.liste_id,
    warnings: effectiveStatus === "needs_review" ? ["Shared Leirdue cache row needs review."] : effectiveStatus === "invalid" ? ["Shared Leirdue cache row marked invalid."] : [],
    duplicateStatus: "new",
    duplicateMatches: [],
    shooterMatchStatus: reviewable ? "matched_to_you" : null,
    shooterMatchReason: reviewable ? "exact normalized match" : null,
    leirdueUrl: row.source_url,
    listType: null,
    confidence: effectiveStatus === "valid" ? "high" : effectiveStatus === "needs_review" ? "medium" : "low",
    notes: `${row.raw_row || ""} Shared Leirdue cache source. Score evidence: ${derived.evidence}. Cached at ${row.parsed_at || "unknown"}.`.trim(),
    category,
    importRecommended: effectiveStatus === "valid",
  };
}



function genuineRoundIdentity(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes || ""}`.toLowerCase();
  const roundMatch = text.match(/\b(?:runde|round|dag|day)\s*(\d{1,2})\b/);
  if (roundMatch) return `round-${roundMatch[1]}`;
  const dateMatch = text.match(/\b(lørdag|lordag|saturday|søndag|sondag|sunday)\b/);
  return dateMatch?.[1] || "event-overall";
}

function candidateRejectionReason(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes || ""}`.toLowerCase();
  if (/\b\d{1,3}(?:[,.]\d+)?\s*%/.test(text) || /(prosent|percentage)/.test(text)) return "percentage/ranking evidence";
  if (/(ranking|selection|uttak|cupsummary|multieventsummary|resultat etter standplass|standplass|station|klasseføring|klasseforing)/.test(text)) return "ranking/selection/station/summary list";
  if (candidate.ownScore === null || candidate.totalTargets === null) return "missing score or total targets";
  if (candidate.ownScore > candidate.totalTargets) return "score exceeds total targets";
  if (![25, 50, 75, 100, 125, 150, 200].includes(candidate.totalTargets)) return "unsupported or inferred target total";
  return null;
}

function sharedCandidateSemanticKey(candidate: LeirdueCandidate, normalizedName: string) {
  return [
    normalizedName,
    candidate.stevneId || "no-event",
    candidate.date || "no-date",
    candidate.discipline || "no-discipline",
    genuineRoundIdentity(candidate),
  ].join("|");
}

function sharedCandidatePreference(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes || ""}`.toLowerCase();
  let score = 0;
  if (candidate.category === "recommended") score += 100;
  if (candidate.category === "review") score += 50;
  if (candidate.stevneId && candidate.listeId) score += 20;
  if (candidate.date) score += 10;
  if (candidate.winningScore !== null) score += 5;
  const hasTrustedSeriesEvidence = /stored score\/target columns/.test(candidate.notes || "") && (candidate.seriesScores || []).length >= 2;
  if (hasTrustedSeriesEvidence) score += 25;
  if (/corrected programme target total/.test(candidate.notes || "")) score += 15;
  if (candidateRejectionReason(candidate)) score -= 1000;
  if (/(medaljeklasse|medal class|individual|individuell)/.test(text)) score += 40;
  if (/\b(overall|main result|resultater|hovedresultat|sammenlagt)\b/.test(text)) score += 10;
  if (/(ranking|prosent|percentage|klasseføring|klasseforing|resultat etter standplass|standplass|station|cupsummary|multieventsummary)/.test(text)) score -= 100;
  if (/(uttak|selection|lagskyting|lagresultat|team result|kongepokal|king.?s cup|steel challenge)/.test(text)) score -= 150;
  return score;
}

function dedupeSharedCandidatesSemantically(candidates: LeirdueCandidate[], normalizedName: string) {
  const byKey = new Map<string, LeirdueCandidate>();
  const grouped = new Map<string, LeirdueCandidate[]>();
  let hidden = 0;
  for (const candidate of candidates) {
    const key = sharedCandidateSemanticKey(candidate, normalizedName);
    grouped.set(key, [...(grouped.get(key) || []), candidate]);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    hidden += 1;
    if (sharedCandidatePreference(candidate) > sharedCandidatePreference(existing)) byKey.set(key, candidate);
  }
  const diagnostics = Array.from(grouped.entries()).slice(0, 50).map(([key, group]) => {
    const selected = byKey.get(key);
    return `${key}: sources=${group.map((candidate) => `${candidate.listeId || "no-list"} ${candidate.ownScore ?? "?"}/${candidate.totalTargets ?? "?"} ${candidateRejectionReason(candidate) || "accepted"}`).join("; ")}; selected=${selected?.listeId || "none"}; reason=${selected ? candidateRejectionReason(selected) || "best supported single-event candidate" : "none"}; genuineRounds=${Array.from(new Set(group.map(genuineRoundIdentity))).join(",")}`;
  });
  return { candidates: Array.from(byKey.values()), hidden, diagnostics };
}

export async function getSharedLeirdueShooterResults(input: { shooterName: string; year: number; disciplines: string[]; authorization?: string | null }) {
  const started = Date.now();
  const supabase = supabaseReadClient(input.authorization);
  const emptyStats = (error: string | null = null): SharedLeirdueSearchStats => ({ ok: !error, error, queryDurationMs: Date.now() - started, rowsFound: 0, totalRows: 0, validCount: 0, needsReviewCount: 0, invalidCount: 0, failedCount: 0, reviewableCount: 0, ignoredInvalidCount: 0, exactNameRowsFound: 0, clubSuffixedRowsFound: 0, ambiguousNameRowsRejected: 0, rowsBeforeSemanticDeduplication: 0, canonicalCandidatesAfterSemanticDeduplication: 0, duplicateSourceListsHidden: 0, acceptedNameMatchReasons: [], semanticEventGroupDiagnostics: [], coverageStatus: "unknown", indexingComplete: false, liveCrawlStarted: false });
  if (!supabase) return { candidates: [] as LeirdueCandidate[], stats: emptyStats("Shared Leirdue cache read skipped: missing authenticated cache read context.") };
  const normalizedName = nordicSafeNameKey(input.shooterName);
  const selectColumns = "event_id,liste_id,normalized_name,original_name,club,placement,score,total_targets,winning_score,series_scores,discipline,event_date,event_title,organizer,source_url,raw_row,validation_status,parsed_at";
  const [{ data: exactData, error: exactError }, { data: prefixedData, error: prefixedError }, statusResult] = await Promise.all([
    supabase
      .from("leirdue_shared_shooter_results")
      .select(selectColumns)
      .eq("year", input.year)
      .eq("normalized_name", normalizedName)
      .in("validation_status", ["valid", "needs_review", "invalid", "failed"])
      .order("event_date", { ascending: true })
      .limit(500),
    supabase
      .from("leirdue_shared_shooter_results")
      .select(selectColumns)
      .eq("year", input.year)
      .like("normalized_name", `${normalizedName} %`)
      .in("validation_status", ["valid", "needs_review", "invalid", "failed"])
      .order("event_date", { ascending: true })
      .limit(1000),
    supabase
      .from("leirdue_year_ingestion_status")
      .select("status")
      .eq("year", input.year)
      .maybeSingle(),
  ]);
  const error = exactError || prefixedError;
  if (error) return { candidates: [] as LeirdueCandidate[], stats: emptyStats(`Shared Leirdue cache read failed: ${error.message}`) };
  const exactRows = (exactData || []) as SharedResultRow[];
  const prefixedRows = (prefixedData || []) as SharedResultRow[];
  const rowMap = new Map<string, SharedResultRow>();
  for (const row of [...exactRows, ...prefixedRows]) rowMap.set(`${row.source_url}|${row.normalized_name}|${row.score ?? ""}|${row.total_targets ?? ""}`, row);
  let ambiguousNameRowsRejected = 0;
  const acceptedNameMatchReasons: string[] = [];
  const nameMatchedRows = Array.from(rowMap.values()).filter((row) => {
    const reason = leirdueNameMatchReason(row.original_name || row.normalized_name, input.shooterName);
    const accepted = row.normalized_name === normalizedName || profileNameContainedInShooterText(row.original_name || row.normalized_name, input.shooterName) || namesLikelyMatch(row.original_name || row.normalized_name, input.shooterName);
    if (!accepted) ambiguousNameRowsRejected += 1;
    else if (acceptedNameMatchReasons.length < 25) acceptedNameMatchReasons.push(`${row.original_name || row.normalized_name}: ${reason}`);
    return accepted;
  });
  const rows = nameMatchedRows.filter((row) => input.disciplines.length === 0 || !row.discipline || input.disciplines.includes(row.discipline));
  const rowsWithEffectiveStatus = rows.map((row) => ({ row, effectiveStatus: effectiveSharedValidationStatus(row) }));
  const validCount = rowsWithEffectiveStatus.filter((item) => item.effectiveStatus === "valid").length;
  const needsReviewCount = rowsWithEffectiveStatus.filter((item) => item.effectiveStatus === "needs_review").length;
  const invalidCount = rowsWithEffectiveStatus.filter((item) => item.effectiveStatus === "invalid").length;
  const failedCount = rowsWithEffectiveStatus.filter((item) => item.effectiveStatus === "failed").length;
  const reviewableRows = rowsWithEffectiveStatus.filter((item) => item.effectiveStatus === "valid" || item.effectiveStatus === "needs_review").map((item) => item.row);
  const ignoredInvalidCount = invalidCount + failedCount;
  const rowStageDiagnostics = rowsWithEffectiveStatus.slice(0, 100).map(({ row, effectiveStatus }) => {
    const disciplineAccepted = input.disciplines.length === 0 || !row.discipline || input.disciplines.includes(row.discipline);
    const rejection = effectiveStatus === "valid" || effectiveStatus === "needs_review" ? "reviewable before semantic grouping" : sharedRowHasNonReviewableEvidence(row) ? "validation/non-reviewable evidence" : effectiveStatus;
    const candidate = effectiveStatus === "valid" || effectiveStatus === "needs_review" ? sharedResultRowToCandidate(row) : null;
    return `row event=${row.event_id || "none"} liste=${row.liste_id || "none"} name=${row.original_name || row.normalized_name} normalized=${row.normalized_name} date=${row.event_date || "unknown"} title=${row.event_title || "unknown"} discipline=${row.discipline || "unknown"} raw=${row.score ?? "?"}/${row.total_targets ?? "?"} series=${Array.isArray(row.series_scores) ? row.series_scores.join("+") : "none"} storedStatus=${row.validation_status} effectiveStatus=${effectiveStatus} disciplineAccepted=${disciplineAccepted ? "yes" : "no"} semanticKey=${candidate ? sharedCandidateSemanticKey(candidate, normalizedName) : "not-reviewable"} rejection=${rejection}`;
  });
  const candidatesBeforeSemanticDeduplication = reviewableRows.map(sharedResultRowToCandidate);
  const deduped = dedupeSharedCandidatesSemantically(candidatesBeforeSemanticDeduplication, normalizedName);
  const candidates = deduped.candidates;
  const reviewableCount = candidates.filter((candidate) => candidate.category !== "control" && candidate.ownScore !== null && candidate.totalTargets !== null).length;
  const coverageStatus = (statusResult.data?.status as SharedLeirdueSearchStats["coverageStatus"] | undefined) || (statusResult.error ? "unknown" : "not_started");
  return {
    candidates,
    stats: { ok: true, error: statusResult.error ? `Shared Leirdue ingestion status read failed: ${statusResult.error.message}` : null, queryDurationMs: Date.now() - started, rowsFound: reviewableRows.length, totalRows: rows.length, validCount, needsReviewCount, invalidCount, failedCount, reviewableCount, ignoredInvalidCount, exactNameRowsFound: exactRows.length, clubSuffixedRowsFound: prefixedRows.length, ambiguousNameRowsRejected, rowsBeforeSemanticDeduplication: candidatesBeforeSemanticDeduplication.length, canonicalCandidatesAfterSemanticDeduplication: candidates.length, duplicateSourceListsHidden: deduped.hidden, acceptedNameMatchReasons, semanticEventGroupDiagnostics: [...rowStageDiagnostics, ...deduped.diagnostics], coverageStatus, indexingComplete: coverageStatus === "complete", liveCrawlStarted: false as const },
  };
}
