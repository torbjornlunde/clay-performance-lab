"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { supabase } from "@/lib/supabase/client";
import type { LeirdueCandidate, LeirdueCategory, LeirdueSearchDebug } from "@/lib/leirdue/types";

const DEFAULT_DISCIPLINES = ["Compak Sporting", "Kompakt leirduesti", "Leirduesti", "Sporting"];
const OPTIONAL_DISCIPLINES = ["Trap", "Skeet", "Other"];
const DISCIPLINE_CHOICES = [...DEFAULT_DISCIPLINES, ...OPTIONAL_DISCIPLINES];
const MAX_AUTO_BATCHES = 10;
const MAX_AUTO_LISTE_ID_SCANNED = 300;
const MAX_AUTO_SEARCH_MS = 4 * 60 * 1000;
const MAX_EMPTY_AUTO_BATCHES = 2;
const BATCH_TIMEOUT_MS = 35_000;
const SECTION_LABELS: Record<LeirdueCategory, string> = {
  recommended: "Recommended imports",
  review: "Review before import",
  control: "Control lists / not imported",
};

type EditableCandidate = LeirdueCandidate & { selected: boolean; localId: string; saveStatus?: "saved" | "duplicate" | "error"; saveMessage?: string };

type SaveResponse = {
  results?: { candidate: LeirdueCandidate; status: "saved" | "duplicate" | "error"; id?: string; message?: string }[];
  error?: string;
};

type SearchResponse = {
  candidates?: LeirdueCandidate[];
  debug?: LeirdueSearchDebug;
  continuationToken?: string | null;
  error?: string;
};


