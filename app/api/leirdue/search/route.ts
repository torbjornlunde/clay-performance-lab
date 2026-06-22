import { NextResponse } from "next/server";
import { getCachedLeirdueCandidates, getLeirdueCrawlProgress, storeLeirdueCandidatesInCache, storeLeirdueCrawlIndexesInCache, storeLeirdueCrawlProgress, storeLeirdueInvalidListDecisionsInCache } from "@/lib/leirdue/cache";
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

function applyCacheStatsToDebug(debug: ReturnType<typeof emptyLeirdueSearchDebug>, cached: Awaited<ReturnType<typeof getCachedLeirdueCandidates>> | null, progress?: Awaited<ReturnType<typeof getLeirdueCrawlProgress>> | null) {
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
  if (progress) {
    debug.cacheDiagnostics.crawlStateFound = Boolean(progress.progress);
    debug.cacheDiagnostics.cacheScopeComplete = progress.progress?.status === "complete";
    debug.cacheDiagnostics.cacheScopeStatus = progress.progress?.status || "unknown";
    debug.cacheDiagnostics.continuationRequired = progress.progress?.status === "incomplete" && Boolean(progress.progress.continuation_token);
    debug.cacheDiagnostics.savedContinuationTokenPresent = Boolean(progress.progress?.continuation_token);
    debug.cacheDiagnostics.resumedFromSavedProgress = false;
    debug.cacheDiagnostics.previouslyProcessed = progress.progress?.processed_work_count || 0;
    debug.cacheDiagnostics.previouslyProcessedBeforeBatch = progress.progress?.processed_work_count || 0;
    debug.cacheDiagnostics.remainingWork = progress.progress?.remaining_work_count ?? null;
    debug.cacheDiagnostics.remainingWorkBeforeBatch = progress.progress?.remaining_work_count ?? null;
    if (progress.error) debug.cacheDiagnostics.cacheReadErrors = [...debug.cacheDiagnostics.cacheReadErrors, progress.error];
  }
}

