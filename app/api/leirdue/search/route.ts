import { NextResponse } from "next/server";
import { getCachedLeirdueCandidates, storeLeirdueCandidatesInCache, storeLeirdueInvalidListDecisionsInCache } from "@/lib/leirdue/cache";
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
    if (!continuationToken && !sourceUrl) {
      const cached = await getCachedLeirdueCandidates({ shooterName, year, disciplines, authorization: request.headers.get("authorization") });
      if (cached.candidates.length > 0) {
        const debug = emptyLeirdueSearchDebug();
        debug.selectedYear = year;
        debug.normalizedSearchName = shooterName.toLowerCase().replace(/\s+/g, " ").trim();
        debug.selectedDisciplineFilters = disciplines;
        debug.cacheDiagnostics.cacheUsed = true;
        debug.cacheDiagnostics.cachedCandidatesFound = cached.stats.cachedCandidatesFound;
        debug.cacheDiagnostics.cacheEventHits = cached.stats.eventHits;
        debug.cacheDiagnostics.cacheListHits = cached.stats.listHits;
        debug.cacheDiagnostics.cacheMisses = 0;
        debug.cacheDiagnostics.staleCacheRefreshed = 0;
        debug.cacheDiagnostics.invalidCachedListsSkipped = cached.stats.invalidListKeys.length;
        debug.cacheDiagnostics.elapsedMs = 0;
        debug.cacheDiagnostics.stopReason = "cacheHitFresh";
        debug.cacheDiagnostics.repeatedSearchShouldBeFaster = true;
        debug.continuationAvailable = false;
        debug.continuationReason = "cacheHitFresh";
        debug.message = `Search complete. Loaded ${cached.candidates.length} cached Leirdue results.`;
        debug.candidateReasons.unshift(`Cache hit: ${cached.candidates.length} fresh parsed candidates; skipped live crawling.`);
        return NextResponse.json({ candidates: cached.candidates, debug, continuationToken: null });
      }
    }
    const cached = !continuationToken && !sourceUrl
      ? await getCachedLeirdueCandidates({ shooterName, year, disciplines, authorization: request.headers.get("authorization") })
      : null;
    const result = await searchLeirdueCandidates({ shooterName, year, disciplines, continuationToken, sourceUrl, cachedInvalidListKeys: cached?.stats.invalidListKeys || [] });
    if (cached) {
      result.debug.cacheDiagnostics.cacheUsed = cached.stats.cacheUsed;
      result.debug.cacheDiagnostics.cachedCandidatesFound = cached.stats.cachedCandidatesFound;
      result.debug.cacheDiagnostics.cacheEventHits = cached.stats.eventHits;
      result.debug.cacheDiagnostics.cacheListHits = cached.stats.listHits;
      result.debug.cacheDiagnostics.cacheMisses = cached.stats.cacheMiss ? 1 : 0;
      result.debug.cacheDiagnostics.staleCacheRefreshed = cached.stats.staleRowsFound;
    }
    if (!continuationToken && !sourceUrl) {
      const [stored, invalidStored] = await Promise.all([
        storeLeirdueCandidatesInCache(result.candidates, year),
        storeLeirdueInvalidListDecisionsInCache(result.debug.checkedLists),
      ]);
      result.debug.cacheDiagnostics.invalidLiveListsCached += invalidStored.invalidListsStored;
      result.debug.candidateReasons.unshift(`Cache ${stored.enabled ? "write" : "disabled"}: stored ${stored.liveCandidatesStored} live candidates and ${invalidStored.invalidListsStored} invalid list decisions.${stored.note ? ` ${stored.note}` : ""}${invalidStored.note ? ` ${invalidStored.note}` : ""}`);
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