function isLowQualitySummaryCandidate(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes}`.toLowerCase();
  const percentageHeavy = /\b\d{1,3}(?:[,.]\d+)?\s*%/.test(text);
  const summaryList = /(ranking|prosent|cup sammenlagt|sammenlagt premiering|klasseføring|klasseforing|sesong|season)/.test(text);
  const missingUsableScore = candidate.ownScore === null || candidate.totalTargets === null;
  return candidate.category === "control" || percentageHeavy || summaryList || missingUsableScore;
}

function visibleImportCandidate(candidate: EditableCandidate) {
  if (candidate.category === "recommended") return !isLowQualitySummaryCandidate(candidate);
  if (candidate.category === "review") return candidate.ownScore !== null && candidate.totalTargets !== null && !isLowQualitySummaryCandidate(candidate);
  return false;
}

function candidateSelectedByDefault(candidate: LeirdueCandidate) {
  return candidate.category === "recommended" && (candidate.confidence === "high" || candidate.confidence === "medium") && candidate.importRecommended;
}

function performance(candidate: EditableCandidate) {
  if (candidate.ownScore === null || !candidate.winningScore || candidate.winningScore <= 0) return null;
  return (Number(candidate.ownScore) / Number(candidate.winningScore)) * 100;
}

function toEditable(candidate: LeirdueCandidate, index: number): EditableCandidate {
  return { ...candidate, selected: candidateSelectedByDefault(candidate), localId: `${candidate.leirdueUrl}-${candidate.date}-${index}` };
}

function candidateEventId(candidate: LeirdueCandidate) {
  try {
    return new URL(candidate.leirdueUrl).searchParams.get("stevne") || candidate.leirdueUrl;
  } catch {
    return candidate.leirdueUrl;
  }
}

function candidateMergeKey(candidate: LeirdueCandidate) {
  return [candidateEventId(candidate), candidate.date || "no-date", candidate.ownScore ?? "?", candidate.totalTargets ?? "?"].join("|");
}

function candidateQualityRank(candidate: LeirdueCandidate) {
  const completeScore = candidate.ownScore !== null && candidate.totalTargets !== null && candidate.winningScore !== null;
  if (candidate.category === "recommended" && candidate.confidence === "high" && completeScore) return 5;
  if (candidate.category === "recommended" && completeScore) return 4;
  if (candidate.category === "review" && completeScore) return 3;
  if (candidate.ownScore !== null || candidate.totalTargets !== null) return 2;
  return 1;
}

function visibleCandidateCount(candidates: EditableCandidate[]) {
  return candidates.filter(visibleImportCandidate).length;
}

function mergeCandidates(current: EditableCandidate[], incoming: LeirdueCandidate[]) {
  const merged = new Map(current.map((candidate) => [candidateMergeKey(candidate), candidate]));
  incoming.forEach((candidate, index) => {
    const key = candidateMergeKey(candidate);
    const existing = merged.get(key);
    const editable = toEditable(candidate, current.length + index);
    if (!existing) {
      merged.set(key, editable);
      return;
    }
    if (candidateQualityRank(candidate) > candidateQualityRank(existing)) {
      merged.set(key, { ...editable, selected: existing.selected, localId: existing.localId, saveStatus: existing.saveStatus, saveMessage: existing.saveMessage });
    }
  });
  return Array.from(merged.values());
}

function normalizeSaveError(response: SaveResponse) {
  return response.error || "Could not save selected Leirdue results.";
}

function hasLikelySelectedYearWork(debug?: LeirdueSearchDebug) {
  if (!debug) return true;
  return debug.pendingListeIdQueueRemaining > 0 || debug.confirmedSelectedYearEventsRemaining > 0 || debug.unknownYearSelectedTextEventsRemaining > 0;
}

function estimatedSearchProgress(debug: LeirdueSearchDebug | undefined, batchIndex: number, visibleCount: number, finished = false) {
  if (finished) return 100;
  const batchProgress = Math.min(batchIndex / MAX_AUTO_BATCHES, 1) * 55;
  const scanProgress = Math.min((debug?.scannedListeIdTotal || 0) / MAX_AUTO_LISTE_ID_SCANNED, 1) * 25;
  const candidateProgress = Math.min(visibleCount / Math.max(debug?.expectedCandidateTarget || 16, 1), 1) * 15;
  return Math.max(10, Math.min(95, Math.round(5 + batchProgress + scanProgress + candidateProgress)));
}

function autoSearchStopMessage(visibleCount: number) {
  return `Search stopped after finding ${visibleCount} likely result${visibleCount === 1 ? "" : "s"}. You can review these now.`;
}

function CandidateCard({ candidate, onChange }: { candidate: EditableCandidate; onChange: (candidate: EditableCandidate) => void }) {
  const percent = performance(candidate);

  function update<Key extends keyof EditableCandidate>(key: Key, value: EditableCandidate[Key]) {
    onChange({ ...candidate, [key]: value, saveStatus: undefined, saveMessage: undefined });
  }

  return (
    <article className="candidateCard">
      <div className="candidateTopline">
        <label className="checkboxLabel importToggle">
          <input type="checkbox" checked={candidate.selected} onChange={(event) => update("selected", event.target.checked)} />
          <span>{candidate.selected ? "Import" : "Skip"}</span>
        </label>
        <div className="candidateBadges">
          <span className={`badge ${candidate.category === "recommended" ? "badgeGreen" : candidate.category === "review" ? "badgeGold" : "badgeBlue"}`}>{candidate.category}</span>
          <span className={`badge ${candidate.confidence === "high" ? "badgeGreen" : candidate.confidence === "medium" ? "badgeGold" : "badgeBlue"}`}>{candidate.confidence} confidence</span>
          {candidate.alreadyImported || candidate.saveStatus === "duplicate" ? <span className="badge badgeBlue">Already imported</span> : null}
          {candidate.saveStatus === "saved" ? <span className="badge badgeGreen">Saved</span> : null}
          {candidate.saveStatus === "error" ? <span className="badge danger">Error</span> : null}
        </div>
      </div>

      <div className="row">
        <div>
          <label>Date</label>
          <input type="date" value={candidate.date || ""} onChange={(event) => update("date", event.target.value)} />
        </div>
        <div>
          <label>Proposed discipline</label>
          <select value={candidate.discipline} onChange={(event) => update("discipline", event.target.value)}>
            {DISCIPLINE_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <label>Competition name</label>
      <input value={candidate.name} onChange={(event) => update("name", event.target.value)} />

      <label>Shooting ground</label>
      <input value={candidate.shootingGround || ""} onChange={(event) => update("shootingGround", event.target.value)} placeholder="Shooting ground" />

      <div className="row threeColumnRow">
        <div>
          <label>Own score</label>
          <input type="number" min="0" inputMode="numeric" value={candidate.ownScore ?? ""} onChange={(event) => update("ownScore", event.target.value === "" ? null : Number(event.target.value))} />
        </div>
        <div>
          <label>Total targets</label>
          <input type="number" min="1" inputMode="numeric" value={candidate.totalTargets ?? ""} onChange={(event) => update("totalTargets", event.target.value === "" ? null : Number(event.target.value))} />
        </div>
        <div>
          <label>Winning score</label>
          <input type="number" min="1" inputMode="numeric" value={candidate.winningScore ?? ""} onChange={(event) => update("winningScore", event.target.value === "" ? null : Number(event.target.value))} />
        </div>
      </div>

      <div className="metricsRow">
        <span className="metricChip"><strong>{candidate.ownScore ?? "?"}/{candidate.totalTargets ?? "?"}</strong> own score</span>
        <span className="metricChip"><strong>{candidate.winningScore ?? "?"}/{candidate.totalTargets ?? "?"}</strong> winning score</span>
        {percent !== null ? <span className="metricChip highlightMetric"><strong>{percent.toFixed(1)}%</strong> performance</span> : null}
        <span className="metricChip"><strong>{candidate.listType || "Unknown list"}</strong></span>
      </div>

      <label>Leirdue URL</label>
      <input value={candidate.leirdueUrl} onChange={(event) => update("leirdueUrl", event.target.value)} placeholder="https://www.leirdue.net/..." />

      <label>Notes</label>
      <textarea value={candidate.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Parser notes or your correction notes" />

      <div className="btns">
        {candidate.leirdueUrl ? <a href={candidate.leirdueUrl} target="_blank" rel="noreferrer" className="button secondary">Open Leirdue link</a> : null}
      </div>
      {candidate.saveMessage ? <div className={candidate.saveStatus === "error" ? "error" : "notice"}>{candidate.saveMessage}</div> : null}
    </article>
  );
}

function DebugDetails({ debug, candidatesFound }: { debug: LeirdueSearchDebug | null; candidatesFound: number }) {
  if (!debug) return null;
  const recentStatuses = debug.fetchedUrls.slice(-6);
  return (
    <details className="card" open={candidatesFound === 0}>
      <summary>Debug details</summary>
      <div className="metricsRow">
        <span className="metricChip"><strong>{debug.selectedYear ?? "?"}</strong> selected year</span>
        <span className="metricChip"><strong>{debug.normalizedSearchName || "?"}</strong> normalized name</span>
        <span className="metricChip"><strong>{debug.fetchedUrls.length}</strong> pages fetched</span>
        <span className="metricChip"><strong>{debug.eventInfoPagesFetched}</strong> event info pages</span>
        <span className="metricChip"><strong>{debug.eventResultMenuPagesFetched}</strong> result menu pages</span>
        <span className="metricChip"><strong>{debug.resultMenusBeforeFirstListeIdScan}</strong> menus before first liste_id scan</span>
        <span className="metricChip"><strong>{debug.listeIdLinksExtracted}</strong> liste_id links</span>
        <span className="metricChip"><strong>{debug.listeIdLinksFromResultMenus}</strong> from result menus</span>
        <span className="metricChip"><strong>{debug.listeIdPagesQueued}</strong> liste_id pages queued</span>
        <span className="metricChip"><strong>{debug.listeIdPagesScannedForName}</strong> liste_id pages scanned for name</span>
        <span className="metricChip"><strong>{debug.listeIdPagesFetched}</strong> liste_id pages fetched</span>
        <span className="metricChip"><strong>{debug.listeIdShooterPagesFound}</strong> liste_id shooter pages</span>
        <span className="metricChip"><strong>{debug.shooterPagesParsed}</strong> shooter pages parsed</span>
        <span className="metricChip"><strong>{debug.completedEventsInspected}</strong> completed events inspected</span>
        <span className={`metricChip ${debug.timedOut ? "danger" : ""}`}><strong>{debug.timedOut ? debug.timedOutAtPhase || "yes" : "no"}</strong> timed out</span>
        <span className={`metricChip ${debug.timedOutBeforeFirstListeIdScan ? "danger" : ""}`}><strong>{debug.timedOutBeforeFirstListeIdScan ? "yes" : "no"}</strong> timeout before liste_id scan</span>
        <span className="metricChip"><strong>{debug.selectedYearEventIdsCount}</strong> selected-year events</span>
        <span className={`metricChip ${debug.limitReached ? "danger" : ""}`}><strong>{debug.limitReached ? debug.whichLimit || "yes" : "no"}</strong> limit reached</span>
        <span className={`metricChip ${debug.overviewYearMismatch ? "danger" : ""}`}><strong>{debug.overviewYearMismatch ? "yes" : "no"}</strong> overview year mismatch</span>
        <span className="metricChip"><strong>{debug.futureEventsSkipped}</strong> future events skipped</span>
        <span className="metricChip"><strong>{debug.skippedOutsideSelectedYear}</strong> outside-year skipped</span>
        <span className="metricChip"><strong>{debug.candidateRowsCreated}</strong> candidates created</span>
        <span className="metricChip"><strong>{debug.candidateCategoryCounts.recommended}/{debug.candidateCategoryCounts.review}/{debug.candidateCategoryCounts.control}</strong> rec/review/control</span>
        <span className="metricChip"><strong>{debug.candidateConfidenceCounts.high}/{debug.candidateConfidenceCounts.medium}/{debug.candidateConfidenceCounts.low}</strong> high/med/low</span>
        <span className="metricChip"><strong>{debug.duplicatesRemoved}</strong> duplicates removed</span>
        <span className="metricChip"><strong>{debug.candidatesWithOwnScore}</strong> own score</span>
        <span className="metricChip"><strong>{debug.candidatesWithWinningScore}</strong> winning score</span>
        <span className="metricChip"><strong>{debug.candidatesWithTotalTargets}</strong> total targets</span>
        <span className="metricChip"><strong>{debug.candidatesWithShootingGround}</strong> shooting ground</span>
        <span className="metricChip"><strong>{debug.recommendedWithShootingGround}</strong> recommended ground</span>
        <span className="metricChip"><strong>{debug.recommendedWithCompleteScore}</strong> recommended complete score</span>
        <span className="metricChip"><strong>{debug.hiddenControlCandidates}</strong> debug/control hidden from useful sections</span>
        <span className={`metricChip ${debug.continuationAvailable ? "badgeGold" : ""}`}><strong>{debug.continuationAvailable ? "yes" : "no"}</strong> continuation</span>
        <span className="metricChip"><strong>{debug.batchNumber}</strong> batch</span>
        <span className="metricChip"><strong>{debug.scannedListeIdTotal}</strong> total liste_id scanned</span>
        <span className="metricChip"><strong>{debug.scannedEventTotal}</strong> total events scanned</span>
        <span className="metricChip"><strong>{debug.remainingEventQueueCount}</strong> remaining events</span>
        <span className="metricChip"><strong>{debug.confirmedSelectedYearEventsRemaining}/{debug.unknownYearSelectedTextEventsRemaining}/{debug.outsideYearFallbackEventsRemaining}/{debug.pendingListeIdQueueRemaining}</strong> confirmed/unknown/outside/pending</span>
      </div>
      {candidatesFound === 0 ? <p className="small muted">No candidates found. Try broader filters or add result manually.</p> : null}
      {recentStatuses.length > 0 ? (
        <>
          <p className="small muted">Recent fetch statuses:</p>
          <ul className="small muted">
            {recentStatuses.map((item) => (
              <li key={`${item.url}-${item.status}-${item.note || ""}`}>{item.status ?? "network"} {item.ok ? "OK" : "failed"} — {item.url}{item.note ? ` (${item.note})` : ""}</li>
            ))}
          </ul>
        </>
      ) : null}
      {debug.message ? <p className="small muted">Search warning: {debug.message}</p> : null}
      {debug.errorMessage ? <p className="small muted">Last error: {debug.errorMessage}</p> : null}
      {debug.lastFetchUrl ? <p className="small muted">Last fetch URL: {debug.lastFetchUrl}</p> : null}
      {debug.listInspectionLimitReached ? <p className="small muted">Result list inspection limit reached.</p> : null}
      {debug.validationUrlsInspected > 0 ? <p className="small muted">Validation URLs inspected: {debug.validationUrlsInspected}; validation shooter matches: {debug.validationShooterMatches}</p> : null}
      <p className="small muted">Guessed overview URLs tried: {debug.guessedYearOverviewUrlsTried.join("; ") || "none"}</p>
      <p className="small muted">Selected-year overview URL used: {debug.selectedYearOverviewUrlUsed || "none"}</p>
      <p className="small muted">Event overview URLs: {debug.eventOverviewUrls.join("; ") || "none"}</p>
      <p className="small muted">Discovered year links: {debug.discoveredYearLinks.slice(0, 15).map((item) => `${item.text || "link"} -> ${item.url}`).join("; ") || "none"}</p>
      <p className="small muted">Selected-year links found: {debug.selectedYearLinksFound.slice(0, 15).map((item) => `${item.text || "link"} -> ${item.url}`).join("; ") || "none"}</p>
      {debug.overviewDiagnostics.length > 0 ? <p className="small muted">Overview diagnostics: {debug.overviewDiagnostics.map((item) => `${item.url} selectedYear=${item.containsSelectedYear ? "yes" : "no"} selectedYearLinks=${item.selectedYearLinkCount}: ${item.snippet.slice(0, 220)}`).join(" | ")}</p> : null}
      {debug.noSelectedYearEventsReason ? <p className="small muted">No selected-year events reason: {debug.noSelectedYearEventsReason}</p> : null}
      <p className="small muted">Selected discipline filters: {debug.selectedDisciplineFilters.join(", ") || "none"}</p>
      <p className="small muted">Events before filtering: {debug.eventsFoundBeforeFiltering}; after soft filter: {debug.selectedYearEventLinksAfterSoftFilter}; fallback added: {debug.genericFallbackEventsAdded}; relevant inspected: {debug.relevantEventsInspected}; selected-year event links: {debug.selectedYearEventLinksCount}; actual selected-year events: {debug.actualSelectedYearEventsCount}; unknown-year fallbacks: {debug.unknownYearFallbackEventsCount}; actual-year mismatches skipped: {debug.actualYearMismatchSkippedCount}; hard skipped unselected: {debug.hardSkippedUnselectedDiscipline}; hard skipped ranking/control: {debug.hardSkippedRankingOrControl}; skipped: {JSON.stringify(debug.eventLinksSkippedByReason)}</p>
      <p className="small muted">Phase: {debug.phaseReached || "unknown"}; scan stopped: {debug.scanStoppedReason || "unknown"}; event stop: {debug.eventStopReason || "unknown"}; quality stop: {debug.candidateQualityStopReason || "unknown"}; target complete candidates: {debug.expectedCandidateTarget}; continuation reason: {debug.continuationReason || "none"}; disabled: {debug.continuationDisabledReason || "none"}; totals complete/visible/hidden: {debug.completeCandidatesFoundTotal}/{debug.visibleCandidatesCountTotal}/{debug.hiddenLowQualityCandidatesCountTotal}; previous/returned visible: {debug.previousVisibleCandidatesCount}/{debug.returnedVisibleCandidatesCount}; accumulated complete: {debug.accumulatedCompleteCandidatesCount}; batch queued/scanned/fetched/menus: {debug.queuedThisBatch}/{debug.scannedThisBatch}/{debug.fetchedThisBatch}/{debug.eventMenusFetchedThisBatch}; pending queue start/end: {debug.pendingListeIdQueueAtStart}/{debug.pendingListeIdQueueAtEnd}; liste_ids queued/scanned this batch: {debug.listeIdsQueuedThisBatch}/{debug.listeIdsScannedThisBatch}; scan-first: {debug.scanFirstMode ? "yes" : "no"}; time budget: {debug.timeBudgetReason || "none"}; continuation stop: {debug.continuationStopReason || "none"}; batch stop: {debug.batchStopReason || "none"}; event batches: {debug.eventBatchesProcessed}; event queue remaining: {debug.eventQueueRemainingWhenStopped}; candidates per batch: {debug.candidatesFoundPerBatch.join(", ") || "none"}; liste_id scanned per batch: {debug.listeIdPagesScannedPerBatch.join(", ") || "none"}; candidate quality complete/partial/low/percent: {debug.completeCandidatesFound}/{debug.partialCandidatesFound}/{debug.lowQualityCandidatesFound}/{debug.percentageHeavyCandidates}; visible/hidden low-quality: {debug.visibleCandidatesCount}/{debug.hiddenLowQualityCandidatesCount}; complete list: {debug.completeCandidatesFoundList.map((item) => `${item.date || "no date"} ${item.name} ${item.ownScore ?? "?"}/${item.totalTargets ?? "?"}`).join(" | ") || "none"}; continued after low-quality only: {debug.searchContinuedBecauseOnlyLowQualityCandidates ? "yes" : "no"}; candidates after discovery/scan/final: {debug.candidatesFoundAfterDiscovery}/{debug.candidatesFoundAfterScan}/{debug.candidatesFoundBeforeTimeout}; high-priority liste_id pages fetched: {debug.highPriorityListeIdPagesFetched}; low-priority liste_id skipped: {debug.lowPriorityListeIdPagesSkipped}</p>
      {debug.prioritizedEventLinks.length > 0 ? <p className="small muted">Top event priorities: {debug.prioritizedEventLinks.slice(0, 20).map((item) => `${item.eventId} ${item.score}: ${item.title} [actualYear ${item.actualEventYear ?? "unknown"}; overviewYear ${item.overviewMatchedYear ? "yes" : "no"}; ${item.inspected ? "inspected" : "not inspected"}; ${item.skippedReason || "not skipped"}; ${item.titleParseSource || "unknown"}; matches ${(item.selectedDisciplineMatches || []).join("/") || "none"}] (${item.reason})`).join(" | ")}</p> : null}
      {debug.nextUnscannedEventQueue.length > 0 ? <p className="small muted">Next unscanned events: {debug.nextUnscannedEventQueue.map((item) => `${item.eventId} ${item.priority}: ${item.title} [actualYear ${item.actualEventYear ?? "unknown"}] (${item.reason})`).join(" | ")}</p> : null}
      {debug.eventTitleDebugRows.length > 0 ? <p className="small muted">Parsed event titles: {debug.eventTitleDebugRows.slice(0, 20).map((item) => `${item.eventId} ${item.priority}: ${item.title} (${item.titleParseSource}; actualYear ${item.actualEventYear ?? "unknown"}; ${item.inspected ? "inspected" : "not inspected"}; ${item.skippedReason || "not skipped"}; ${item.selectedDisciplineMatches.join("/") || "no discipline match"}; ${item.rawRowSnippet.slice(0, 120)})`).join(" | ")}</p> : null}
      {debug.prioritizedListeIdLinks.length > 0 ? <p className="small muted">Top liste_id priorities: {debug.prioritizedListeIdLinks.slice(0, 10).map((item) => `${item.score}: ${item.title} (${item.reason})`).join(" | ")}</p> : null}
      {debug.resultMenuDebug.length > 0 ? <p className="small muted">Result menu liste_id counts: {debug.resultMenuDebug.slice(0, 10).map((item) => `${item.eventId}: ${item.listeIdCount} (${item.firstListeIdUrls.slice(0, 3).join(", ")})`).join(" | ")}</p> : null}
      {debug.knownTorbjorn2025Debug.length > 0 ? <p className="small muted">Regression priority: {debug.regressionPriorityApplied ? "applied" : "not applied"}; boosted: {debug.regressionEventsBoosted.join(", ") || "none"}. Torbjørn 2025 debug assertions: {debug.knownTorbjorn2025Debug.map((item) => `${item.eventId}/${item.listeId}: discovered=${item.discovered ? "yes" : "no"}, inspected=${item.inspected ? "yes" : "no"}, resultMenu=${item.resultMenuFetched ? "yes" : "no"}, listeIds=[${item.listeIdsFound.join(",") || "none"}], queued=${item.listeQueued ? "yes" : "no"}, scanned=${item.listeScanned ? "yes" : "no"}${item.reason ? `, reason=${item.reason}` : ""}`).join(" | ")}</p> : null}
      <p className="small muted">Event IDs found: {debug.eventIdsFound.slice(0, 40).join(", ") || "none"}</p>
      <p className="small muted">Event IDs inspected: {debug.eventIdsInspected.slice(0, 40).join(", ") || "none"}</p>
      <p className="small muted">Event years found: {JSON.stringify(debug.eventYearsFound)}; inspected: {JSON.stringify(debug.eventYearsInspected)}; candidates by year: {JSON.stringify(debug.candidatesByYear)}</p>
      <p className="small muted">Skipped outside selected year: {debug.eventIdsSkippedOutsideYear.slice(0, 20).join(", ") || "none"}; skipped future: {debug.eventIdsSkippedFuture.slice(0, 20).join(", ") || "none"}</p>
      {debug.shooterMatchSnippets.length > 0 ? <p className="small muted">Shooter snippets: {debug.shooterMatchSnippets.slice(0, 5).map((item) => `${item.url}: ${item.snippet.slice(0, 220)}`).join(" | ")}</p> : null}
      {debug.resultMenuDiagnostics.length > 0 ? <p className="small muted">Result menu diagnostics: {debug.resultMenuDiagnostics.map((item) => `${item.eventUrl} contains ${Object.entries(item.contains).filter(([, value]) => value).map(([key]) => key).join(", ") || "none"}: ${item.snippet.slice(0, 240)}`).join(" | ")}</p> : null}

      {debug.validationChecklist.length > 0 ? (
        <>
          <p className="small muted">Validation checklist:</p>
          <ul className="small muted">
            {debug.validationChecklist.map((item) => (
              <li key={item.label}>
                {item.label}. {item.expectedName} — {item.status} — {item.found ? "found" : "not found"} — {item.parsedOwnScore ?? "?"}/{item.parsedTotalTargets ?? "?"} winner {item.parsedWinningScore ?? "?"} — {item.parsedDiscipline || "unknown discipline"} — {item.parsedShootingGround || "unknown ground"} — {item.matchedUrl || "no URL"} — {item.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {debug.candidateDebugRows.length > 0 ? (
        <>
          <p className="small muted">Candidate table:</p>
          <ul className="small muted">
            {debug.candidateDebugRows.slice(0, 20).map((item) => (
              <li key={`${item.url}-${item.date}-${item.ownScore}`}>
                {item.date || "no date"} — {item.name} — {item.discipline} — {item.shootingGround || "unknown ground"} ({item.shootingGroundSource}) — {item.ownScore ?? "?"}/{item.totalTargets ?? "?"} winner {item.winningScore ?? "?"} — {item.category}/{item.confidence} — {item.importRecommended ? "recommended" : "not checked"} — {item.hiddenFromNormalUi ? "hidden/debug" : "visible"} — {item.url} — {item.reason} — {item.notes.slice(0, 260)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {debug.firstListeIdUrlsInspected.length > 0 ? <p className="small muted">First liste_id URLs inspected: {debug.firstListeIdUrlsInspected.join("; ")}</p> : null}
      {debug.firstShooterMatchUrls.length > 0 ? <p className="small muted">Shooter found on: {debug.firstShooterMatchUrls.join("; ")}</p> : null}
      {debug.candidateReasons.length > 0 ? <p className="small muted">Candidate reasons: {debug.candidateReasons.slice(0, 8).join("; ")}</p> : null}
      {debug.rejectedReasons.length > 0 ? <p className="small muted">Rejected/skip reasons: {debug.rejectedReasons.slice(0, 5).join("; ")}</p> : null}
      {debug.firstUsefulSnippet ? <p className="small muted">First useful snippet: {debug.firstUsefulSnippet}</p> : null}
    </details>
  );
}

export default function LeirdueImportPage() {
  const [shooterName, setShooterName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [disciplines, setDisciplines] = useState<string[]>(DEFAULT_DISCIPLINES);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [debug, setDebug] = useState<LeirdueSearchDebug | null>(null);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchCounterText, setSearchCounterText] = useState("");

  const groupedCandidates = useMemo(() => {
    return {
      recommended: candidates.filter((candidate) => candidate.category === "recommended" && visibleImportCandidate(candidate)),
      review: candidates.filter((candidate) => candidate.category === "review" && visibleImportCandidate(candidate)),
    } satisfies Record<"recommended" | "review", EditableCandidate[]>;
  }, [candidates]);
  const hiddenFromNormalListCount = candidates.length - groupedCandidates.recommended.length - groupedCandidates.review.length;

  const selectedCount = candidates.filter((candidate) => candidate.selected && visibleImportCandidate(candidate)).length;

  function toggleDiscipline(discipline: string) {
    setDisciplines((current) => (current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline]));
  }

  function updateCandidate(updated: EditableCandidate) {
    setCandidates((current) => current.map((candidate) => (candidate.localId === updated.localId ? updated : candidate)));
  }

  async function fetchSearchBatch(token: string | null) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/leirdue/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shooterName, year: Number(year), disciplines, continuationToken: token }),
        signal: controller.signal,
      });
      const data = (await response.json()) as SearchResponse;
      return { response, data };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function runAutoSearch(startToken: string | null, reset: boolean) {
    if (searching) return;

    setError("");
    setSuccess("");
    setSearching(true);
    setSearchProgress(reset ? 5 : Math.max(searchProgress, 15));
    setSearchStatus(reset ? "Preparing Leirdue search..." : "Continuing search for more results...");
    setSearchCounterText("");

    let token = startToken;
    let batchCount = 0;
    let consecutiveEmptyBatches = 0;
    let stoppedInsideLoop = false;
    let currentCandidates = reset ? [] : candidates;
    const startedAt = Date.now();

    if (reset) {
      setCandidates([]);
      setDebug(null);
      setContinuationToken(null);
    }

    try {
      while (batchCount < MAX_AUTO_BATCHES) {
        batchCount += 1;
        const batchLabel = token ? `batch ${batchCount + (debug?.batchNumber || 0)}` : "batch 1";
        setSearchStatus(token ? "Continuing search for more results..." : "Finding relevant events...");
        setSearchCounterText(`Running ${batchLabel} — ${visibleCandidateCount(currentCandidates)} results found so far`);

        const { response, data } = await fetchSearchBatch(token);
        setDebug(data.debug || null);

        if (!response.ok) {
          setError(data.error || "Could not fetch Leirdue results right now.");
          setContinuationToken(token);
          stoppedInsideLoop = true;
          break;
        }

        setSearchStatus("Searching for your name in result lists...");
        const beforeVisible = visibleCandidateCount(currentCandidates);
        currentCandidates = reset && batchCount === 1 ? (data.candidates || []).map(toEditable) : mergeCandidates(currentCandidates, data.candidates || []);
        const afterVisible = visibleCandidateCount(currentCandidates);
        const newVisible = afterVisible - beforeVisible;
        setCandidates(currentCandidates);

        const nextToken = data.continuationToken || null;
        const target = data.debug?.expectedCandidateTarget || 16;
        const completeTotal = data.debug?.completeCandidatesFoundTotal ?? afterVisible;
        const likelyWorkRemains = hasLikelySelectedYearWork(data.debug);
        const shouldContinue = Boolean(nextToken && likelyWorkRemains && completeTotal < target);
        setContinuationToken(shouldContinue ? nextToken : null);
        setSearchProgress(estimatedSearchProgress(data.debug, batchCount, afterVisible, !shouldContinue));
        setSearchCounterText(`Batch ${data.debug?.batchNumber || batchCount} — ${data.debug?.scannedListeIdTotal || 0} result lists checked — ${afterVisible} results found so far`);

        if (newVisible <= 0 && (data.debug?.pendingListeIdQueueRemaining || 0) === 0) consecutiveEmptyBatches += 1;
        else consecutiveEmptyBatches = 0;

        if (!shouldContinue) {
          setSearchStatus("Preparing import review...");
          if (data.debug?.message) setSuccess(data.debug.message);
          else if (afterVisible === 0 && reset) setSuccess("No candidates found. Try broader filters or add result manually.");
          else if (completeTotal >= target) setSuccess(`Search complete. We found ${afterVisible} likely result${afterVisible === 1 ? "" : "s"} for ${year}.`);
          else setSuccess(`Search complete. We found ${afterVisible} likely result${afterVisible === 1 ? "" : "s"} for ${year}. Older/archive pages were skipped.`);
          stoppedInsideLoop = true;
          break;
        }

        token = nextToken;
        const scannedTooManyLists = (data.debug?.scannedListeIdTotal || 0) >= MAX_AUTO_LISTE_ID_SCANNED;
        const searchedTooLong = Date.now() - startedAt >= MAX_AUTO_SEARCH_MS;
        const noVisibleProgress = consecutiveEmptyBatches >= MAX_EMPTY_AUTO_BATCHES;
        if (scannedTooManyLists || searchedTooLong || noVisibleProgress) {
          setContinuationToken(nextToken);
          setSearchStatus("Preparing import review...");
          setSuccess(autoSearchStopMessage(afterVisible));
          setSearchProgress(100);
          stoppedInsideLoop = true;
          break;
        }

        setSearchStatus("Fetching more result lists...");
      }

      if (batchCount >= MAX_AUTO_BATCHES && !stoppedInsideLoop) {
        const visibleCount = visibleCandidateCount(currentCandidates);
        setSuccess(autoSearchStopMessage(visibleCount));
        setSearchStatus("Preparing import review...");
        setSearchProgress(100);
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        const visibleCount = visibleCandidateCount(currentCandidates);
        if (visibleCount > 0) setSuccess(autoSearchStopMessage(visibleCount));
        else setError("Leirdue search took too long before candidates were found. Try again or use a narrower year.");
      } else {
        setError("Could not fetch Leirdue results right now.");
      }
    } finally {
      setSearching(false);
      setSearchProgress((progress) => (progress > 0 ? Math.max(progress, 100) : progress));
    }
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAutoSearch(null, true);
  }

  async function continueSearch() {
    if (!continuationToken) return;
    await runAutoSearch(continuationToken, false);
  }

  async function saveSelected() {
    setError("");
    setSuccess("");
    const selected = candidates.filter((candidate) => candidate.selected && visibleImportCandidate(candidate));
    if (selected.length === 0) {
      setError("Select at least one candidate to save.");
      return;
    }

    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSaving(false);
      setError("You must be logged in to import Leirdue results.");
      return;
    }

    const response = await fetch("/api/leirdue/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ candidates: selected }),
    });
    const data = (await response.json()) as SaveResponse;
    setSaving(false);

    if (!response.ok || !data.results) {
      setError(normalizeSaveError(data));
      return;
    }

    setCandidates((current) =>
      current.map((candidate) => {
        const result = data.results?.find((item) => item.candidate.leirdueUrl === candidate.leirdueUrl && item.candidate.date === candidate.date && item.candidate.name === candidate.name);
        if (!result) return candidate;
        return {
          ...candidate,
          selected: result.status === "error",
          alreadyImported: result.status === "duplicate" || candidate.alreadyImported,
          saveStatus: result.status,
          saveMessage: result.message || (result.status === "saved" ? "Saved as a result-only session." : result.status === "duplicate" ? "Already imported" : "Could not save this candidate."),
        };
      }),
    );

    const saved = data.results.filter((result) => result.status === "saved").length;
    const duplicates = data.results.filter((result) => result.status === "duplicate").length;
    setSuccess(`${saved} result${saved === 1 ? "" : "s"} saved. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.`);
  }

  return (
    <main>
      <form className="card" onSubmit={search}>
        <p className="eyebrow">Leirdue.net import</p>
        <h2>Import from Leirdue.net</h2>
        <p>Find old competition results and review before saving.</p>
        <div className="notice small">
          This v1 imports result-only sessions after your review. It does not import misses, bom data, scorecard photos, finals or control lists automatically.
        </div>

        <label>Shooter name</label>
        <input value={shooterName} onChange={(event) => setShooterName(event.target.value)} placeholder="Enter shooter name" required />

        <label>Year</label>
        <input value={year} onChange={(event) => setYear(event.target.value)} type="number" min="1990" max={new Date().getFullYear() + 1} required />

        <fieldset className="checkboxGroup">
          <legend>Disciplines</legend>
          <p className="small muted">Select every relevant discipline to search at once.</p>
          {/* TODO: Later, discipline checkboxes can be preselected from a Shooter profile page where the user chooses which disciplines they shoot. */}
          <div className="checkboxGrid">
            {DISCIPLINE_CHOICES.map((discipline) => (
              <label key={discipline} className="checkboxLabel">
                <input type="checkbox" checked={disciplines.includes(discipline)} onChange={() => toggleDiscipline(discipline)} />
                <span>{discipline === "Other" ? "Other / unknown" : discipline}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success">{success} {success.includes("saved") ? <Link href="/stats">Open Stats</Link> : null}</div> : null}
        {searching || searchStatus ? (
          <div className="searchProgressPanel" aria-live="polite">
            {searching ? <p className="small">This search may take a few minutes. Please do not close or refresh the page while we fetch results from Leirdue.net.</p> : null}
            <div className="progressHeader">
              <span>Estimated progress</span>
              <strong>{Math.round(searchProgress)}%</strong>
            </div>
            <progress value={searchProgress} max={100} />
            {searchStatus ? <p className="small muted">{searchStatus}</p> : null}
            {searchCounterText ? <p className="small muted">{searchCounterText}</p> : null}
          </div>
        ) : null}

        <div className="btns">
          <button disabled={searching || disciplines.length === 0}>{searching ? "Searching..." : "Search Leirdue.net"}</button>
          {continuationToken && !searching ? <button type="button" className="secondary" onClick={continueSearch}>Continue search</button> : null}
          <Link className="button secondary" href="/results/new">Add result manually</Link>
          <Link className="button secondary" href="/dashboard">Dashboard</Link>
        </div>
      </form>

      <DebugDetails debug={debug} candidatesFound={candidates.length} />

      {groupedCandidates.recommended.length + groupedCandidates.review.length > 0 ? (
        <div className="card">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Review before save</p>
              <h2>Candidate results</h2>
              <p className="small muted">Edit any field before saving. Only checked candidates will be imported as result-only sessions. Low-quality percentage/cup-summary matches are hidden from this list and remain in debug details.</p>
            </div>
            <span className="countPill">{selectedCount} selected{hiddenFromNormalListCount > 0 ? ` · ${hiddenFromNormalListCount} debug-only hidden` : ""}</span>
          </div>
          <div className="btns">
            <button onClick={saveSelected} disabled={saving || selectedCount === 0}>{saving ? "Saving..." : "Save selected candidates"}</button>
            <Link href="/stats" className="button secondary">Stats</Link>
          </div>
        </div>
      ) : null}

      {(["recommended", "review"] as const).map((category) => (
        groupedCandidates[category].length > 0 ? (
          <section key={category} className="sessionGroup">
            <div className="groupHeader">
              <div>
                <h3>{SECTION_LABELS[category]}</h3>
                <p className="small muted">
                  {category === "recommended"
                    ? "Direct-looking competition results with enough score context."
                    : "Possible matches with usable score and target context that need manual attention before import."}
                </p>
              </div>
              <span className="countPill">{groupedCandidates[category].length}</span>
            </div>
            {groupedCandidates[category].map((candidate) => (
              <CandidateCard key={candidate.localId} candidate={candidate} onChange={updateCandidate} />
            ))}
          </section>
        ) : null
      ))}
    </main>
  );
}
