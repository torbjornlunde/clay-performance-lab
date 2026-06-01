import { mkdir, readFile, writeFile } from "fs/promises";
import type { LeirdueCandidate, LeirdueIndexStatus, LeirdueSearchDebug, LeirdueSearchResult } from "@/lib/leirdue/types";
import { createEmptyLeirdueSearchDebug, searchLeirdueCandidates } from "@/lib/leirdue/parser";

type IndexCursor = {
  continuationToken: string | null;
  batchNumber: number;
};

type IndexedRow = {
  event_id: string;
  liste_id: string | null;
  year: number;
  date: string | null;
  event_title: string;
  discipline: string;
  shooter_name_raw: string;
  shooter_name_normalized: string;
  club: string | null;
  own_score: number | null;
  total_targets: number | null;
  winning_score: number | null;
  series_scores: number[];
  row_type: "candidate" | "control";
  confidence: LeirdueCandidate["confidence"];
  hidden_reason: string | null;
  control_reason: string | null;
  source_url: string;
  raw_row: string;
  parsed_at: string;
  candidate: LeirdueCandidate;
};

type IndexedEvent = {
  event_id: string;
  year: number;
  title: string;
  date: string | null;
  organizer: string | null;
  url: string;
  discipline_guess: string | null;
  area: string | null;
  raw_text_snippet: string | null;
  last_fetched_at: string;
};

type IndexedResultList = {
  event_id: string;
  liste_id: string;
  url: string;
  title: string;
  list_type: string | null;
  priority: number;
  raw_text_snippet: string | null;
  last_fetched_at: string;
};

type IndexJob = {
  id: string;
  year: number;
  disciplines: string[];
  status: LeirdueIndexStatus;
  cursor: IndexCursor;
  started_at: string;
  completed_at: string | null;
  pages_fetched: number;
  events_indexed: number;
  result_lists_indexed: number;
  rows_parsed: number;
  error_log: string[];
  created_at: string;
  updated_at: string;
};

type ShooterIndex = {
  normalizedName: string;
  rows: IndexedRow[];
};

type YearIndex = {
  key: string;
  year: number;
  disciplines: string[];
  status: LeirdueIndexStatus;
  events: Record<string, IndexedEvent>;
  resultLists: Record<string, IndexedResultList>;
  shooters: Record<string, ShooterIndex>;
  job: IndexJob;
  lastUpdatedAt: string | null;
};

type CacheShape = {
  version: 1;
  years: Record<string, YearIndex>;
};

export type LeirdueIndexQuery = {
  shooterName: string;
  year: number;
  disciplines: string[];
  continuationToken?: string | null;
};

const INDEX_CACHE_PATH = process.env.LEIRDUE_INDEX_CACHE_PATH || "data/leirdue-index-v1.json";
const EXPECTED_2025_TORBJORN_ROWS = 16;
const INDEX_FRESH_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_BATCHES_PER_REQUEST = 1;

function emptyCache(): CacheShape {
  return { version: 1, years: {} };
}

async function readCache() {
  try {
    const raw = await readFile(INDEX_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed?.version === 1 && parsed.years) return parsed;
  } catch {
    // Missing or corrupt cache should not block importing; a new v1 cache is created below.
  }
  return emptyCache();
}

