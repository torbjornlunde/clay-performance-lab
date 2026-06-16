import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeirdueCandidate } from "@/lib/leirdue/types";
import { extractLeirdueSourceIdentifiers, nordicSafeNameKey } from "@/lib/leirdue/normalize";

const CURRENT_YEAR_TTL_DAYS = 7;
const PAST_YEAR_TTL_DAYS = 90;

export type LeirdueCacheStats = {
  enabled: boolean;
  cachedCandidatesFound: number;
  liveCandidatesStored: number;
  cacheMiss: boolean;
  staleCache: boolean;
  cacheUsed: boolean;
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

function supabaseServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export function emptyLeirdueCacheStats(note: string | null = null): LeirdueCacheStats {
  return { enabled: false, cachedCandidatesFound: 0, liveCandidatesStored: 0, cacheMiss: false, staleCache: false, cacheUsed: false, note };
}

function ttlDaysForYear(year: number) {
  return year >= new Date().getFullYear() ? CURRENT_YEAR_TTL_DAYS : PAST_YEAR_TTL_DAYS;
}

function freshCutoffIso(year: number) {
  return new Date(Date.now() - ttlDaysForYear(year) * 24 * 60 * 60 * 1000).toISOString();
}

function rowFingerprint(candidate: LeirdueCandidate) {
  return createHash("sha256")
    .update([candidate.leirdueUrl, candidate.date || "", candidate.shooterName || "", candidate.ownScore ?? "", candidate.totalTargets ?? "", candidate.winningScore ?? "", candidate.placement ?? ""].join("|"))
    .digest("hex");
}

function candidateToCacheRow(candidate: LeirdueCandidate, year: number) {
  const ids = { stevneId: candidate.stevneId || extractLeirdueSourceIdentifiers(candidate.leirdueUrl).stevneId, listeId: candidate.listeId || extractLeirdueSourceIdentifiers(candidate.leirdueUrl).listeId };
  const notImportable = candidate.category === "control" ? candidate.warnings?.[0] || candidate.notes || "Not importable." : null;
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
    is_importable: candidate.category !== "control" && candidate.ownScore !== null && candidate.totalTargets !== null,
    not_importable_reason: notImportable,
    raw_row_text: candidate.notes,
    parsed_at: new Date().toISOString(),
  };
}

function cacheRowToCandidate(row: CachedResultRow): LeirdueCandidate {
  const [category = "review", confidence = "medium"] = (row.candidate_quality || "review/medium").split("/");
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

export async function getCachedLeirdueCandidates(input: { shooterName: string; year: number; disciplines: string[] }) {
  const supabase = supabaseServiceClient();
  if (!supabase) return { candidates: [] as LeirdueCandidate[], stats: emptyLeirdueCacheStats("Cache disabled: missing SUPABASE_SERVICE_ROLE_KEY.") };
  const normalizedName = nordicSafeNameKey(input.shooterName);
  const { data, error } = await supabase
    .from("leirdue_parsed_result_cache")
    .select("*")
    .eq("year", input.year)
    .eq("shooter_name_normalized", normalizedName)
    .gte("parsed_at", freshCutoffIso(input.year))
    .limit(200);
  if (error) return { candidates: [] as LeirdueCandidate[], stats: emptyLeirdueCacheStats(`Cache read failed: ${error.message}`) };
  const rows = (data || []) as CachedResultRow[];
  const filtered = input.disciplines.length > 0 ? rows.filter((row) => !row.discipline || input.disciplines.includes(row.discipline)) : rows;
  return {
    candidates: filtered.map(cacheRowToCandidate),
    stats: { enabled: true, cachedCandidatesFound: filtered.length, liveCandidatesStored: 0, cacheMiss: filtered.length === 0, staleCache: false, cacheUsed: filtered.length > 0, note: null },
  };
}

export async function storeLeirdueCandidatesInCache(candidates: LeirdueCandidate[], year: number) {
  const supabase = supabaseServiceClient();
  if (!supabase || candidates.length === 0) return emptyLeirdueCacheStats(!supabase ? "Cache write skipped: missing SUPABASE_SERVICE_ROLE_KEY." : null);
  const rows = candidates.filter((candidate) => candidate.leirdueUrl && candidate.shooterName).map((candidate) => candidateToCacheRow(candidate, year));
  if (rows.length === 0) return emptyLeirdueCacheStats("Cache write skipped: no cacheable candidates.");
  const eventRows = Array.from(new Map(rows.filter((row) => row.event_id).map((row) => [row.event_id, {
    event_id: row.event_id,
    source_url: row.source_url,
    year: row.year,
    event_date: row.event_date,
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
  if (eventRows.length > 0) await supabase.from("leirdue_event_index").upsert(eventRows, { onConflict: "event_id" });
  if (listRows.length > 0) await supabase.from("leirdue_result_list_index").upsert(listRows, { onConflict: "event_id,liste_id" });
  const { error } = await supabase.from("leirdue_parsed_result_cache").upsert(rows, { onConflict: "source_url,row_fingerprint" });
  return { enabled: true, cachedCandidatesFound: 0, liveCandidatesStored: error ? 0 : rows.length, cacheMiss: false, staleCache: false, cacheUsed: false, note: error ? `Cache write failed: ${error.message}` : null };
}
