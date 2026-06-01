import { NextResponse } from "next/server";
import { FETCH_ERROR_MESSAGE, searchLeirdueCandidates } from "@/lib/leirdue/parser";

export const dynamic = "force-dynamic";

type SearchBody = {
  shooterName?: unknown;
  year?: unknown;
  disciplines?: unknown;
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

  if (!shooterName || !year || disciplines.length === 0) {
    return NextResponse.json({ error: "Shooter name, year and at least one discipline are required." }, { status: 400 });
  }

  try {
    const result = await searchLeirdueCandidates({ shooterName, year, disciplines });
    if (result.debug.fetchedUrls.length > 0 && result.debug.fetchedUrls.every((item) => !item.ok)) {
      return NextResponse.json({ ...result, error: FETCH_ERROR_MESSAGE }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: FETCH_ERROR_MESSAGE, debug: { selectedYear: year, normalizedSearchName: shooterName.toLowerCase().replace(/\s+/g, " ").trim(), eventOverviewUrls: [], guessedYearOverviewUrlsTried: [], discoveredYearLinks: [], selectedYearLinksFound: [], selectedYearOverviewUrlUsed: null, overviewYearMismatch: false, overviewDiagnostics: [], noSelectedYearEventsReason: null, selectedYearEventLinks: [], eventTitleDebugRows: [], selectedYearEventLinksCount: 0, selectedYearEventIdsCount: 0, actualSelectedYearEventsCount: 0, unknownYearFallbackEventsCount: 0, actualYearMismatchSkippedCount: 0, knownTorbjorn2025Debug: [], regressionPriorityApplied: false, regressionEventsBoosted: [], eventBatchesProcessed: 0, eventQueueRemainingWhenStopped: 0, eventStopReason: null, candidatesFoundPerBatch: [], listeIdPagesScannedPerBatch: [], completeCandidatesFound: 0, partialCandidatesFound: 0, lowQualityCandidatesFound: 0, searchContinuedBecauseOnlyLowQualityCandidates: false, percentageHeavyCandidates: 0, expectedCandidateTarget: 16, visibleCandidatesCount: 0, hiddenLowQualityCandidatesCount: 0, completeCandidatesFoundList: [], candidateQualityStopReason: null, selectedDisciplineFilters: [], eventsFoundBeforeFiltering: 0, selectedYearEventLinksBeforeFilter: 0, hardSkippedUnselectedDiscipline: 0, hardSkippedRankingOrControl: 0, genericFallbackEventsAdded: 0, selectedYearEventLinksAfterSoftFilter: 0, relevantEventsInspected: 0, timedOutAtPhase: null, eventLinksSkippedByReason: { outsideYear: 0, future: 0, ranking: 0, irrelevantDiscipline: 0, duplicate: 0, limit: 0 }, resultMenuDebug: [], prioritizedEventLinks: [], prioritizedListeIdLinks: [], phaseReached: null, candidatesFoundBeforeTimeout: 0, highPriorityListeIdPagesFetched: 0, lowPriorityListeIdPagesSkipped: 0, listeIdPagesQueued: 0, listeIdPagesScannedForName: 0, shooterPagesParsed: 0, scanStoppedReason: null, candidatesFoundAfterDiscovery: 0, candidatesFoundAfterScan: 0, resultMenusBeforeFirstListeIdScan: 0, timedOutBeforeFirstListeIdScan: false, timedOut: false, limitReached: false, whichLimit: null, message: null, lastFetchUrl: null, errorMessage: null, eventIdsFound: [], eventIdsInspected: [], eventDatesParsed: {}, eventYearsFound: {}, eventYearsInspected: {}, candidatesByYear: {}, skippedOutsideSelectedYear: 0, eventIdsSkippedOutsideYear: [], eventIdsSkippedFuture: [], completedEventsInspected: 0, futureEventsSkipped: 0, listeIdLinksByEvent: {}, shooterMatchSnippets: [], hiddenControlCandidates: 0, fetchedUrls: [], eventLinksFound: 0, resultLinksFound: 0, eventPagesFetched: 0, eventInfoPagesFetched: 0, eventResultMenuPagesFetched: 0, listeIdLinksExtracted: 0, listeIdLinksFromResultMenus: 0, listeIdPagesFetched: 0, listeIdShooterPagesFound: 0, firstListeIdUrlsInspected: [], firstShooterMatchUrls: [], listInspectionLimitReached: false, resultMenuDiagnostics: [], validationUrlsInspected: 0, validationShooterMatches: 0, candidateCategoryCounts: { recommended: 0, review: 0, control: 0 }, candidateConfidenceCounts: { high: 0, medium: 0, low: 0 }, duplicatesRemoved: 0, candidatesWithOwnScore: 0, candidatesWithWinningScore: 0, candidatesWithTotalTargets: 0, candidatesWithShootingGround: 0, recommendedWithShootingGround: 0, recommendedWithCompleteScore: 0, candidateDebugRows: [], validationChecklist: [], pagesInspected: 0, shooterPagesFound: 0, candidateRowsCreated: 0, rejectedReasons: [FETCH_ERROR_MESSAGE], candidateReasons: [FETCH_ERROR_MESSAGE], firstUsefulSnippet: null } }, { status: 502 });
  }
}