function applyCacheWriteStatsToDebug(debug: ReturnType<typeof emptyLeirdueSearchDebug>, ...stats: { serviceRoleCacheWriteEnabled: boolean; cacheWriteOk: boolean; cacheWriteErrors: string[]; cacheWriteWarnings?: string[]; invalidListsStored: number }[]) {
  debug.cacheDiagnostics.serviceRoleCacheWriteEnabled = stats.some((item) => item.serviceRoleCacheWriteEnabled);
  debug.cacheDiagnostics.cacheWriteOk = stats.every((item) => item.cacheWriteOk);
  debug.cacheDiagnostics.cacheWriteErrors = stats.flatMap((item) => item.cacheWriteErrors);
  debug.cacheDiagnostics.cacheWriteWarnings = stats.flatMap((item) => item.cacheWriteWarnings || []);
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
  const restartIncompleteScopeToken = "__restart_incomplete_leirdue_scope__";
  const restartRequested = continuationToken === restartIncompleteScopeToken;
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0 ? body.sourceUrl.trim() : null;

  if (!shooterName || !year || disciplines.length === 0) {
    return NextResponse.json({ error: "Shooter name, year and at least one discipline are required." }, { status: 400 });
  }

  try {
    const cached = !sourceUrl
      ? await getCachedLeirdueCandidates({ shooterName, year, disciplines, authorization: request.headers.get("authorization") })
      : null;
    const progress = !sourceUrl
      ? await getLeirdueCrawlProgress({ shooterName, year, disciplines, authorization: request.headers.get("authorization") })
      : null;

    if (!continuationToken && cached && cached.stats.cachedImportableCandidatesFound > 0) {
      const debug = emptyLeirdueSearchDebug();
      debug.selectedYear = year;
      debug.normalizedSearchName = shooterName.toLowerCase().replace(/\s+/g, " ").trim();
      debug.selectedDisciplineFilters = disciplines;
      applyCacheStatsToDebug(debug, cached, progress);
      debug.cacheDiagnostics.liveFetchesSkippedBecauseCached = cached.stats.cachedImportableCandidatesFound;
      debug.cacheDiagnostics.elapsedMs = 0;
      const savedToken = progress?.progress?.status === "incomplete" ? progress.progress.continuation_token : null;
      const scopeComplete = progress?.progress?.status === "complete";
      const invalidCompleteState = Boolean(scopeComplete && !savedToken);
      if (invalidCompleteState) {
        debug.cacheDiagnostics.invalidCompleteStateDetected = true;
        debug.cacheDiagnostics.invalidCompleteStateReason = "legacy complete crawl state has no completion proof; revalidation required";
      }
      const restartToken = (!scopeComplete || invalidCompleteState) && !savedToken ? restartIncompleteScopeToken : null;
      const nextToken = savedToken || restartToken;
      debug.cacheDiagnostics.stopReason = invalidCompleteState ? "invalidCompleteStateRevalidationRequired" : scopeComplete ? "completeFreshCacheHit" : savedToken ? "freshCacheHitContinuationRequired" : "freshCacheHitNoSavedProgressRestartRequired";
      debug.cacheDiagnostics.repeatedSearchShouldBeFaster = true;
      debug.cacheDiagnostics.cacheWriteOk = true;
      debug.cacheDiagnostics.cachedCandidatesLoaded = cached.candidates.length;
      debug.continuationAvailable = Boolean(nextToken);
      debug.pendingListeIdQueueRemaining = nextToken ? 1 : 0;
      debug.cacheDiagnostics.continuationRequired = Boolean(nextToken);
      debug.continuationReason = invalidCompleteState ? "cachedResultsLoadedInvalidCompleteStateRevalidationRequired" : scopeComplete ? "completeFreshCacheHit" : savedToken ? "cachedResultsLoadedResumeSavedProgress" : "cachedResultsLoadedRestartRequiredBecauseScopeCompletenessUnknown";
      debug.message = scopeComplete
        ? invalidCompleteState
          ? `Loaded ${cached.stats.cachedImportableCandidatesFound} cached Leirdue result${cached.stats.cachedImportableCandidatesFound === 1 ? "" : "s"}. Previous completion needs revalidation.`
          : `Search complete. Loaded ${cached.stats.cachedImportableCandidatesFound} importable cached Leirdue result${cached.stats.cachedImportableCandidatesFound === 1 ? "" : "s"}.`
        : `Loaded ${cached.stats.cachedImportableCandidatesFound} cached Leirdue result${cached.stats.cachedImportableCandidatesFound === 1 ? "" : "s"}. Searching for additional results may still find more.`;
      debug.candidateReasons.unshift(savedToken
        ? `Cache hit: ${cached.candidates.length} fresh parsed candidates (${cached.stats.cachedImportableCandidatesFound} importable); returning cached results and resuming saved crawl progress.`
        : `Cache hit: ${cached.candidates.length} fresh parsed candidates (${cached.stats.cachedImportableCandidatesFound} importable); scope is ${scopeComplete ? "complete" : "not proven complete"}.`);
      return NextResponse.json({ candidates: cached.candidates, debug, continuationToken: nextToken });
    }

    const savedContinuationToken = progress?.progress?.status === "incomplete" ? progress.progress.continuation_token : null;
    const liveContinuationToken = savedContinuationToken || (restartRequested ? null : continuationToken) || null;
    const result = await searchLeirdueCandidates({ shooterName, year, disciplines, continuationToken: liveContinuationToken, sourceUrl, cachedInvalidListKeys: cached?.stats.invalidListKeys || [] });
    applyCacheStatsToDebug(result.debug, cached, progress);
    result.debug.cacheDiagnostics.savedContinuationTokenPresent = Boolean(savedContinuationToken || (continuationToken && !restartRequested));
    if (restartRequested) {
      result.debug.cacheDiagnostics.invalidCompleteStateDetected = true;
      result.debug.cacheDiagnostics.invalidCompleteStateReason = "restart requested to repair invalid or unproven complete crawl state";
    }
    result.debug.cacheDiagnostics.resumedFromSavedProgress = Boolean(savedContinuationToken && result.debug.cacheDiagnostics.continuationDecodeOk && result.debug.cacheDiagnostics.eligibleWorkAfterRestore > 0);
    result.debug.cacheDiagnostics.liveRefreshReason = savedContinuationToken ? "savedIncompleteProgress" : restartRequested ? "invalidCompleteStateRecoveryRestart" : continuationToken ? "clientContinuationNoSavedProgress" : cached?.candidates.length ? "cachedRowsButNoCompleteProgress" : "cacheMiss";
    if (cached?.candidates.length) {
      const cachedKeys = new Set(cached.candidates.map((candidate) => `${candidate.leirdueUrl}|${candidate.date || ""}|${candidate.shooterName || ""}|${candidate.ownScore ?? ""}`));
      result.candidates = [...cached.candidates, ...result.candidates.filter((candidate) => !cachedKeys.has(`${candidate.leirdueUrl}|${candidate.date || ""}|${candidate.shooterName || ""}|${candidate.ownScore ?? ""}`))];
      result.debug.cacheDiagnostics.cachedCandidatesLoaded = cached.candidates.length;
    }
    if (!sourceUrl) {
      const [stored, crawlIndexes, invalidStored] = await Promise.all([
        storeLeirdueCandidatesInCache(result.candidates, year),
        storeLeirdueCrawlIndexesInCache(result.debug, year),
        storeLeirdueInvalidListDecisionsInCache(result.debug.checkedLists),
      ]);
      const progressWrite = await storeLeirdueCrawlProgress({ shooterName, year, disciplines, debug: result.debug, continuationToken: result.continuationToken });
      applyCacheWriteStatsToDebug(result.debug, stored, crawlIndexes, invalidStored);
      result.debug.cacheDiagnostics.progressWriteOk = progressWrite.ok;
      result.debug.cacheDiagnostics.progressWriteError = progressWrite.error;
      result.debug.cacheDiagnostics.crawlMarkedComplete = progressWrite.status === "complete";
      result.debug.cacheDiagnostics.cacheScopeStatus = progressWrite.status === "complete" || progressWrite.status === "incomplete" || progressWrite.status === "failed" ? progressWrite.status : result.debug.cacheDiagnostics.cacheScopeStatus;
      result.debug.cacheDiagnostics.cacheScopeComplete = progressWrite.status === "complete";
      result.debug.cacheDiagnostics.continuationRequired = Boolean(result.continuationToken);
      result.debug.cacheDiagnostics.previouslyProcessedAfterBatch = progressWrite.processedWorkCount ?? result.debug.cacheDiagnostics.previouslyProcessedAfterBatch;
      result.debug.cacheDiagnostics.remainingWorkAfterBatch = progressWrite.remainingWork ?? null;
      result.debug.candidateReasons.unshift(`Cache ${result.debug.cacheDiagnostics.cacheWriteOk ? "write ok" : "write issue"}: stored ${stored.liveCandidatesStored} parsed candidates and ${crawlIndexes.invalidListsStored + invalidStored.invalidListsStored} invalid/index list decisions; progress ${progressWrite.ok ? "write ok" : "write issue"}.${result.debug.cacheDiagnostics.cacheWriteErrors.length ? ` Errors: ${result.debug.cacheDiagnostics.cacheWriteErrors.join(" | ")}` : ""}${progressWrite.error ? ` Progress error: ${progressWrite.error}` : ""}`);
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
