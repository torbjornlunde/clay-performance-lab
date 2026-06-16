import { NextResponse } from "next/server";
import { getCachedLeirdueCandidates, storeLeirdueCandidatesInCache, storeLeirdueCrawlIndexesInCache, storeLeirdueInvalidListDecisionsInCache } from "@/lib/leirdue/cache";
import { emptyLeirdueSearchDebug, FETCH_ERROR_MESSAGE, searchLeirdueCandidates } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

type SearchBody = {
  shooterName?: unknown;
  year?: unknown;
  disciplines?: unknown;
  continuationToken?: unknown;
  sourceUrl?: unknown;
};

function validYear(value: unknown) {
  const year = Number(value);
  const currentYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1990 || year > currentYear) return null;
  return year;
}

function applyCacheStatsToDebug(debug: ReturnType<typeof emptyLeirdueSearchDebug>, cached: Awaited<ReturnType<typeof getCachedLeirdueCandidates>> | null) {
  if (!cached) {
    debug.cacheDiagnostics.cacheNotUsedReason = "Manual URL search or continuation request skipped cache pre-read.";
    return;
  }
  debug.cacheDiagnostics.cacheReadOk = cached.stats.cacheReadOk;
  debug.cacheDiagnostics.cacheUsed = cached.stats.cacheUsed;
  debug.cacheDiagnostics.cacheNotUsedReason = cached.stats.cacheUsed ? null : cached.stats.note || "No fresh cached candidates matched this year/name/discipline search.";
  debug.cacheDiagnostics.cachedCandidatesFound = cached.stats.cachedCandidatesFound;
  debug.cacheDiagnostics.cachedImportableCandidatesFound = cached.stats.cachedImportableCandidatesFound;
  debug.cacheDiagnostics.cachedInvalidListsFound = cached.stats.invalidListKeys.length;
  debug.cacheDiagnostics.cacheEventHits = cached.stats.eventHits;
  debug.cacheDiagnostics.cacheListHits = cached.stats.listHits;
  debug.cacheDiagnostics.cacheMisses = cached.stats.cacheMiss ? 1 : 0;
  debug.cacheDiagnostics.staleCacheRefreshed = cached.stats.staleRowsFound;
  debug.cacheDiagnostics.staleCacheRows = cached.stats.staleRowsFound;
  debug.cacheDiagnostics.cacheReadErrors = cached.stats.cacheReadErrors;
  debug.cacheDiagnostics.serviceRoleCacheWriteEnabled = cached.stats.serviceRoleCacheWriteEnabled;
}

function applyCacheWriteStatsToDebug(debug: ReturnType<typeof emptyLeirdueSearchDebug>, ...stats: { serviceRoleCacheWriteEnabled: boolean; cacheWriteOk: boolean; cacheWriteErrors: string[]; invalidListsStored: number }[]) {
  debug.cacheDiagnostics.serviceRoleCacheWriteEnabled = stats.some((item) => item.serviceRoleCacheWriteEnabled);
  debug.cacheDiagnostics.cacheWriteOk = stats.every((item) => item.cacheWriteOk);
  debug.cacheDiagnostics.cacheWriteErrors = stats.flatMap((item) => item.cacheWriteErrors);
  debug.cacheDiagnostics.invalidLiveListsCached += stats.reduce((total, item) => total + item.invalidListsStored, 0);
}

export async function POST(request: Request) {
  let body: SearchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }

  const shooterName = typeof body.shooterName === "string" ? body.shooterName.trim() : "";
  const year = validYear(body.year);
  const disciplines = Array.isArray(body.disciplines) ? body.disciplines.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const continuationToken = typeof body.continuationToken === "string" && body.continuationToken.length > 0 ? body.continuationToken : null;
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0 ? body.sourceUrl.trim() : null;

  if (!shooterName || !year || disciplines.length === 0) {
    return NextResponse.json({ error: "Shooter name, year and at least one discipline are required." }, { status: 400 });
  }

  try {
    const cached = !continuationToken && !sourceUrl
      ? await getCachedLeirdueCandidates({ shooterName, year, disciplines, authorization: request.headers.get("authorization") })
      : null;

    if (cached && cached.stats.cachedImportableCandidatesFound > 0) {
      const debug = emptyLeirdueSearchDebug();
      debug.selectedYear = year;
      debug.normalizedSearchName = shooterName.toLowerCase().replace(/\s+/g, " ").trim();
      debug.selectedDisciplineFilters = disciplines;
      applyCacheStatsToDebug(debug, cached);
      debug.cacheDiagnostics.liveFetchesSkippedBecauseCached = cached.stats.cachedImportableCandidatesFound;
      debug.cacheDiagnostics.elapsedMs = 0;
      debug.cacheDiagnostics.stopReason = "freshImportableCacheHit";
      debug.cacheDiagnostics.repeatedSearchShouldBeFaster = true;
      debug.cacheDiagnostics.cacheWriteOk = true;
      debug.continuationAvailable = false;
      debug.continuationReason = "freshImportableCacheHit";
      debug.message = `Search complete. Loaded ${cached.stats.cachedImportableCandidatesFound} importable cached Leirdue result${cached.stats.cachedImportableCandidatesFound === 1 ? "" : "s"}.`;
      debug.candidateReasons.unshift(`Cache hit: ${cached.candidates.length} fresh parsed candidates (${cached.stats.cachedImportableCandidatesFound} importable); skipped live crawling.`);
      return NextResponse.json({ candidates: cached.candidates, debug, continuationToken: null });
    }

    const result = await searchLeirdueCandidates({ shooterName, year, disciplines, continuationToken, sourceUrl, cachedInvalidListKeys: cached?.stats.invalidListKeys || [] });
    applyCacheStatsToDebug(result.debug, cached);
    if (!sourceUrl) {
      const [stored, crawlIndexes, invalidStored] = await Promise.all([
        storeLeirdueCandidatesInCache(result.candidates, year),
        storeLeirdueCrawlIndexesInCache(result.debug, year),
        storeLeirdueInvalidListDecisionsInCache(result.debug.checkedLists),
      ]);
      applyCacheWriteStatsToDebug(result.debug, stored, crawlIndexes, invalidStored);
      result.debug.candidateReasons.unshift(`Cache ${result.debug.cacheDiagnostics.cacheWriteOk ? "write ok" : "write issue"}: stored ${stored.liveCandidatesStored} parsed candidates and ${crawlIndexes.invalidListsStored + invalidStored.invalidListsStored} invalid/index list decisions.${result.debug.cacheDiagnostics.cacheWriteErrors.length ? ` Errors: ${result.debug.cacheDiagnostics.cacheWriteErrors.join(" | ")}` : ""}`);
    }
    if (result.debug.fetchedUrls.length > 0 && result.debug.fetchedUrls.every((item) => !item.ok)) {
      return NextResponse.json({ ...result, error: FETCH_ERROR_MESSAGE }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    const debug = emptyLeirdueSearchDebug();
    debug.selectedYear = year;
    debug.normalizedSearchName = shooterName.toLowerCase().replace(/\s+/g, " ").trim();
    debug.batchNumber = continuationToken ? 2 : 1;
    debug.rejectedReasons = [FETCH_ERROR_MESSAGE];
    debug.candidateReasons = [FETCH_ERROR_MESSAGE];
    return NextResponse.json({ error: FETCH_ERROR_MESSAGE, debug }, { status: 502 });
  }
}