async function writeCache(cache: CacheShape) {
  const cacheDir = INDEX_CACHE_PATH.split("/").slice(0, -1).join("/") || ".";
  await mkdir(cacheDir, { recursive: true });
  await writeFile(INDEX_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function normalizeLeirdueShooterName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedDisciplines(disciplines: string[]) {
  return Array.from(new Set(disciplines.map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function indexKey(year: number, disciplines: string[]) {
  return `${year}:${normalizedDisciplines(disciplines).join("|").toLowerCase()}`;
}

function eventIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get("stevne") || url;
  } catch {
    return url;
  }
}

function listeIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get("liste_id");
  } catch {
    return null;
  }
}

function hiddenReason(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes}`.toLowerCase();
  if (candidate.category === "control") return "control row";
  if (/\b\d{1,3}(?:[,.]\d+)?\s*%/.test(text)) return "percentage/ranking row";
  if (/(ranking|prosent|cup sammenlagt|sammenlagt premiering|klasseføring|klasseforing|sesong|season)/.test(text)) return "summary/ranking row";
  if (candidate.ownScore === null || candidate.totalTargets === null) return "missing clean score or total targets";
  return null;
}

function isImportable(candidate: LeirdueCandidate) {
  return candidate.ownScore !== null && candidate.totalTargets !== null && hiddenReason(candidate) === null;
}

function expectedTarget(query: LeirdueIndexQuery) {
  return query.year === 2025 && normalizeLeirdueShooterName(query.shooterName) === "torbjorn lunde" ? EXPECTED_2025_TORBJORN_ROWS : null;
}

function isFresh(index: YearIndex) {
  if (!index.lastUpdatedAt) return false;
  return Date.now() - new Date(index.lastUpdatedAt).getTime() < INDEX_FRESH_MS;
}

function createYearIndex(year: number, disciplines: string[]): YearIndex {
  const now = new Date().toISOString();
  const key = indexKey(year, disciplines);
  return {
    key,
    year,
    disciplines: normalizedDisciplines(disciplines),
    status: "not_started",
    events: {},
    resultLists: {},
    shooters: {},
    lastUpdatedAt: null,
    job: {
      id: key,
      year,
      disciplines: normalizedDisciplines(disciplines),
      status: "not_started",
      cursor: { continuationToken: null, batchNumber: 0 },
      started_at: now,
      completed_at: null,
      pages_fetched: 0,
      events_indexed: 0,
      result_lists_indexed: 0,
      rows_parsed: 0,
      error_log: [],
      created_at: now,
      updated_at: now,
    },
  };
}

function rowFromCandidate(candidate: LeirdueCandidate, shooterName: string, year: number): IndexedRow {
  const event_id = eventIdFromUrl(candidate.leirdueUrl);
  const liste_id = listeIdFromUrl(candidate.leirdueUrl);
  const hidden = hiddenReason(candidate);
  return {
    event_id,
    liste_id,
    year,
    date: candidate.date,
    event_title: candidate.name,
    discipline: candidate.discipline,
    shooter_name_raw: shooterName,
    shooter_name_normalized: normalizeLeirdueShooterName(shooterName),
    club: null,
    own_score: candidate.ownScore,
    total_targets: candidate.totalTargets,
    winning_score: candidate.winningScore,
    series_scores: seriesScoresFromNotes(candidate.notes),
    row_type: hidden ? "control" : "candidate",
    confidence: candidate.confidence,
    hidden_reason: hidden,
    control_reason: candidate.category === "control" ? candidate.notes : null,
    source_url: candidate.leirdueUrl,
    raw_row: candidate.notes,
    parsed_at: new Date().toISOString(),
    candidate,
  };
}

function seriesScoresFromNotes(notes: string) {
  const match = notes.match(/Parsed series scores: ([\d,\s]+)\./);
  if (!match) return [];
  return match[1].split(",").map((item) => Number(item.trim())).filter((value) => Number.isFinite(value));
}

function upsertSearchResult(index: YearIndex, query: LeirdueIndexQuery, result: LeirdueSearchResult) {
  const now = new Date().toISOString();
  const allFetchesFailed = result.debug.fetchedUrls.length > 0 && result.debug.fetchedUrls.every((item) => !item.ok);
  if (allFetchesFailed) {
    index.status = "failed";
    index.job.status = "failed";
    index.job.error_log = Array.from(new Set([...index.job.error_log, ...result.debug.fetchedUrls.map((item) => `${item.url}: ${item.note || item.status || "fetch failed"}`)])).slice(-50);
    index.job.updated_at = now;
    index.lastUpdatedAt = now;
    return;
  }
  for (const item of result.debug.selectedYearEventLinks || []) {
    index.events[item.eventId] = {
      event_id: item.eventId,
      year: query.year,
      title: item.eventTitle || item.titleText,
      date: item.actualEventDate || item.date,
      organizer: item.organizerText || null,
      url: item.url,
      discipline_guess: null,
      area: null,
      raw_text_snippet: item.rawRowSnippet || item.titleText,
      last_fetched_at: now,
    };
  }

  for (const item of result.debug.prioritizedListeIdLinks || []) {
    const event_id = eventIdFromUrl(item.url);
    const liste_id = listeIdFromUrl(item.url);
    if (!liste_id) continue;
    index.resultLists[`${event_id}:${liste_id}`] = {
      event_id,
      liste_id,
      url: item.url,
      title: item.title,
      list_type: null,
      priority: item.score,
      raw_text_snippet: item.reason,
      last_fetched_at: now,
    };
  }

  const normalizedName = normalizeLeirdueShooterName(query.shooterName);
  const rowsByKey = new Map((index.shooters[normalizedName]?.rows || []).map((row) => [`${row.event_id}:${row.liste_id || "none"}:${row.date || "no-date"}:${row.own_score ?? "?"}:${row.total_targets ?? "?"}`, row]));
  for (const candidate of result.candidates) {
    const row = rowFromCandidate(candidate, query.shooterName, query.year);
    rowsByKey.set(`${row.event_id}:${row.liste_id || "none"}:${row.date || "no-date"}:${row.own_score ?? "?"}:${row.total_targets ?? "?"}`, row);
  }
  index.shooters[normalizedName] = { normalizedName, rows: Array.from(rowsByKey.values()) };

  index.lastUpdatedAt = now;
  index.status = result.continuationToken ? "partial" : "complete";
  index.job.status = index.status;
  index.job.cursor = { continuationToken: result.continuationToken || null, batchNumber: result.debug.batchNumber || index.job.cursor.batchNumber + 1 };
  index.job.pages_fetched += result.debug.fetchedUrls?.length || 0;
  index.job.events_indexed = Object.keys(index.events).length;
  index.job.result_lists_indexed = Object.keys(index.resultLists).length;
  index.job.rows_parsed = Object.values(index.shooters).reduce((total, shooter) => total + shooter.rows.length, 0);
  index.job.updated_at = now;
  index.job.completed_at = index.status === "complete" ? now : null;
}

function candidatesFromIndex(index: YearIndex, shooterName: string) {
  const normalizedName = normalizeLeirdueShooterName(shooterName);
  return (index.shooters[normalizedName]?.rows || []).map((row) => row.candidate);
}

function coverageDebug(index: YearIndex, query: LeirdueIndexQuery, debug: LeirdueSearchDebug, source: "local" | "builder" | "live_fallback") {
  const rows = index.shooters[normalizeLeirdueShooterName(query.shooterName)]?.rows || [];
  const importable = rows.filter((row) => isImportable(row.candidate));
  const hidden = rows.filter((row) => row.hidden_reason || row.row_type === "control");
  const expected = expectedTarget(query);
  debug.indexStatus = index.status;
  debug.indexSource = source;
  debug.indexedEventsForYear = Object.keys(index.events).length;
  debug.indexedListeIdsForYear = Object.keys(index.resultLists).length;
  debug.indexedRowsForYear = index.job.rows_parsed;
  debug.indexedShooterRowsFound = rows.length;
  debug.importableRowsFound = importable.length;
  debug.hiddenRowsFound = hidden.length;
  debug.indexCoverageEstimatePercent = expected ? Math.min(100, Math.round((importable.length / expected) * 100)) : undefined;
  debug.indexLastUpdatedAt = index.lastUpdatedAt;
  debug.missingReason = expected && importable.length < Math.ceil(expected * 0.9)
    ? index.status !== "complete"
      ? "index incomplete"
      : "complete index found fewer importable rows; missing results may be absent on Leirdue, registered/no-score rows, hidden/control rows, duplicates, or not parseable as valid score rows"
    : null;
  debug.completeCandidatesFoundTotal = importable.length;
  debug.importableCompleteCandidates = importable.length;
  debug.visibleCandidatesCount = importable.length;
  debug.visibleCandidatesCountTotal = importable.length;
  debug.hiddenLowQualityCandidatesCount = hidden.length;
  debug.hiddenLowQualityCandidatesCountTotal = hidden.length;
  debug.message = index.status === "complete"
    ? `Fant ${importable.length} resultater fra Leirdue-indeksen.${expected && importable.length < expected ? ` Fant ${importable.length} av forventet ca. ${expected}. Det kan bety at noen resultater ikke ligger på Leirdue, eller at skytteren står uten gyldig score-rad.` : ""}`
    : `Bygger Leirdue-indeks for ${query.year}. Dette kan ta noen minutter.`;
}

export async function queryOrBuildLeirdueYearIndex(query: LeirdueIndexQuery): Promise<LeirdueSearchResult> {
  const cache = await readCache();
  const key = indexKey(query.year, query.disciplines);
  const index = cache.years[key] || createYearIndex(query.year, query.disciplines);
  cache.years[key] = index;

  const indexedCandidates = candidatesFromIndex(index, query.shooterName);
  if (index.status === "complete" && isFresh(index)) {
    const debug = createEmptyLeirdueSearchDebug();
    debug.selectedYear = query.year;
    debug.normalizedSearchName = normalizeLeirdueShooterName(query.shooterName);
    debug.completeCandidatesFoundTotal = indexedCandidates.filter(isImportable).length;
    debug.importableCompleteCandidates = debug.completeCandidatesFoundTotal;
    debug.visibleCandidatesCount = debug.completeCandidatesFoundTotal;
    debug.visibleCandidatesCountTotal = debug.completeCandidatesFoundTotal;
    debug.returnedVisibleCandidatesCount = debug.completeCandidatesFoundTotal;
    debug.continuationAvailable = false;
    debug.continuationReason = "targetReached";
    coverageDebug(index, query, debug, "local");
    return { candidates: indexedCandidates, debug, continuationToken: null };
  }

  index.status = "running";
  index.job.status = "running";
  index.job.started_at ||= new Date().toISOString();
  index.job.updated_at = new Date().toISOString();

  let result: LeirdueSearchResult | null = null;
  let token = query.continuationToken || index.job.cursor.continuationToken || null;
  for (let batch = 0; batch < MAX_BATCHES_PER_REQUEST; batch += 1) {
    result = await searchLeirdueCandidates({ shooterName: query.shooterName, year: query.year, disciplines: query.disciplines, continuationToken: token });
    upsertSearchResult(index, query, result);
    token = result.continuationToken || null;
    if (!token) break;
  }

  await writeCache(cache);

  if (!result) {
    result = await searchLeirdueCandidates({ shooterName: query.shooterName, year: query.year, disciplines: query.disciplines, continuationToken: null });
  }
  result.candidates = candidatesFromIndex(index, query.shooterName);
  result.continuationToken = index.job.cursor.continuationToken;
  coverageDebug(index, query, result.debug, "builder");
  return result;
}
