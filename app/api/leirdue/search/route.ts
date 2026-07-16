import { NextResponse } from "next/server";
import { getCachedLeirdueCandidates, getLeirdueCrawlProgress, getSharedLeirdueShooterResults, repairLeirdueInvalidCompleteState, storeLeirdueCandidatesInCache, storeLeirdueCrawlIndexesInCache, storeLeirdueCrawlProgress, storeLeirdueInvalidListDecisionsInCache } from "@/lib/leirdue/cache";
import { emptyLeirdueSearchDebug, FETCH_ERROR_MESSAGE, searchLeirdueCandidates } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

type SearchBody = {
  shooterName?: unknown;
  year?: unknown;
  disciplines?: unknown;
  continuationToken?: unknown;
  sourceUrl?: unknown;
  requestMode?: unknown;
  explicitContinue?: unknown;
  buttonAction?: unknown;
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
    if (progress.progress?.status === "complete" && progress.progress.last_stop_reason === "completionProofValid" && (progress.progress.remaining_work_count ?? 0) === 0 && progress.progress.processed_work_count > 0) {
      debug.cacheDiagnostics.completionProof = {
        selectedYearDiscoveryComplete: true,
        eventQueueExhausted: true,
        listeIdQueueExhausted: true,
        noRecoveryError: true,
        noUnknownPendingWork: true,
        processedOrSkippedCount: progress.progress.processed_work_count,
        valid: true,
      };
      debug.cacheDiagnostics.remainingWorkAfterBatch = 0;
      debug.cacheDiagnostics.previouslyProcessedAfterBatch = progress.progress.processed_work_count;
      debug.cacheDiagnostics.emptyQueueInterpretation = "storedCompleteState";
      debug.cacheDiagnostics.finalReconciliationComplete = true;
    }
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

function responseCandidateKey(candidate: { stevneId?: string | null; listeId?: string | null; leirdueUrl: string; date: string | null; discipline: string; ownScore: number | null; totalTargets: number | null }) {
  return [candidate.stevneId || "no-event", candidate.listeId || "no-liste", candidate.leirdueUrl || "no-url", candidate.date || "no-date", candidate.discipline || "no-discipline", candidate.ownScore ?? "?", candidate.totalTargets ?? "?"].join("|");
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
  const explicitContinue = body.explicitContinue === true;
  const buttonAction = typeof body.buttonAction === "string" ? body.buttonAction : null;
  const requestMode = explicitContinue
    ? "continue"
    : body.requestMode === "continue" || body.requestMode === "revalidateInvalidComplete" || body.requestMode === "initial"
    ? body.requestMode
    : restartRequested
      ? "revalidateInvalidComplete"
      : continuationToken
        ? "continue"
        : "initial";

  if (!shooterName || !year || disciplines.length === 0) {
    return NextResponse.json({ error: "Shooter name, year and at least one discipline are required." }, { status: 400 });
  }

  try {
    let initialShared: Awaited<ReturnType<typeof getSharedLeirdueShooterResults>> | null = null;
    if (requestMode === "initial" && !explicitContinue && !continuationToken && !sourceUrl) {
      const shared = await getSharedLeirdueShooterResults({ shooterName, year, disciplines, authorization: request.headers.get("authorization") });
      initialShared = shared;
      const debug = emptyLeirdueSearchDebug();
      debug.selectedYear = year;
      debug.normalizedSearchName = shooterName.toLowerCase().replace(/\s+/g, " ").trim();
      debug.selectedDisciplineFilters = disciplines;
      debug.cacheDiagnostics.cacheUsed = true;
      debug.cacheDiagnostics.cacheReadOk = shared.stats.ok;
      debug.cacheDiagnostics.cacheReadErrors = shared.stats.error ? [shared.stats.error] : [];
      debug.cacheDiagnostics.cachedCandidatesFound = shared.stats.totalRows;
      debug.cacheDiagnostics.cachedImportableCandidatesFound = shared.stats.reviewableCount;
      debug.cacheDiagnostics.cachedCandidatesLoaded = shared.candidates.length;
      debug.cacheDiagnostics.backendCandidateCount = shared.stats.totalRows;
      debug.cacheDiagnostics.backendReviewableCount = shared.stats.reviewableCount;
      debug.cacheDiagnostics.frontendReviewableCount = shared.candidates.length;
      debug.cacheDiagnostics.totalSharedRows = shared.stats.totalRows;
      debug.cacheDiagnostics.validSharedRows = shared.stats.validCount;
      debug.cacheDiagnostics.needsReviewSharedRows = shared.stats.needsReviewCount;
      debug.cacheDiagnostics.invalidSharedRows = shared.stats.invalidCount;
      debug.cacheDiagnostics.failedSharedRows = shared.stats.failedCount;
      debug.cacheDiagnostics.exactNameRowsFound = shared.stats.exactNameRowsFound;
      debug.cacheDiagnostics.clubSuffixedRowsFound = shared.stats.clubSuffixedRowsFound;
      debug.cacheDiagnostics.ambiguousNameRowsRejected = shared.stats.ambiguousNameRowsRejected;
      debug.cacheDiagnostics.rowsBeforeSemanticDeduplication = shared.stats.rowsBeforeSemanticDeduplication;
      debug.cacheDiagnostics.canonicalCandidatesAfterSemanticDeduplication = shared.stats.canonicalCandidatesAfterSemanticDeduplication;
      debug.cacheDiagnostics.duplicateSourceListsHidden = shared.stats.duplicateSourceListsHidden;
      debug.cacheDiagnostics.acceptedNameMatchReasons = shared.stats.acceptedNameMatchReasons;
      debug.cacheDiagnostics.semanticEventGroupDiagnostics = shared.stats.semanticEventGroupDiagnostics;
      debug.cacheDiagnostics.cacheScopeStatus = shared.stats.indexingComplete ? "complete" : "incomplete";
      debug.cacheDiagnostics.cacheScopeComplete = shared.stats.indexingComplete;
      debug.cacheDiagnostics.continuationRequired = false;
      debug.cacheDiagnostics.requestMode = requestMode;
      debug.cacheDiagnostics.explicitContinuationRequested = false;
      debug.cacheDiagnostics.userSearchLiveCrawlStarted = false;
      debug.cacheDiagnostics.ingestionYear = year;
      debug.cacheDiagnostics.ingestionScopeKey = `${year}:shared:v1`;
      debug.cacheDiagnostics.ingestionComplete = shared.stats.indexingComplete;
      debug.cacheDiagnostics.batchElapsedMs = shared.stats.queryDurationMs;
      debug.continuationAvailable = false;
      debug.message = shared.stats.indexingComplete ? "Search complete. Shared Leirdue cache returned indexed results." : "Results still being indexed. Cached results are shown now. Additional Leirdue.net results may become available as the shared index is updated.";
      debug.candidateReasons.unshift(`Shared cache-only search: ${shared.stats.totalRows} total rows, ${shared.stats.validCount} valid, ${shared.stats.needsReviewCount} needs_review, ${shared.stats.invalidCount} invalid, ${shared.stats.failedCount} failed, exactNameRows=${shared.stats.exactNameRowsFound}, clubSuffixedRows=${shared.stats.clubSuffixedRowsFound}, ambiguousRejected=${shared.stats.ambiguousNameRowsRejected}, beforeSemanticDedup=${shared.stats.rowsBeforeSemanticDeduplication}, afterSemanticDedup=${shared.stats.canonicalCandidatesAfterSemanticDeduplication}, duplicateSourcesHidden=${shared.stats.duplicateSourceListsHidden}, ${shared.stats.reviewableCount} reviewable, coverage=${shared.stats.coverageStatus}, liveCrawlStarted=false.`);
      if (shared.stats.ok && shared.stats.reviewableCount > 0) return NextResponse.json({ candidates: shared.candidates, debug, continuationToken: null });
    }

    const cached = !sourceUrl
      ? await getCachedLeirdueCandidates({ shooterName, year, disciplines, authorization: request.headers.get("authorization") })
      : null;
    const progress = !sourceUrl
      ? await getLeirdueCrawlProgress({ shooterName, year, disciplines, authorization: request.headers.get("authorization") })
      : null;

    if (requestMode === "initial" && !explicitContinue && !continuationToken && cached && cached.stats.cachedImportableCandidatesFound > 0) {
      const debug = emptyLeirdueSearchDebug();
      debug.selectedYear = year;
      debug.normalizedSearchName = shooterName.toLowerCase().replace(/\s+/g, " ").trim();
      debug.selectedDisciplineFilters = disciplines;
      applyCacheStatsToDebug(debug, cached, progress);
      debug.cacheDiagnostics.requestMode = requestMode;
      debug.cacheDiagnostics.explicitContinuationRequested = false;
      debug.cacheDiagnostics.buttonAction = buttonAction;
      debug.cacheDiagnostics.sentRequestMode = typeof body.requestMode === "string" ? body.requestMode : null;
      debug.cacheDiagnostics.sentExplicitContinue = explicitContinue;
      debug.cacheDiagnostics.requestScopeKey = `${shooterName.toLowerCase().replace(/\s+/g, " ").trim()}|${year}|${disciplines.map((discipline) => discipline.toLowerCase().trim()).sort().join(",")}`;
      debug.cacheDiagnostics.liveFetchesSkippedBecauseCached = cached.stats.cachedImportableCandidatesFound;
      debug.cacheDiagnostics.elapsedMs = 0;
      const savedToken = progress?.progress?.status === "incomplete" ? progress.progress.continuation_token : null;
      const scopeComplete = progress?.progress?.status === "complete";
      const provenStoredComplete = Boolean(scopeComplete && progress?.progress?.last_stop_reason === "completionProofValid" && (progress.progress.remaining_work_count ?? 0) === 0 && progress.progress.processed_work_count > 0);
      const invalidCompleteState = Boolean(scopeComplete && !provenStoredComplete);
      if (invalidCompleteState) {
        debug.cacheDiagnostics.invalidCompleteStateDetected = true;
        debug.cacheDiagnostics.invalidCompleteStateReason = "legacy complete crawl state has no completion proof; revalidation required";
        const repair = await repairLeirdueInvalidCompleteState({ shooterName, year, disciplines });
        debug.cacheDiagnostics.invalidCompleteStateRepaired = repair.ok;
        debug.cacheDiagnostics.progressWriteOk = repair.ok;
        debug.cacheDiagnostics.progressWriteError = repair.error;
        if (repair.ok) {
          debug.cacheDiagnostics.cacheScopeComplete = false;
          debug.cacheDiagnostics.cacheScopeStatus = "incomplete";
        }
      }
      const restartToken = (!scopeComplete || invalidCompleteState) && !savedToken ? restartIncompleteScopeToken : null;
      const nextToken = savedToken || restartToken;
      debug.cacheDiagnostics.stopReason = invalidCompleteState ? "invalidCompleteStateRevalidationRequired" : scopeComplete ? "completeFreshCacheHit" : savedToken ? "freshCacheHitContinuationRequired" : "freshCacheHitNoSavedProgressRestartRequired";
      debug.cacheDiagnostics.earlyReturnReason = debug.cacheDiagnostics.stopReason;
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
    result.debug.cacheDiagnostics.requestMode = requestMode;
    result.debug.cacheDiagnostics.explicitContinuationRequested = explicitContinue || Boolean(continuationToken);
    result.debug.cacheDiagnostics.buttonAction = buttonAction;
    result.debug.cacheDiagnostics.sentRequestMode = typeof body.requestMode === "string" ? body.requestMode : null;
    result.debug.cacheDiagnostics.sentExplicitContinue = explicitContinue;
    result.debug.cacheDiagnostics.requestScopeKey = `${shooterName.toLowerCase().replace(/\s+/g, " ").trim()}|${year}|${disciplines.map((discipline) => discipline.toLowerCase().trim()).sort().join(",")}`;
    applyCacheStatsToDebug(result.debug, cached, progress);
    if (initialShared) {
      result.debug.cacheDiagnostics.totalSharedRows = initialShared.stats.totalRows;
      result.debug.cacheDiagnostics.validSharedRows = initialShared.stats.validCount;
      result.debug.cacheDiagnostics.needsReviewSharedRows = initialShared.stats.needsReviewCount;
      result.debug.cacheDiagnostics.invalidSharedRows = initialShared.stats.invalidCount;
      result.debug.cacheDiagnostics.failedSharedRows = initialShared.stats.failedCount;
      result.debug.cacheDiagnostics.ingestionComplete = initialShared.stats.indexingComplete;
      result.debug.cacheDiagnostics.ingestionYear = year;
      result.debug.cacheDiagnostics.ingestionScopeKey = `${year}:shared:v1`;
      result.debug.cacheDiagnostics.userSearchLiveCrawlStarted = true;
      result.debug.candidateReasons.unshift(initialShared.stats.ok ? `Shared cache fallback: ${initialShared.stats.reviewableCount} reviewable shared candidates; coverage=${initialShared.stats.coverageStatus}; live/cached fallback continued.` : "Shared cache unavailable; live/cached fallback continued.");
    }
    result.debug.cacheDiagnostics.savedContinuationTokenPresent = Boolean(savedContinuationToken || (continuationToken && !restartRequested));
    if (restartRequested) {
      result.debug.cacheDiagnostics.invalidCompleteStateDetected = true;
      result.debug.cacheDiagnostics.invalidCompleteStateReason = "restart requested to repair invalid or unproven complete crawl state";
      if (!result.debug.cacheDiagnostics.completionProof.valid) {
        result.debug.cacheDiagnostics.recoveryRediscoveryUsed = true;
        result.debug.cacheDiagnostics.recoveryRediscoveryReason = "revalidating invalid complete crawl state";
        result.debug.cacheDiagnostics.recoveryErrorAffectsCompletion = true;
      }
    }
    result.debug.cacheDiagnostics.resumedFromSavedProgress = Boolean(savedContinuationToken && result.debug.cacheDiagnostics.continuationDecodeOk && result.debug.cacheDiagnostics.eligibleWorkAfterRestore > 0);
    result.debug.cacheDiagnostics.liveRefreshReason = savedContinuationToken ? "savedIncompleteProgress" : restartRequested ? "invalidCompleteStateRecoveryRestart" : continuationToken ? "clientContinuationNoSavedProgress" : cached?.candidates.length ? "cachedRowsButNoCompleteProgress" : "cacheMiss";
    if (cached?.candidates.length) {
      const cachedKeys = new Set(cached.candidates.map((candidate) => `${candidate.leirdueUrl}|${candidate.date || ""}|${candidate.shooterName || ""}|${candidate.ownScore ?? ""}`));
      result.candidates = [...cached.candidates, ...result.candidates.filter((candidate) => !cachedKeys.has(`${candidate.leirdueUrl}|${candidate.date || ""}|${candidate.shooterName || ""}|${candidate.ownScore ?? ""}`))];
      result.debug.cacheDiagnostics.cachedCandidatesLoaded = cached.candidates.length;
    }
    const responseCandidateKeys = result.candidates.map(responseCandidateKey);
    const responseUniqueCandidateKeys = new Set(responseCandidateKeys);
    result.debug.cacheDiagnostics.candidatePipelineReconciled = responseUniqueCandidateKeys.size === responseCandidateKeys.length;
    result.debug.cacheDiagnostics.renderedCandidateCountMatchesBackend = responseUniqueCandidateKeys.size === responseCandidateKeys.length;
    result.debug.cacheDiagnostics.uniqueCandidateKeysValid = responseUniqueCandidateKeys.size === responseCandidateKeys.length;
    if (!result.debug.cacheDiagnostics.candidatePipelineReconciled || !result.debug.cacheDiagnostics.renderedCandidateCountMatchesBackend || !result.debug.cacheDiagnostics.uniqueCandidateKeysValid) result.debug.cacheDiagnostics.completionProof.valid = false;
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
      result.debug.cacheDiagnostics.completionMarkedThisBatch = progressWrite.status === "complete";
      result.debug.cacheDiagnostics.completionPersistedInSameRequest = progressWrite.status === "complete" && result.debug.cacheDiagnostics.completionProof.valid;
      result.debug.cacheDiagnostics.extraCompletionRequestRequired = result.debug.cacheDiagnostics.completionProof.valid ? progressWrite.status !== "complete" : result.debug.cacheDiagnostics.extraCompletionRequestRequired;
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
