"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { supabase } from "@/lib/supabase/client";
import type { LeirdueCandidate, LeirdueDebugParseResult, LeirdueDuplicateMatch, LeirdueDuplicateStatus, LeirdueManualLinkParseResult, LeirdueSearchDebug } from "@/lib/leirdue/types";
import { extractLeirdueSourceIdentifiers, leirdueNameMatchReason, namesLikelyMatch, profileNameContainedInShooterText } from "@/lib/leirdue/normalize";

const DEFAULT_DISCIPLINES = ["Compak Sporting", "Kompakt leirduesti", "Leirduesti", "Sporting"];
const OPTIONAL_DISCIPLINES = ["Trap", "Skeet", "Other"];
const DISCIPLINE_CHOICES = [...DEFAULT_DISCIPLINES, ...OPTIONAL_DISCIPLINES];
const BATCH_TIMEOUT_MS = 20_000;

type EditableCandidate = LeirdueCandidate & { selected: boolean; localId: string; saveStatus?: "saved" | "duplicate" | "error"; saveMessage?: string };

type SavedImportSummary = { id?: string; eventName: string; date: string | null; score: string };

type SaveResponse = {
  results?: { candidate: LeirdueCandidate; status: "saved" | "duplicate" | "error"; id?: string; message?: string; duplicateMatches?: LeirdueDuplicateMatch[] }[];
  error?: string;
};

type DuplicateResponse = {
  results?: { candidate: LeirdueCandidate; status: LeirdueDuplicateStatus; matches: LeirdueDuplicateMatch[] }[];
  error?: string;
};

type SearchResponse = {
  candidates?: LeirdueCandidate[];
  debug?: LeirdueSearchDebug;
  continuationToken?: string | null;
  error?: string;
};

type DirectParseResponse = LeirdueDebugParseResult & { error?: string };
type LinkParseResponse = LeirdueManualLinkParseResult & { error?: string };
type ManualListChoice = LeirdueManualLinkParseResult["listChoices"][number];


function isLowQualitySummaryCandidate(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes}`.toLowerCase();
  const percentageHeavy = /\b\d{1,3}(?:[,.]\d+)?\s*%/.test(text) || /(percentageheavy|prosent|percentage)/.test(text);
  const summaryList = /(ranking|cup sammenlagt|sammenlagt premiering|klasseføring|klasseforing|sesong|season|multiEventSummary|cupSummary)/i.test(text);
  const missingUsableScore = candidate.ownScore === null || candidate.totalTargets === null;
  return candidate.category === "control" || percentageHeavy || summaryList || missingUsableScore;
}

function candidateUsesMainResultList(candidate: LeirdueCandidate) {
  const listType = (candidate.listType || "").toLowerCase();
  if (listType === "overall list" || listType === "main result list") return true;
  if (listType === "class list") return false;
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes}`.toLowerCase();
  if (/(class list|klassedelt|klassevis|class\s+(?:a|b|c|d|e|junior|veteran)|klasse\s+(?:a|b|c|d|e|junior|veteran))/.test(text)) return false;
  return /(overall list|main result list|sammenlagt|total|totalt|resultat|resultater|alle|hovedliste|hovedresultat)/.test(text);
}

function candidateHasUsableSourceList(candidate: LeirdueCandidate) {
  const ids = candidateSourceIds(candidate);
  const listType = (candidate.listType || "").toLowerCase();
  return Boolean(ids.stevneId && ids.listeId && listType !== "class list");
}

function visibleImportCandidate(candidate: EditableCandidate) {
  if (isManualLinkCandidate(candidate)) return candidate.ownScore !== null && candidate.totalTargets !== null;
  if (candidate.category === "recommended") return !isLowQualitySummaryCandidate(candidate);
  if (candidate.category === "review") return candidate.ownScore !== null && candidate.totalTargets !== null && !isLowQualitySummaryCandidate(candidate);
  return false;
}

function isManualLinkCandidate(candidate: LeirdueCandidate) {
  return /Manual link import parsed row/i.test(candidate.notes || "");
}

function candidateSelectedByDefault(candidate: LeirdueCandidate) {
  if (/Manual link import parsed row/i.test(candidate.notes || "")) return false;
  const completeScore = candidate.ownScore !== null && candidate.totalTargets !== null && candidate.winningScore !== null;
  return candidate.category === "recommended" && candidate.confidence === "high" && candidate.importRecommended && completeScore && (candidateUsesMainResultList(candidate) || candidateHasUsableSourceList(candidate)) && candidate.duplicateStatus !== "exact" && !candidate.alreadyImported;
}

function manualLinkNameMatchStatus(parsedName: string | null | undefined, profileName: string) {
  if (!parsedName || !profileName) return null;
  if (namesLikelyMatch(parsedName, profileName)) return { status: "matched_to_you" as const, reason: leirdueNameMatchReason(parsedName, profileName) };
  if (profileNameContainedInShooterText(parsedName, profileName)) return { status: "matched_to_you" as const, reason: "partial/initial match" as const };
  return null;
}

function performance(candidate: EditableCandidate) {
  if (candidate.ownScore === null || !candidate.winningScore || candidate.winningScore <= 0) return null;
  return (Number(candidate.ownScore) / Number(candidate.winningScore)) * 100;
}

function toEditable(candidate: LeirdueCandidate, index: number): EditableCandidate {
  const sourceIds = candidateSourceIds(candidate);
  return {
    ...candidate,
    ...sourceIds,
    warnings: candidate.warnings || [],
    seriesScores: candidate.seriesScores || [],
    selected: candidateSelectedByDefault(candidate),
    localId: `${candidate.leirdueUrl}-${candidate.date}-${index}`,
    duplicateStatus: candidate.duplicateStatus || "new",
    duplicateMatches: candidate.duplicateMatches || [],
    shooterMatchStatus: candidate.shooterMatchStatus || null,
  };
}

function candidateEventId(candidate: LeirdueCandidate) {
  try {
    return new URL(candidate.leirdueUrl).searchParams.get("stevne") || candidate.leirdueUrl;
  } catch {
    return candidate.leirdueUrl;
  }
}

function candidateSourceIds(candidate: LeirdueCandidate) {
  return {
    stevneId: candidate.stevneId || extractLeirdueSourceIdentifiers(candidate.leirdueUrl).stevneId,
    listeId: candidate.listeId || extractLeirdueSourceIdentifiers(candidate.leirdueUrl).listeId,
  };
}

function duplicateLabel(candidate: EditableCandidate) {
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) return "Already imported";
  if (candidate.duplicateStatus === "possible") return "Possible duplicate";
  return "New result";
}

function candidateWarnings(candidate: EditableCandidate) {
  const warnings = new Set(candidate.warnings || []);
  if (!candidate.discipline || candidate.discipline === "Other") warnings.add("Could not detect discipline.");
  if (!candidate.seriesScores || candidate.seriesScores.length === 0) warnings.add("Could not detect series breakdown.");
  if (candidate.duplicateStatus === "possible") warnings.add("Possible duplicate.");
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) warnings.add("Already imported.");
  return Array.from(warnings);
}

function canSelectCandidate(candidate: EditableCandidate) {
  return candidate.duplicateStatus !== "exact" && !candidate.alreadyImported && candidate.saveStatus !== "saved";
}

function candidateMergeKey(candidate: LeirdueCandidate) {
  return [candidateEventId(candidate), candidate.date || "no-date", candidate.shooterName || "unknown-shooter", candidate.placement ?? "no-place", candidate.ownScore ?? "?", candidate.totalTargets ?? "?"].join("|");
}

function candidateQualityRank(candidate: LeirdueCandidate) {
  const completeScore = candidate.ownScore !== null && candidate.totalTargets !== null && candidate.winningScore !== null;
  if ((candidate.duplicateStatus === "exact" || candidate.alreadyImported) && completeScore) return 4;
  if (candidate.category === "recommended" && candidate.confidence === "high" && completeScore) return 5;
  if (candidate.category === "recommended" && completeScore) return 4;
  if (candidate.category === "review" && completeScore) return 3;
  if (candidate.ownScore !== null || candidate.totalTargets !== null) return 2;
  return 1;
}

function candidateStatusRank(candidate: LeirdueCandidate) {
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) return 2;
  if (candidate.category === "recommended") return 4;
  if (candidate.category === "review") return 3;
  return 1;
}

function candidateTime(candidate: LeirdueCandidate) {
  return candidate.date ? new Date(`${candidate.date}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
}

function sortCandidatesForReview(candidateList: EditableCandidate[]) {
  return [...candidateList].sort((a, b) => {
    const matchRank = (candidate: EditableCandidate) => candidate.shooterMatchStatus === "matched_to_you" ? 3 : candidate.shooterMatchStatus === "possible_match" ? 2 : 1;
    const matchDiff = matchRank(b) - matchRank(a);
    if (matchDiff !== 0) return matchDiff;
    const dateDiff = candidateTime(a) - candidateTime(b);
    if (dateDiff !== 0) return dateDiff;
    const statusDiff = candidateStatusRank(b) - candidateStatusRank(a);
    if (statusDiff !== 0) return statusDiff;
    const qualityDiff = candidateQualityRank(b) - candidateQualityRank(a);
    if (qualityDiff !== 0) return qualityDiff;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function visibleCandidateCount(candidates: EditableCandidate[]) {
  return candidates.filter((candidate) => candidate.category !== "control").length;
}

function candidateReviewCounts(candidateList: EditableCandidate[]) {
  const sorted = sortCandidatesForReview(candidateList);
  const confirmed = sorted.filter((candidate) => candidate.category === "recommended" && visibleImportCandidate(candidate) && candidate.duplicateStatus !== "exact" && !candidate.alreadyImported);
  const possible = sorted.filter((candidate) => (candidate.category === "review" || isManualLinkCandidate(candidate)) && visibleImportCandidate(candidate) && candidate.duplicateStatus !== "exact" && !candidate.alreadyImported);
  const alreadyImported = sorted.filter((candidate) => candidate.duplicateStatus === "exact" || candidate.alreadyImported);
  const ignored = sorted.filter((candidate) => candidate.duplicateStatus !== "exact" && !candidate.alreadyImported && !visibleImportCandidate(candidate));
  const reviewable = confirmed.length + possible.length;
  const total = reviewable + alreadyImported.length + ignored.length;
  return { confirmed, possible, alreadyImported, ignored, confirmedCount: confirmed.length, possibleCount: possible.length, alreadyImportedCount: alreadyImported.length, ignoredFailedCount: ignored.length, reviewableCount: reviewable, totalCandidateCount: total };
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
  return sortCandidatesForReview(Array.from(merged.values()));
}

function normalizeSaveError(response: SaveResponse) {
  return response.error || "Could not save selected Leirdue results.";
}

function hasLikelySelectedYearWork(debug?: LeirdueSearchDebug) {
  if (!debug) return true;
  return debug.pendingListeIdQueueRemaining > 0 || debug.confirmedSelectedYearEventsRemaining > 0 || debug.likelySelectedYearEventsRemaining > 0 || debug.unknownYearEventsRemaining > 0;
}

function estimatedSearchProgress(debug: LeirdueSearchDebug | undefined) {
  const cache = debug?.cacheDiagnostics;
  const processed = cache?.previouslyProcessedAfterBatch || cache?.previouslyProcessed || debug?.scannedEventTotal || null;
  const remaining = cache?.remainingWorkAfterBatch ?? cache?.remainingWork ?? null;
  if (cache) {
    const stageProcessed = debug?.listeIdsScannedThisBatch || debug?.eventMenusFetchedThisBatch || cache.processedThisBatch || 0;
    const stageRemaining = debug?.pendingListeIdQueueRemaining || debug?.remainingEventQueueCount || 0;
    cache.currentProgressStage = debug?.listeIdsScannedThisBatch ? "Checking result lists" : debug?.eventMenusFetchedThisBatch ? "Checking event result menus" : cache.cachedCandidatesLoaded ? "Showing cached results" : "Discovering events";
    cache.stageProcessed = stageProcessed;
    cache.stageRemaining = stageRemaining;
    cache.stageTotal = stageProcessed + stageRemaining;
    cache.newlyDiscoveredWorkThisBatch = Math.max(debug?.listeIdsQueuedThisBatch || 0, debug?.queuedThisBatch || 0);
  }
  if (processed === null || remaining === null || processed < 0 || remaining < 0) {
    if (cache) {
      cache.progressProcessedCount = processed;
      cache.progressRemainingCount = remaining;
      cache.progressTotalCount = null;
      cache.calculatedProgressPercent = null;
      cache.rawOverallProgressPercent = null;
      cache.displayedProgressPercent = null;
      cache.progressCalculationSource = "unknown-work-counts";
      cache.progressCappedReason = "unknownTotalWork";
    }
    return null;
  }
  const total = processed + remaining;
  const calculated = total > 0 ? (processed / total) * 100 : 0;
  const complete = Boolean(cache?.completionProof?.valid && cache.cacheScopeComplete);
  const capped = complete ? 100 : Math.min(calculated, 99);
  if (cache) {
    cache.progressProcessedCount = processed;
    cache.progressRemainingCount = remaining;
    cache.progressTotalCount = total;
    cache.calculatedProgressPercent = calculated;
    cache.rawOverallProgressPercent = calculated;
    cache.displayedProgressPercent = capped;
    cache.progressCalculationSource = "processed-over-processed-plus-remaining";
    cache.progressCappedReason = complete ? null : "notCompleteProofValid";
  }
  return Math.max(0, Math.round(capped));
}

function likelyResultsLabel(count: number) {
  return `${count} likely result${count === 1 ? "" : "s"}`;
}

function autoSearchIncompleteMessage(visibleCount: number, reason: string) {
  return `Search incomplete. Found ${likelyResultsLabel(visibleCount)}. Reason: ${reason}.`;
}

function autoSearchCompleteMessage(visibleCount: number) {
  return `Search complete. Found ${likelyResultsLabel(visibleCount)}. Please review the list before saving.`;
}

function searchCounterMessage(scannedListCount: number, foundCount: number, autoContinuing = false) {
  return `Searching Leirdue.net… ${scannedListCount} result lists checked — ${foundCount} reviewable results found so far${autoContinuing ? " — continuing automatically" : ""}`;
}

function formatDate(date: string | null) {
  if (!date) return "Missing date";
  const [yyyy, mm, dd] = date.split("-");
  if (!yyyy || !mm || !dd) return date;
  return `${dd}.${mm}.${yyyy}`;
}

function confidenceLabel(candidate: EditableCandidate) {
  if (candidate.category === "control") return "No match";
  return `${candidate.confidence[0].toUpperCase()}${candidate.confidence.slice(1)} confidence`;
}

function reviewStatusLabel(candidate: EditableCandidate) {
  if (candidate.saveStatus === "saved") return "Imported";
  if (candidate.saveStatus === "error") return "Failed";
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) return "Already imported";
  if (candidate.duplicateStatus === "possible") return "Possible duplicate";
  if (isManualLinkCandidate(candidate) && candidate.ownScore !== null && candidate.totalTargets !== null) return candidate.shooterMatchStatus === "matched_to_you" ? "Likely match" : "Selectable result";
  if (isLowQualitySummaryCandidate(candidate)) return `Not importable — ${shortBlockerReason(candidate)}`;
  if (candidate.category === "recommended") return "Confirmed match";
  if (candidate.category === "review") return candidate.shooterMatchStatus === "matched_to_you" ? "Review before import" : "Possible match";
  return "Ignored / not matched";
}

function statusBadgeClass(candidate: EditableCandidate) {
  if (candidate.saveStatus === "error") return "danger";
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) return "badgeBlue";
  if (isManualLinkCandidate(candidate) && candidate.ownScore !== null && candidate.totalTargets !== null) return candidate.shooterMatchStatus === "matched_to_you" ? "badgeGreen" : "badgeGold";
  if (candidate.duplicateStatus === "possible" || candidate.category === "review") return "badgeGold";
  if (candidate.category === "recommended") return "badgeGreen";
  return "badgeBlue";
}

function confidenceBadgeClass(candidate: EditableCandidate) {
  if (candidate.category === "control") return "badgeBlue";
  return candidate.confidence === "high" ? "badgeGreen" : candidate.confidence === "medium" ? "badgeGold" : "badgeBlue";
}

function candidateReason(candidate: EditableCandidate) {
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) return "Already imported from Leirdue.net or matching saved result.";
  if (candidate.duplicateStatus === "possible") return candidate.duplicateMatches?.[0]?.reason || "Possible duplicate.";
  if (isLowQualitySummaryCandidate(candidate)) return longBlockerReason(candidate);
  if (isManualLinkCandidate(candidate) && candidate.ownScore !== null && candidate.totalTargets !== null) return "Parsed from the pasted result list. Select it if this is your result.";
  if (candidate.shooterMatchStatus === "unmatched") return "Shooter name did not match.";
  if (candidate.shooterMatchStatus === "possible_match") return "Possible match — please review before importing.";
  if (!candidate.date) return "Missing date.";
  if (!candidate.discipline || candidate.discipline === "Other") return "Discipline not recognized.";
  if (candidate.ownScore === null) return "Could not identify a valid score.";
  if (candidate.totalTargets === null) return "Missing total target count.";
  if (candidate.category === "control") return longBlockerReason(candidate);
  if (candidate.confidence === "low" || candidate.category === "review") return "Possible match — please review before importing.";
  return "Ready for review.";
}

function shortBlockerReason(candidate: LeirdueCandidate) {
  const reason = longBlockerReason(candidate).toLowerCase();
  if (reason.includes("percentage") || reason.includes("ranking")) return "ranking/control data";
  if (reason.includes("outside")) return "outside selected year";
  if (reason.includes("discipline")) return "discipline is not selected";
  if (reason.includes("total target")) return "missing total targets";
  if (reason.includes("score")) return "no valid score";
  return "review details";
}

function longBlockerReason(candidate: LeirdueCandidate) {
  const text = `${candidate.name} ${candidate.listType || ""} ${candidate.notes} ${(candidate.warnings || []).join(" ")}`.toLowerCase();
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) return "Duplicate of an existing imported result.";
  if (/(percentageheavy|prosent|percentage|\b\d{1,3}(?:[,.]\d+)?\s*%|ranking|klasseføring|klasseforing)/.test(text)) return "Score appears to come from percentage/ranking data, not target score.";
  if (/(control|cup sammenlagt|sammenlagt premiering|multieventsummary|cupsummary|flere stevner|sesong|season)/.test(text)) return "Appears to be a ranking/control list, not a competition result.";
  if (/outside selected year|outsideyear/.test(text)) return "Outside selected year.";
  if (/parsed discipline is not selected|discipline is not selected/.test(text)) return "Discipline is not selected.";
  if (candidate.ownScore === null) return "Could not identify a valid score.";
  if (candidate.totalTargets === null) return "Missing total target count.";
  if (/parser could not|score row parsed/.test(text)) return "Parser could not read a complete result row.";
  return candidate.warnings?.[0] || "Not enough reliable competition-result data to import automatically.";
}

function ReviewAction({ candidate, update }: { candidate: EditableCandidate; update: <Key extends keyof EditableCandidate>(key: Key, value: EditableCandidate[Key]) => void }) {
  const selectable = canSelectCandidate(candidate);
  if (candidate.duplicateStatus === "exact" || candidate.alreadyImported) {
    const existingId = candidate.duplicateMatches?.[0]?.id;
    return existingId ? <Link href={`/sessions/${existingId}`} className="button secondary smallButton">View existing</Link> : <span className="badge badgeBlue">Already imported</span>;
  }
  if (candidate.category === "control" || isLowQualitySummaryCandidate(candidate)) return <span className="badge badgeBlue">Not importable</span>;
  if (candidate.duplicateStatus === "possible" && !candidate.allowDuplicateSave) {
    return <button type="button" className="secondary smallButton" onClick={() => update("allowDuplicateSave", true)}>Review duplicate</button>;
  }
  return <button type="button" className={candidate.selected ? "smallButton selectedResultButton" : "secondary smallButton"} disabled={!selectable} onClick={() => update("selected", !candidate.selected)}>{candidate.selected ? "Selected" : "Select result"}</button>;
}

function CandidateCard({ candidate, shooterName, onChange }: { candidate: EditableCandidate; shooterName: string; onChange: (candidate: EditableCandidate) => void }) {
  const percent = performance(candidate);
  const sourceIds = candidateSourceIds(candidate);
  const warnings = candidateWarnings(candidate);
  const nameMatchLabel = candidate.shooterMatchStatus === "matched_to_you" ? (candidate.category === "recommended" ? "Name match" : "Strong name match") : candidate.shooterMatchStatus === "possible_match" ? "Possible match" : null;
  const visibleReason = candidate.category === "control" || isLowQualitySummaryCandidate(candidate) ? candidateReason(candidate) : null;

  function update<Key extends keyof EditableCandidate>(key: Key, value: EditableCandidate[Key]) {
    onChange({ ...candidate, [key]: value, saveStatus: undefined, saveMessage: undefined });
  }

  function skipAsNotMe() {
    onChange({ ...candidate, selected: false, shooterMatchStatus: "unmatched", warnings: Array.from(new Set([...(candidate.warnings || []), "Marked as not me."])) });
  }

  return (
    <article className={`candidateCard compactCandidateCard selectableResultCard ${candidate.selected ? "selectedResultCard" : ""} ${candidate.category === "control" ? "secondaryCandidateCard" : ""}`}>
      <div className="compactCandidateRow">
        <div className="compactCandidateMain">
          {nameMatchLabel ? <div className="compactCandidateLine"><span className={`badge ${candidate.shooterMatchStatus === "matched_to_you" ? "badgeGreen" : "badgeGold"}`}>{nameMatchLabel}</span></div> : null}
          <div className="compactCandidateLine resultShooterLine"><strong>{candidate.shooterName || shooterName || "Unknown shooter"}</strong></div>
          <div className="compactCandidateLine scoreLine"><strong>{candidate.ownScore ?? "?"}/{candidate.maxScore ?? candidate.totalTargets ?? "?"}</strong><span>·</span><span>Winner {candidate.winningScore ?? "?"}</span></div>
          <div className="compactCandidateLine"><span>{candidate.placement ? `Place ${candidate.placement}` : "Placement unknown"}</span><span>·</span><span>{candidate.listType || "Unknown list"}</span></div>
          <div className="compactCandidateLine"><span>{candidate.shootingGround || "Club unknown"}</span><span>·</span><span>{candidate.discipline || "Unknown discipline"}</span><span>·</span><span>{formatDate(candidate.date)}</span></div>
        </div>
        <div className="compactCandidateBadges">
          <span className={`badge ${statusBadgeClass(candidate)}`}>{reviewStatusLabel(candidate)}</span>
          {candidate.duplicateStatus ? <span className={`badge ${candidate.duplicateStatus === "new" ? "badgeGreen" : candidate.duplicateStatus === "possible" ? "badgeGold" : "badgeBlue"}`}>{duplicateLabel(candidate)}</span> : null}
          {candidate.saveStatus === "saved" ? <span className="badge badgeGreen">Saved</span> : null}
          {candidate.saveStatus === "error" ? <span className="badge danger">Error</span> : null}
        </div>
        <div className="compactCandidateAction"><ReviewAction candidate={candidate} update={update} /></div>
      </div>
      {visibleReason ? <p className="small muted compactCandidateReason"><strong>Reason:</strong> {visibleReason}</p> : null}

      <details className="candidateDetails">
        <summary>Show details</summary>
        <p className="small muted"><strong>Review reason:</strong> {candidateReason(candidate)}</p>

        {candidate.duplicateStatus === "possible" ? (
          <label className="checkboxLabel">
            <input type="checkbox" checked={Boolean(candidate.allowDuplicateSave)} onChange={(event) => update("allowDuplicateSave", event.target.checked)} />
            <span>Save anyway after reviewing this possible duplicate</span>
          </label>
        ) : null}

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

        <label>Shooting ground / organizer</label>
        <input value={candidate.shootingGround || ""} onChange={(event) => update("shootingGround", event.target.value)} placeholder="Shooting ground" />

        <div className="row threeColumnRow">
          <div>
            <label>Own score</label>
            <input type="number" min="0" inputMode="numeric" value={candidate.ownScore ?? ""} onChange={(event) => update("ownScore", event.target.value === "" ? null : Number(event.target.value))} />
          </div>
          <div>
            <label>Total / max score</label>
            <input type="number" min="1" inputMode="numeric" value={candidate.totalTargets ?? ""} onChange={(event) => update("totalTargets", event.target.value === "" ? null : Number(event.target.value))} />
          </div>
          <div>
            <label>Winning score</label>
            <input type="number" min="1" inputMode="numeric" value={candidate.winningScore ?? ""} onChange={(event) => update("winningScore", event.target.value === "" ? null : Number(event.target.value))} />
          </div>
        </div>

        <div className="metricsRow">
          <span className="metricChip"><strong>{candidate.shooterClass || "?"}</strong> class</span>
          <span className="metricChip"><strong>{candidate.placement ?? "?"}</strong> placement</span>
          <span className="metricChip"><strong>{candidate.seriesScores?.length ? candidate.seriesScores.join(" · ") : "?"}</strong> series/post scores</span>
          <span className="metricChip"><strong>{candidate.winningScore ?? "?"}/{candidate.totalTargets ?? "?"}</strong> winning score</span>
          {percent !== null ? <span className="metricChip highlightMetric"><strong>{percent.toFixed(1)}%</strong> performance</span> : null}
          <span className="metricChip"><strong>{candidate.listType || "Unknown list"}</strong></span>
          <span className="metricChip"><strong>{sourceIds.stevneId || "?"}</strong> stevne_id</span>
          <span className="metricChip"><strong>{sourceIds.listeId || "?"}</strong> liste_id</span>
          {candidate.shooterMatchStatus === "matched_to_you" ? <span className="metricChip highlightMetric"><strong>Matched to you</strong></span> : null}
          {candidate.shooterMatchStatus === "possible_match" ? <span className="metricChip badgeGold"><strong>Possible match</strong></span> : null}
          {candidate.shooterMatchReason ? <span className="metricChip"><strong>{candidate.shooterMatchReason}</strong> name match</span> : null}
        </div>

        {warnings.length > 0 ? (
          <div className={candidate.duplicateStatus === "exact" ? "error" : "notice"}>
            <strong>Import warnings</strong>
            <ul>
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
            {candidate.duplicateMatches?.length ? <p className="small muted">Duplicate matches: {candidate.duplicateMatches.map((match) => `${match.reason} (${match.id})`).join("; ")}</p> : null}
          </div>
        ) : null}

        <label>Leirdue URL</label>
        <input value={candidate.leirdueUrl} onChange={(event) => update("leirdueUrl", event.target.value)} placeholder="https://www.leirdue.net/..." />

        <label>Notes / raw parser values</label>
        <textarea value={candidate.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Parser notes or your correction notes" />

        <div className="btns compactDetailActions">
          {candidate.leirdueUrl ? <a href={candidate.leirdueUrl} target="_blank" rel="noreferrer" className="button secondary smallButton">Open Leirdue link</a> : null}
          {candidate.category !== "control" && canSelectCandidate(candidate) ? <button type="button" className="secondary smallButton" onClick={skipAsNotMe}>Mark as not me</button> : null}
        </div>
      </details>
      {candidate.saveMessage ? <div className={candidate.saveStatus === "error" ? "error" : "notice"}>{candidate.saveMessage}</div> : null}
    </article>
  );
}

function ManualImportSummaryCard({ candidates, year }: { candidates: EditableCandidate[]; year: string }) {
  const visible = candidates.filter(visibleImportCandidate);
  if (visible.length === 0) return null;
  const first = visible[0];
  const likely = visible.find((candidate) => candidate.shooterMatchStatus === "matched_to_you") || visible.find((candidate) => candidate.shooterMatchStatus === "possible_match");
  const sourceIds = candidateSourceIds(first);

  return (
    <section className="card manualFoundSummary">
      <p className="eyebrow">Review step</p>
      <h2>We found this event</h2>
      <div className="manualFoundGrid">
        <span><strong>Event</strong>{first.name || "Unknown event"}</span>
        <span><strong>Date</strong>{formatDate(first.date)}</span>
        <span><strong>Discipline / list</strong>{first.discipline || first.listType || "Unknown list"}</span>
        <span><strong>Source</strong>Leirdue.net</span>
        <span><strong>Results found</strong>{visible.length}</span>
        <span><strong>Year</strong>{year}</span>
      </div>
      {likely ? (
        <div className={likely.shooterMatchStatus === "matched_to_you" ? "success likelyMatchCallout" : "notice likelyMatchCallout"}>
          <strong>{likely.shooterMatchStatus === "matched_to_you" ? "Likely match" : "Possible match"}:</strong>{" "}
          {likely.shooterName || "Unknown shooter"} — {likely.ownScore ?? "?"}/{likely.totalTargets ?? likely.maxScore ?? "?"}
        </div>
      ) : (
        <div className="notice likelyMatchCallout">
          <strong>Select your result below.</strong> We could not confidently pick one row, so choose the shooter row that belongs to you before importing.
        </div>
      )}
      <details className="candidateDetails">
        <summary>Source details</summary>
        <p className="small muted">Source URL: <a href={first.leirdueUrl} target="_blank" rel="noreferrer">{first.leirdueUrl}</a></p>
        <p className="small muted">stevne_id: {sourceIds.stevneId || "unknown"} · liste_id: {sourceIds.listeId || "unknown"}</p>
      </details>
    </section>
  );
}


function CoverageDiagnostics({ debug, groupedCounts }: { debug: LeirdueSearchDebug | null; groupedCounts: { confirmed: number; possible: number; alreadyImported: number; ignored: number } }) {
  if (!debug) return null;
  const coverage = debug.coverage;
  const checkedLists = debug.checkedLists || [];
  const rowsParsed = coverage?.rowsParsed ?? checkedLists.reduce((total, item) => total + item.rowsFound, 0);
  const failedOrUnsupported = coverage?.failedOrUnsupportedPages ?? checkedLists.filter((item) => item.status === "failed fetch" || item.status === "unsupported format").length;
  return (
    <details className="card coverageDiagnostics">
      <summary>Coverage diagnostics</summary>
      <div className="compactSummaryGrid" aria-label="Leirdue import coverage">
        <span><strong>{coverage?.eventsChecked ?? debug.completedEventsInspected}</strong> Events checked</span>
        <span><strong>{coverage?.resultListsChecked ?? checkedLists.length}</strong> Result lists checked</span>
        <span><strong>{rowsParsed}</strong> Rows parsed</span>
        <span><strong>{groupedCounts.confirmed || coverage?.confirmedMatches || 0}</strong> Confirmed</span>
        <span><strong>{groupedCounts.possible || coverage?.possibleMatches || 0}</strong> Possible</span>
        <span><strong>{groupedCounts.alreadyImported || coverage?.alreadyImported || 0}</strong> Already imported</span>
        <span><strong>{groupedCounts.ignored || coverage?.ignoredOrFailed || failedOrUnsupported}</strong> Ignored/failed</span>
        <span><strong>{failedOrUnsupported}</strong> Failed/unsupported pages</span>
      </div>
      <details>
        <summary>Checked lists</summary>
        {checkedLists.length > 0 ? (
          <ul className="small muted checkedListDiagnostics">
            {checkedLists.slice(0, 120).map((item, index) => (
              <li key={`${item.sourceUrl}-${index}`}>
                <strong>{item.status}</strong> — {item.date || "unknown date"} — {item.eventName || "unknown event"} — rows {item.rowsFound}, shooter rows {item.candidateShooterRows} — stevne_id {item.stevneId || "?"}, liste_id {item.listeId || "?"} — <a href={item.sourceUrl} target="_blank" rel="noreferrer">source</a>{item.reason ? ` — ${item.reason}` : ""}
              </li>
            ))}
          </ul>
        ) : <p className="small muted">No checked-list records were returned for this search batch.</p>}
      </details>
      <div className="notice small missingResultHelper">
        <strong>Missing a result?</strong>
        <div className="btns compactDetailActions">
          <button type="button" className="secondary smallButton" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder^="https://www.leirdue.net"]')?.focus()}>Try direct result list URL</button>
          <span className="small muted">Open Checked lists above to see every list scanned.</span>
          <Link className="button secondary smallButton" href="/results/new">Add manual result</Link>
        </div>
      </div>
    </details>
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
        <span className={`metricChip ${debug.cacheDiagnostics?.cacheUsed ? "badgeGold" : ""}`}><strong>{debug.cacheDiagnostics?.cacheUsed ? "yes" : "no"}</strong> cache used</span>
        <span className={`metricChip ${debug.cacheDiagnostics?.cacheReadOk ? "badgeGold" : "danger"}`}><strong>{debug.cacheDiagnostics?.cacheReadOk ? "yes" : "no"}</strong> cache read ok</span>
        <span className={`metricChip ${debug.cacheDiagnostics?.cacheWriteOk ? "badgeGold" : debug.cacheDiagnostics?.serviceRoleCacheWriteEnabled ? "" : "danger"}`}><strong>{debug.cacheDiagnostics?.cacheWriteOk ? "yes" : "no"}</strong> cache write ok</span>
        <span className="metricChip"><strong>{debug.cacheDiagnostics?.cachedCandidatesFound ?? 0}/{debug.cacheDiagnostics?.cachedImportableCandidatesFound ?? 0}</strong> cached/all importable</span>
        <span className="metricChip"><strong>{debug.cacheDiagnostics?.cachedInvalidListsFound ?? 0}</strong> cached invalid lists</span>
        <span className="metricChip"><strong>{debug.cacheDiagnostics?.liveFetchesStarted ?? 0}</strong> live fetches started</span>
        <span className="metricChip"><strong>{debug.cacheDiagnostics?.liveFetchesSkippedBecauseCached ?? 0}/{debug.cacheDiagnostics?.liveFetchesSkippedBecauseCachedInvalid ?? 0}</strong> live skipped cached/invalid</span>
        <span className="metricChip"><strong>{debug.cacheDiagnostics?.cacheMisses ?? 0}/{debug.cacheDiagnostics?.staleCacheRows ?? 0}</strong> cache misses/stale</span>
        <span className="metricChip"><strong>{debug.cacheDiagnostics?.serviceRoleCacheWriteEnabled ? "yes" : "no"}</strong> service-role cache write</span>
        <span className="metricChip"><strong>{debug.batchNumber}</strong> batch</span>
        <span className="metricChip"><strong>{debug.scannedListeIdTotal}</strong> total liste_id scanned</span>
        <span className="metricChip"><strong>{debug.scannedEventTotal}</strong> total events scanned</span>
        <span className="metricChip"><strong>{debug.remainingEventQueueCount}</strong> remaining events</span>
        <span className="metricChip"><strong>{debug.confirmedSelectedYearEventsRemaining}/{debug.likelySelectedYearEventsRemaining}/{debug.unknownYearEventsRemaining}/{debug.outsideYearFallbackEventsRemaining}/{debug.pendingListeIdQueueRemaining}</strong> confirmed/likely/unknown/outside/pending</span>
        <span className="metricChip"><strong>{debug.oldYearEventsSkippedThisBatch}/{debug.likelySelectedYearEventsProcessedThisBatch}</strong> old skipped / likely processed</span>
        <span className={`metricChip ${debug.autoStoppedBecauseOnlyOldFallbackRemains ? "badgeGold" : ""}`}><strong>{debug.autoStoppedBecauseOnlyOldFallbackRemains ? "yes" : "no"}</strong> old-fallback stop</span>
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
      {debug.cacheDiagnostics ? <p className="small muted">Cache diagnostics: used={debug.cacheDiagnostics.cacheUsed ? "yes" : "no"}; readOk={debug.cacheDiagnostics.cacheReadOk ? "yes" : "no"}; writeOk={debug.cacheDiagnostics.cacheWriteOk ? "yes" : "no"}; cached={debug.cacheDiagnostics.cachedCandidatesFound}; importable={debug.cacheDiagnostics.cachedImportableCandidatesFound}; invalidLists={debug.cacheDiagnostics.cachedInvalidListsFound}; liveStarted={debug.cacheDiagnostics.liveFetchesStarted}; liveSkippedCached={debug.cacheDiagnostics.liveFetchesSkippedBecauseCached}; liveSkippedInvalid={debug.cacheDiagnostics.liveFetchesSkippedBecauseCachedInvalid}; loaded={debug.cacheDiagnostics.cachedCandidatesLoaded}; scopeComplete={debug.cacheDiagnostics.cacheScopeComplete ? "yes" : "no"}; scopeStatus={debug.cacheDiagnostics.cacheScopeStatus}; continuationRequired={debug.cacheDiagnostics.continuationRequired ? "yes" : "no"}; resumed={debug.cacheDiagnostics.resumedFromSavedProgress ? "yes" : "no"}; processedThisBatch={debug.cacheDiagnostics.processedThisBatch}; previouslyProcessed={debug.cacheDiagnostics.previouslyProcessed}; remainingWork={debug.cacheDiagnostics.remainingWork ?? "unknown"}; liveRefresh={debug.cacheDiagnostics.liveRefreshStarted ? "yes" : "no"}; liveReason={debug.cacheDiagnostics.liveRefreshReason || "none"}; markedComplete={debug.cacheDiagnostics.crawlMarkedComplete ? "yes" : "no"}; crawlStop={debug.cacheDiagnostics.crawlStopReason || "none"}; crawlStateFound={debug.cacheDiagnostics.crawlStateFound ? "yes" : "no"}; tokenPresent={debug.cacheDiagnostics.savedContinuationTokenPresent ? "yes" : "no"}; decodeOk={debug.cacheDiagnostics.continuationDecodeOk ? "yes" : "no"}; decodeError={debug.cacheDiagnostics.continuationDecodeError || "none"}; stateVersion={debug.cacheDiagnostics.continuationStateVersion ?? "none"}; storedQueues={debug.cacheDiagnostics.storedEventQueueCount}/{debug.cacheDiagnostics.storedListeIdQueueCount}; restoredQueues={debug.cacheDiagnostics.restoredEventQueueCount}/{debug.cacheDiagnostics.restoredListeIdQueueCount}; eligibleAfterRestore={debug.cacheDiagnostics.eligibleWorkAfterRestore}; recovery={debug.cacheDiagnostics.recoveryRediscoveryUsed ? "yes" : "no"}; recoveryReason={debug.cacheDiagnostics.recoveryRediscoveryReason || "none"}; emptyQueueInterpretation={debug.cacheDiagnostics.emptyQueueInterpretation || "none"}; unfinishedWorkExpected={debug.cacheDiagnostics.unfinishedWorkExpected ? "yes" : "no"}; allRediscoveredEventsAlreadyProcessed={debug.cacheDiagnostics.allRediscoveredEventsAlreadyProcessed ? "yes" : "no"}; finalReconciliationComplete={debug.cacheDiagnostics.finalReconciliationComplete ? "yes" : "no"}; recoveryErrorAffectsCompletion={debug.cacheDiagnostics.recoveryErrorAffectsCompletion ? "yes" : "no"}; completionMarkedThisBatch={debug.cacheDiagnostics.completionMarkedThisBatch ? "yes" : "no"}; completionBefore={JSON.stringify(debug.cacheDiagnostics.completionCheckBeforeBatch)}; completionAfter={JSON.stringify(debug.cacheDiagnostics.completionCheckAfterBatch)}; queuesBefore={JSON.stringify(debug.cacheDiagnostics.queuesBeforeBatch)}; queuesAfter={JSON.stringify(debug.cacheDiagnostics.queuesAfterBatch)}; remainingAfterMutation={debug.cacheDiagnostics.remainingWorkAfterMutation ?? "unknown"}; completionEligibleAfterBatch={debug.cacheDiagnostics.completionEligibleAfterBatch ? "yes" : "no"}; completionPersistedInSameRequest={debug.cacheDiagnostics.completionPersistedInSameRequest ? "yes" : "no"}; extraCompletionRequestRequired={debug.cacheDiagnostics.extraCompletionRequestRequired ? "yes" : "no"}; invalidComplete={debug.cacheDiagnostics.invalidCompleteStateDetected ? "yes" : "no"}; invalidCompleteReason={debug.cacheDiagnostics.invalidCompleteStateReason || "none"}; completionProof={JSON.stringify(debug.cacheDiagnostics.completionProof)}; requestMode={debug.cacheDiagnostics.requestMode}; explicitContinue={debug.cacheDiagnostics.explicitContinuationRequested ? "yes" : "no"}; buttonAction={debug.cacheDiagnostics.buttonAction || "none"}; sentMode={debug.cacheDiagnostics.sentRequestMode || "none"}; sentExplicit={debug.cacheDiagnostics.sentExplicitContinue ? "yes" : "no"}; inFlight={debug.cacheDiagnostics.continuationRequestInFlight ? "yes" : "no"}; scopeKey={debug.cacheDiagnostics.requestScopeKey || "none"}; progressCounts={debug.cacheDiagnostics.progressProcessedCount ?? "unknown"}/{debug.cacheDiagnostics.progressRemainingCount ?? "unknown"}/{debug.cacheDiagnostics.progressTotalCount ?? "unknown"}; calculatedProgress={debug.cacheDiagnostics.calculatedProgressPercent?.toFixed(1) ?? "unknown"}; displayedProgress={debug.cacheDiagnostics.displayedProgressPercent?.toFixed(1) ?? "unknown"}; progressSource={debug.cacheDiagnostics.progressCalculationSource || "none"}; progressCappedReason={debug.cacheDiagnostics.progressCappedReason || "none"}; stage={debug.cacheDiagnostics.currentProgressStage || "none"}; stageWork={debug.cacheDiagnostics.stageProcessed ?? "unknown"}/{debug.cacheDiagnostics.stageRemaining ?? "unknown"}/{debug.cacheDiagnostics.stageTotal ?? "unknown"}; rawOverall={debug.cacheDiagnostics.rawOverallProgressPercent?.toFixed(1) ?? "unknown"}; highestDisplayed={debug.cacheDiagnostics.highestDisplayedProgressPercent?.toFixed(1) ?? "unknown"}; newlyDiscovered={debug.cacheDiagnostics.newlyDiscoveredWorkThisBatch}; progressHeld={debug.cacheDiagnostics.progressHeldReason || "none"}; requestStartedAt={debug.cacheDiagnostics.requestStartedAt ?? "unknown"}; batchDeadlineAt={debug.cacheDiagnostics.batchDeadlineAt ?? "unknown"}; beforeFirstEvent={debug.cacheDiagnostics.elapsedBeforeFirstEventMs ?? "unknown"}/{debug.cacheDiagnostics.remainingBudgetBeforeFirstEventMs ?? "unknown"}; scanReserveMs={debug.cacheDiagnostics.scanReserveMs ?? "unknown"}; eventBudgetMs={debug.cacheDiagnostics.eventProcessingBudgetMs ?? "unknown"}; firstEventAttempted={debug.cacheDiagnostics.firstEventProcessingAttempted ? "yes" : "no"}; firstFetchStarted={debug.cacheDiagnostics.firstEventFetchStarted ? "yes" : "no"}; firstFetchResult={debug.cacheDiagnostics.firstEventFetchResult || "none"}; earlyReturn={debug.cacheDiagnostics.earlyReturnReason || "none"}; noProgress={debug.cacheDiagnostics.noProgressReason || "none"}; rejectionCounts={JSON.stringify(debug.cacheDiagnostics.restoredEventRejectionCounts || {})}; firstRestored={JSON.stringify((debug.cacheDiagnostics.firstRestoredEventDiagnostics || []).slice(0, 10))}; progressWrite={debug.cacheDiagnostics.progressWriteOk ? "ok" : "not-ok"}; progressError={debug.cacheDiagnostics.progressWriteError || "none"}; misses={debug.cacheDiagnostics.cacheMisses}; stale={debug.cacheDiagnostics.staleCacheRows}; serviceRole={debug.cacheDiagnostics.serviceRoleCacheWriteEnabled ? "yes" : "no"}; elapsedMs={debug.cacheDiagnostics.elapsedMs ?? "n/a"}; stop={debug.cacheDiagnostics.stopReason || "none"}; repeatFaster={debug.cacheDiagnostics.repeatedSearchShouldBeFaster ? "yes" : "no"}; notUsedReason={debug.cacheDiagnostics.cacheNotUsedReason || "none"}; readErrors={(debug.cacheDiagnostics.cacheReadErrors || []).join(" | ") || "none"}; writeErrors={(debug.cacheDiagnostics.cacheWriteErrors || []).join(" | ") || "none"}; writeWarnings={(debug.cacheDiagnostics.cacheWriteWarnings || []).join(" | ") || "none"}</p> : null}
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
      <p className="small muted">Phase: {debug.phaseReached || "unknown"}; scan stopped: {debug.scanStoppedReason || "unknown"}; event stop: {debug.eventStopReason || "unknown"}; quality stop: {debug.candidateQualityStopReason || "unknown"}; target complete candidates: {debug.expectedCandidateTarget}; continuation reason: {debug.continuationReason || "none"}; disabled: {debug.continuationDisabledReason || "none"}; totals complete/visible/hidden: {debug.completeCandidatesFoundTotal}/{debug.visibleCandidatesCountTotal}/{debug.hiddenLowQualityCandidatesCountTotal}; complete total/visible/hidden/importable: {debug.completeCandidatesTotal}/{debug.visibleCompleteCandidates}/{debug.hiddenCompleteCandidates}/{debug.importableCompleteCandidates}; target reached by: {debug.targetReachedBy || "none"}; previous/returned visible: {debug.previousVisibleCandidatesCount}/{debug.returnedVisibleCandidatesCount}; accumulated complete: {debug.accumulatedCompleteCandidatesCount}; batch queued/scanned/fetched/menus: {debug.queuedThisBatch}/{debug.scannedThisBatch}/{debug.fetchedThisBatch}/{debug.eventMenusFetchedThisBatch}; pending queue start/end: {debug.pendingListeIdQueueAtStart}/{debug.pendingListeIdQueueAtEnd}; liste_ids queued/scanned this batch: {debug.listeIdsQueuedThisBatch}/{debug.listeIdsScannedThisBatch}; scan-first: {debug.scanFirstMode ? "yes" : "no"}; time budget: {debug.timeBudgetReason || "none"}; continuation stop: {debug.continuationStopReason || "none"}; batch stop: {debug.batchStopReason || "none"}; event batches: {debug.eventBatchesProcessed}; event queue remaining: {debug.eventQueueRemainingWhenStopped}; candidates per batch: {debug.candidatesFoundPerBatch.join(", ") || "none"}; liste_id scanned per batch: {debug.listeIdPagesScannedPerBatch.join(", ") || "none"}; candidate quality complete/partial/low/percent: {debug.completeCandidatesFound}/{debug.partialCandidatesFound}/{debug.lowQualityCandidatesFound}/{debug.percentageHeavyCandidates}; visible/hidden low-quality: {debug.visibleCandidatesCount}/{debug.hiddenLowQualityCandidatesCount}; complete list: {debug.completeCandidatesFoundList.map((item) => `${item.date || "no date"} ${item.name} ${item.ownScore ?? "?"}/${item.totalTargets ?? "?"}`).join(" | ") || "none"}; continued after low-quality only: {debug.searchContinuedBecauseOnlyLowQualityCandidates ? "yes" : "no"}; candidates after discovery/scan/final: {debug.candidatesFoundAfterDiscovery}/{debug.candidatesFoundAfterScan}/{debug.candidatesFoundBeforeTimeout}; high-priority liste_id pages fetched: {debug.highPriorityListeIdPagesFetched}; low-priority liste_id skipped: {debug.lowPriorityListeIdPagesSkipped}</p>
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
                {item.date || "no date"} — {item.name} — {item.discipline} — {item.shootingGround || "unknown ground"} ({item.shootingGroundSource}) — {item.ownScore ?? "?"}/{item.totalTargets ?? "?"} winner {item.winningScore ?? "?"} — {item.category}/{item.confidence} — {item.importRecommended ? "recommended" : "not checked"} — {item.hiddenFromNormalUi ? `hidden/debug${item.hiddenReason ? ` (${item.hiddenReason})` : ""}` : "visible"} — targets {item.inferredTotalTargets ?? "?"} via {item.totalTargetsSource || "existingParser"}/{item.inferenceConfidence || "n/a"} — {item.url} — {item.reason} — {item.notes.slice(0, 260)}
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
  const [sourceUrl, setSourceUrl] = useState("");
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [disciplines, setDisciplines] = useState<string[]>(DEFAULT_DISCIPLINES);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [debug, setDebug] = useState<LeirdueSearchDebug | null>(null);
  const [manualListChoices, setManualListChoices] = useState<ManualListChoice[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchCounterText, setSearchCounterText] = useState("");
  const [isAutoContinuingLeirdue, setIsAutoContinuingLeirdue] = useState(false);
  const [leirdueBatchNumber, setLeirdueBatchNumber] = useState(0);
  const [leirdueVisibleCandidatesCount, setLeirdueVisibleCandidatesCount] = useState(0);
  const [leirdueTotalListeIdScanned, setLeirdueTotalListeIdScanned] = useState(0);
  const [savedImport, setSavedImport] = useState<SavedImportSummary | null>(null);
  const [manualReviewActive, setManualReviewActive] = useState(false);
  const continuationRequestInFlightRef = useRef(false);

  useEffect(() => {
    async function loadShooterName() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("shooter_profiles")
        .select("shooter_name")
        .eq("user_id", userData.user.id)
        .maybeSingle<{ shooter_name: string | null }>();
      const profileName = data?.shooter_name?.trim();
      if (profileName) setShooterName((current) => current || profileName);
    }
    loadShooterName();
  }, []);

  const groupedCandidates = useMemo(() => candidateReviewCounts(candidates), [candidates]);
  const reviewableCount = groupedCandidates.reviewableCount;
  const hiddenFromNormalListCount = groupedCandidates.ignored.length;
  const hiddenControlCount = useMemo(() => candidates.filter((candidate) => candidate.category === "control").length, [candidates]);
  const manualReviewCandidates = useMemo(() => sortCandidatesForReview(candidates.filter((candidate) => isManualLinkCandidate(candidate) && visibleImportCandidate(candidate) && candidate.duplicateStatus !== "exact" && !candidate.alreadyImported)), [candidates]);
  const manualAlreadyImportedCandidates = useMemo(() => sortCandidatesForReview(candidates.filter((candidate) => isManualLinkCandidate(candidate) && (candidate.duplicateStatus === "exact" || candidate.alreadyImported))), [candidates]);
  const manualBestCandidate = manualReviewCandidates.find((candidate) => candidate.shooterMatchStatus === "matched_to_you") || manualReviewCandidates.find((candidate) => candidate.shooterMatchStatus === "possible_match") || manualReviewCandidates[0] || null;
  const manualOtherCandidates = manualBestCandidate ? manualReviewCandidates.filter((candidate) => candidate.localId !== manualBestCandidate.localId) : manualReviewCandidates;

  const selectedCount = candidates.filter((candidate) => candidate.selected && visibleImportCandidate(candidate) && canSelectCandidate(candidate) && (candidate.duplicateStatus !== "possible" || candidate.allowDuplicateSave)).length;

  function toggleDiscipline(discipline: string) {
    setDisciplines((current) => (current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline]));
  }

  function applyShooterMatching(candidateList: EditableCandidate[]) {
    return candidateList.map((candidate) => {
      if (!candidate.shooterName || !shooterName) return candidate;
      const manualMatch = /Manual link import parsed row/i.test(candidate.notes || "") ? manualLinkNameMatchStatus(candidate.shooterName, shooterName) : null;
      if (manualMatch) return { ...candidate, shooterMatchStatus: manualMatch.status, shooterMatchReason: manualMatch.reason };
      const matchReason = leirdueNameMatchReason(candidate.shooterName, shooterName);
      if (namesLikelyMatch(candidate.shooterName, shooterName)) return { ...candidate, shooterMatchStatus: "matched_to_you" as const, shooterMatchReason: matchReason };
      if (profileNameContainedInShooterText(candidate.shooterName, shooterName)) return { ...candidate, shooterMatchStatus: "matched_to_you" as const, shooterMatchReason: "partial/initial match" as const };
      const parsedParts = candidate.shooterName.split(/\s+/).filter(Boolean);
      const searchedParts = shooterName.split(/\s+/).filter(Boolean);
      const possible = parsedParts.length >= 2 && searchedParts.length >= 2 && namesLikelyMatch(parsedParts.at(-1), searchedParts.at(-1));
      return { ...candidate, shooterMatchStatus: possible || matchReason === "fuzzy/possible match" ? "possible_match" as const : "unmatched" as const, shooterMatchReason: possible ? "partial/initial match" as const : matchReason };
    });
  }

  async function checkDuplicatesFor(candidateList: EditableCandidate[]) {
    const visible = candidateList.filter(visibleImportCandidate);
    if (visible.length === 0) return candidateList;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return candidateList;

    setCheckingDuplicates(true);
    try {
      const response = await fetch("/api/leirdue/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidates: visible }),
      });
      const data = (await response.json()) as DuplicateResponse;
      if (!response.ok || !data.results) return candidateList;
      return candidateList.map((candidate) => {
        const result = data.results?.find((item) => item.candidate.leirdueUrl === candidate.leirdueUrl && item.candidate.date === candidate.date && item.candidate.name === candidate.name);
        if (!result) return candidate;
        const exact = result.status === "exact";
        return {
          ...candidate,
          duplicateStatus: result.status,
          duplicateMatches: result.matches,
          alreadyImported: exact || candidate.alreadyImported,
          selected: result.status === "new" ? candidate.selected : false,
          warnings: result.status === "new" ? candidate.warnings : Array.from(new Set([...(candidate.warnings || []), result.status === "exact" ? "Already imported." : "Possible duplicate."])),
        };
      });
    } finally {
      setCheckingDuplicates(false);
    }
  }

  async function setReviewedCandidates(candidateList: EditableCandidate[]) {
    const matched = applyShooterMatching(candidateList);
    const withDuplicates = await checkDuplicatesFor(matched);
    const reviewed = sortCandidatesForReview(withDuplicates);
    setCandidates(reviewed);
    return reviewed;
  }

  async function parseDirectUrl() {
    setError("");
    setSuccess("");
    setManualListChoices([]);
    if (!sourceUrl.trim()) {
      setError("Paste a Leirdue.net result URL first.");
      return;
    }
    if (!shooterName.trim()) {
      setError("Enter the shooter name to find in the Leirdue result list.");
      return;
    }
    setSearching(true);
    try {
      const response = await fetch("/api/leirdue/debug-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl.trim(), shooterName: shooterName.trim(), year: Number(year), selectedDisciplines: disciplines }),
      });
      const data = (await response.json()) as DirectParseResponse;
      if (!response.ok || !data.candidate) {
        setError("Could not import this Leirdue.net result. Try pasting a direct result list URL or save the result manually.");
        setDebug(null);
        return;
      }
      const candidate = toEditable({
        ...data.candidate,
        warnings: Array.from(new Set([...(data.candidate.warnings || []), ...data.parserNotes.filter((note) => /Could not|uncertain|review|Unsupported/i.test(note))])),
      }, candidates.length);
      await setReviewedCandidates(mergeCandidates(candidates, [candidate]));
      setSuccess("Parsed one Leirdue result. Review the fields and duplicate status before saving.");
    } catch {
      setError("Could not import this Leirdue.net result. Try pasting a direct result list URL or save the result manually.");
    } finally {
      setSearching(false);
    }
  }

  async function fetchManualLink() {
    setError("");
    setSuccess("");
    setSavedImport(null);
    setManualListChoices([]);
    setManualReviewActive(false);
    if (!sourceUrl.trim()) {
      setError("Please paste a valid Leirdue.net result or event link.");
      return;
    }
    setSearching(true);
    setSearchStatus("Looking for results on the pasted Leirdue.net link...");
    setSearchProgress(20);
    try {
      const response = await fetch("/api/leirdue/parse-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl.trim(), year: Number(year), selectedDisciplines: disciplines }),
      });
      const data = (await response.json()) as LinkParseResponse;
      if (!response.ok || !data.ok) {
        setError(data.error || "We could not find a clear result from this link. Check that the link points to a Leirdue.net result page, or try another result list from the same event.");
        return;
      }
      if (data.listChoices.length > 0 && data.candidates.length === 0) {
        setSuccess(`This event has ${data.listChoices.length} result list${data.listChoices.length === 1 ? "" : "s"}. Open one and paste that result-list URL.`);
        setManualListChoices(data.listChoices);
        setCandidates([]);
        setDebug(null);
        return;
      }
      const parsedCandidates = data.candidates.map((candidate, index) => ({
        ...toEditable(candidate, candidates.length + index),
        selected: shooterName.trim() ? candidateSelectedByDefault(candidate) : false,
        shooterMatchStatus: shooterName.trim() ? candidate.shooterMatchStatus : null,
        warnings: Array.from(new Set([...(candidate.warnings || []), "Manual link import: select the correct shooter row before saving."])),
      }));
      await setReviewedCandidates(mergeCandidates(candidates, parsedCandidates));
      setManualReviewActive(true);
      setSuccess(`Found ${data.candidates.length} result row${data.candidates.length === 1 ? "" : "s"}. Select your result below.`);
    } catch {
      setError("We could not find a clear result from this link. Check that the link points to a Leirdue.net result page, or try another result list from the same event.");
    } finally {
      setSearching(false);
      setSearchStatus("");
      setSearchProgress(100);
    }
  }

  function updateCandidate(updated: EditableCandidate) {
    setCandidates((current) => current.map((candidate) => (candidate.localId === updated.localId ? updated : candidate)));
  }

  async function fetchSearchBatch(token: string | null, mode: "initial" | "continue" | "revalidateInvalidComplete", explicitContinue: boolean) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    try {
      const response = await fetch("/api/leirdue/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ shooterName, year: Number(year), disciplines, continuationToken: token, sourceUrl: sourceUrl.trim() || null, requestMode: mode, explicitContinue, buttonAction: explicitContinue ? "continue" : "search" }),
        signal: controller.signal,
      });
      const data = (await response.json()) as SearchResponse;
      return { response, data };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function runAutoSearch(startToken: string | null, reset: boolean) {
    if (searching || continuationRequestInFlightRef.current) return;
    continuationRequestInFlightRef.current = true;

    setError("");
    setSuccess("");
    setSearching(true);
    setSearchProgress(reset ? 5 : Math.max(searchProgress, 15));
    setSearchStatus(reset ? "Loading cached results and checking continuation state..." : "Continuing with one short batch...");
    setSearchCounterText("");
    setIsAutoContinuingLeirdue(Boolean(startToken));
    if (reset) {
      setLeirdueBatchNumber(0);
      setLeirdueVisibleCandidatesCount(0);
      setLeirdueTotalListeIdScanned(0);
      setCandidates([]);
      setDebug(null);
      setContinuationToken(null);
      setManualReviewActive(false);
    }

    let currentCandidates = reset ? [] : candidates;

    try {
      const mode = reset ? "initial" : "continue";
      const explicitContinue = !reset;
      const { response, data } = await fetchSearchBatch(startToken, mode, explicitContinue);
      const responseDebug = data.debug || null;
      if (responseDebug?.cacheDiagnostics) {
        responseDebug.cacheDiagnostics.frontendContinuationMode = "manual-single-batch";
        responseDebug.cacheDiagnostics.sentRequestMode = mode;
        responseDebug.cacheDiagnostics.sentExplicitContinue = explicitContinue;
        responseDebug.cacheDiagnostics.buttonAction = explicitContinue ? "continue" : "search";
        responseDebug.cacheDiagnostics.continuationRequestInFlight = continuationRequestInFlightRef.current;
      }
      setDebug(responseDebug);

      if (!response.ok) {
        setError(data.error || "Could not fetch Leirdue results right now.");
        setContinuationToken(startToken);
        return;
      }

      currentCandidates = mergeCandidates(currentCandidates, data.candidates || []);
      const reviewedCandidates = await setReviewedCandidates(currentCandidates);
      const reviewedCounts = candidateReviewCounts(reviewedCandidates);

      const nextToken = data.continuationToken || null;
      const likelyWorkRemains = hasLikelySelectedYearWork(data.debug);
      const apiAllowsContinuation = data.debug?.continuationAvailable !== false;
      const shouldContinue = Boolean(nextToken && apiAllowsContinuation && likelyWorkRemains);
      setContinuationToken(shouldContinue ? nextToken : null);
      const nextProgress = estimatedSearchProgress(data.debug);
      const completeProgress = Boolean(data.debug?.cacheDiagnostics?.completionProof?.valid && data.debug.cacheDiagnostics.cacheScopeComplete);
      const previousProgress = searchProgress;
      const displayedProgress = nextProgress === null ? Math.max(previousProgress, 15) : completeProgress ? nextProgress : Math.min(Math.max(previousProgress, nextProgress), 99);
      if (data.debug?.cacheDiagnostics) {
        data.debug.cacheDiagnostics.highestDisplayedProgressPercent = displayedProgress;
        data.debug.cacheDiagnostics.displayedProgressPercent = displayedProgress;
        data.debug.cacheDiagnostics.progressHeldReason = nextProgress !== null && displayedProgress > nextProgress ? "newlyDiscoveredWorkIncreasedDenominator" : null;
      }
      setSearchProgress(displayedProgress);
      setLeirdueBatchNumber(data.debug?.batchNumber || 1);
      setLeirdueVisibleCandidatesCount(reviewedCounts.reviewableCount);
      setLeirdueTotalListeIdScanned(data.debug?.scannedListeIdTotal || 0);
      setSearchCounterText(`${data.debug?.cacheDiagnostics?.completionProof?.valid && data.debug.cacheDiagnostics.cacheScopeComplete ? "Search complete." : "Checking event result lists…"} Found ${reviewedCounts.reviewableCount} reviewable result${reviewedCounts.reviewableCount === 1 ? "" : "s"}.${(data.debug?.cacheDiagnostics?.newlyDiscoveredWorkThisBatch || 0) > 0 ? ` ${data.debug?.cacheDiagnostics?.newlyDiscoveredWorkThisBatch} more result lists were discovered.` : ""}`);

      const provenComplete = Boolean(data.debug?.cacheDiagnostics?.completionProof?.valid && data.debug.cacheDiagnostics.cacheScopeComplete);
      if (shouldContinue) {
        setSearchStatus("More Leirdue.net work remains. Use Continue search to run another short batch.");
        setSuccess(`${reviewedCounts.reviewableCount} cached or found reviewable result${reviewedCounts.reviewableCount === 1 ? "" : "s"} loaded. More results may still be available.`);
      } else if (provenComplete) {
        setSearchStatus("Search complete");
        setSuccess(reviewedCounts.reviewableCount === 0 && reset ? "No candidates found. Try broader filters or add a result manually." : `Search complete. Found ${reviewedCounts.reviewableCount} reviewable result${reviewedCounts.reviewableCount === 1 ? "" : "s"}. Please review the list before saving.`);
      } else {
        setSearchStatus("Search paused");
        setSuccess(reviewedCounts.reviewableCount === 0 && reset ? "No candidates found yet. Try broader filters or add a result manually." : `Found ${reviewedCounts.reviewableCount} reviewable result${reviewedCounts.reviewableCount === 1 ? "" : "s"}. More results may still be available.`);
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        const visibleCount = visibleCandidateCount(currentCandidates);
        if (visibleCount > 0) setSuccess(autoSearchIncompleteMessage(visibleCount, "request timeout"));
        else setError("The Leirdue search took too long before finding candidates. Try again or choose a narrower year.");
      } else {
        setError("Could not fetch Leirdue results right now.");
      }
    } finally {
      continuationRequestInFlightRef.current = false;
      setSearching(false);
      setIsAutoContinuingLeirdue(false);
      setSearchProgress((progress) => progress);
    }
  }

  async function continueSearch(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!continuationToken) return;
    await runAutoSearch(continuationToken, false);
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAutoSearch(null, true);
  }

  async function saveSelected() {
    setError("");
    setSuccess("");
    setSavedImport(null);
    const selected = candidates.filter((candidate) => candidate.selected && visibleImportCandidate(candidate) && canSelectCandidate(candidate) && (candidate.duplicateStatus !== "possible" || candidate.allowDuplicateSave));
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
          duplicateStatus: result.candidate.duplicateStatus || candidate.duplicateStatus,
          duplicateMatches: result.duplicateMatches || result.candidate.duplicateMatches || candidate.duplicateMatches,
          saveMessage: result.message || (result.status === "saved" ? "Saved as a result-only session." : result.status === "duplicate" ? "Duplicate skipped" : "Could not save this candidate."),
        };
      }),
    );

    const saved = data.results.filter((result) => result.status === "saved").length;
    const duplicates = data.results.filter((result) => result.status === "duplicate").length;
    const firstSaved = data.results.find((result) => result.status === "saved");
    if (firstSaved) {
      setSavedImport({
        id: firstSaved.id,
        eventName: firstSaved.candidate.name,
        date: firstSaved.candidate.date,
        score: `${firstSaved.candidate.ownScore ?? "?"}/${firstSaved.candidate.totalTargets ?? firstSaved.candidate.maxScore ?? "?"}`,
      });
      setSuccess("Result imported.");
    } else {
      setSuccess(`${saved} result${saved === 1 ? "" : "s"} imported. ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped.`);
    }
  }

  return (
    <main>
      <form className="card" onSubmit={search}>
        <p className="eyebrow">Leirdue.net import</p>
        <h2>Import from Leirdue.net</h2>
        <p>Find old competition results and review before saving.</p>
        <div className="notice small">
          Leirdue import is currently in beta. It can save time by finding many results automatically, but it may not find every result yet. Please review the imported results before saving, and add any missing results manually.
        </div>
        <div className="notice small">
          This v1 imports result-only sessions after your review. It does not import misses, target-by-target miss data, scorecard photos, finals or control lists automatically.
        </div>

        <section className="manualImportMethodCard">
          <h3>Search Leirdue.net</h3>
          <p className="small muted">Find results by shooter name, year and discipline. You do not need a link for this search.</p>
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
          <div className="btns">
            <button disabled={searching || disciplines.length === 0}>{searching ? "Searching..." : "Search Leirdue.net"}</button>
            {/* TODO: Replace this temporary testing control with bounded, non-blocking background continuation that keeps cached results visible and merges new results automatically. */}
            {continuationToken ? <button type="button" className="secondary" disabled={searching || continuationRequestInFlightRef.current} onClick={continueSearch}>{searching ? "Continuing..." : "Continue search"}</button> : null}
          </div>
        </section>

        <section className="manualImportMethodCard manualLinkImportPanel">
          <h3>Import from Leirdue.net link</h3>
          <p className="small muted">Already have a specific Leirdue.net result link? Paste it here to import from that event/list.</p>
          <label>Leirdue.net URL</label>
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.leirdue.net/?stevne=..." />
          <div className="btns">
            <button type="button" className="secondary" disabled={searching || !sourceUrl.trim()} onClick={fetchManualLink}>{searching ? "Finding..." : "Find result from link"}</button>
            {sourceUrl.trim() && shooterName.trim() ? <button type="button" className="secondary" disabled={searching} onClick={parseDirectUrl}>Parse for shooter name</button> : null}
          </div>
        </section>

        {error ? <div className="error">{error}</div> : null}
        {savedImport ? (
          <div className="success importSuccessCard">
            <strong>Result imported</strong>
            <p>{savedImport.eventName} · {formatDate(savedImport.date)} · {savedImport.score}</p>
            <div className="btns compactDetailActions">
              {savedImport.id ? <Link className="button smallButton" href={`/sessions/${savedImport.id}`}>Open result</Link> : null}
              <Link className="button secondary smallButton" href="/results">Back to results</Link>
              <button type="button" className="secondary smallButton" onClick={() => { setSourceUrl(""); setCandidates([]); setSavedImport(null); setSuccess(""); }}>Import another Leirdue link</button>
            </div>
          </div>
        ) : success ? <div className="success">{success} {success.includes("saved") ? <Link href="/stats">Open Stats</Link> : null}</div> : null}
        {searching || searchStatus ? (
          <div className="searchProgressPanel" aria-live="polite">
            {searching ? <p className="small">This request runs one short batch. Cached results stay visible while it finishes.</p> : null}
            <div className="progressHeader">
              <span>Estimated search progress</span>
              <strong>{debug?.cacheDiagnostics?.displayedProgressPercent === null ? "Checking remaining results..." : `${Math.round(searchProgress)}%`}</strong>
            </div>
            <progress value={searchProgress} max={100} />
            {searchStatus ? <p className="small muted">{searchStatus}</p> : null}
            <p className="small muted">{searchCounterMessage(leirdueTotalListeIdScanned || debug?.scannedListeIdTotal || 0, leirdueVisibleCandidatesCount || reviewableCount, isAutoContinuingLeirdue)}</p>
            {searchCounterText ? <p className="small muted">{searchCounterText}</p> : null}
          </div>
        ) : null}

        {manualListChoices.length > 0 ? (
          <div className="notice small manualListChoices">
            <strong>Result lists found</strong>
            <p>Choose a result list, then fetch again.</p>
            <div className="btns compactDetailActions">
              {manualListChoices.map((choice) => (
                <button key={choice.url} type="button" className="secondary smallButton" onClick={() => setSourceUrl(choice.url)}>
                  {choice.label || `Result list ${choice.listeId || ""}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="btns">
          <Link className="button secondary" href="/results">Results history</Link>
          <Link className="button secondary" href="/results/new">Add result manually</Link>
          <Link className="button secondary" href="/dashboard">Dashboard</Link>
        </div>
      </form>

      <CoverageDiagnostics debug={debug} groupedCounts={{ confirmed: groupedCandidates.confirmed.length, possible: groupedCandidates.possible.length, alreadyImported: groupedCandidates.alreadyImported.length, ignored: groupedCandidates.ignored.length }} />
      <DebugDetails debug={debug} candidatesFound={candidates.length} />

      {manualReviewActive ? <ManualImportSummaryCard candidates={[...groupedCandidates.confirmed, ...groupedCandidates.possible]} year={year} /> : null}

      {candidates.length > 0 ? (
        <div className="card importSummaryCard">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Leirdue.net import — {year}</p>
              <h2>Review candidates</h2>
              <p className="small muted">Season results are sorted earliest to latest. Technical metadata stays collapsed under Show details.</p>
            </div>
            <span className="countPill">{checkingDuplicates ? "Checking duplicates… · " : ""}{selectedCount} selected</span>
          </div>
          <div className="compactSummaryGrid" aria-label="Import summary">
            <span><strong>{groupedCandidates.confirmedCount}</strong> Confirmed</span>
            <span><strong>{groupedCandidates.possibleCount}</strong> Possible</span>
            <span><strong>{groupedCandidates.alreadyImportedCount}</strong> Already imported</span>
            <span><strong>{groupedCandidates.ignoredFailedCount}</strong> Ignored/failed</span>
          </div>
          {debug ? <p className="small muted">Candidate count diagnostics: statusResultCount={reviewableCount}; confirmedCount={groupedCandidates.confirmedCount}; possibleCount={groupedCandidates.possibleCount}; alreadyImportedCount={groupedCandidates.alreadyImportedCount}; ignoredFailedCount={groupedCandidates.ignoredFailedCount}; reviewableCount={groupedCandidates.reviewableCount}; hiddenControlCount={hiddenControlCount}; duplicateFilteredCount={groupedCandidates.alreadyImportedCount}; excludedCandidateCount={hiddenFromNormalListCount}; excludedCandidateReasons={groupedCandidates.ignored.slice(0, 5).map(candidateReason).join(" | ") || "none"}; candidateIdsIncludedInStatus={[...groupedCandidates.confirmed, ...groupedCandidates.possible].map((candidate) => candidate.localId).slice(0, 10).join(", ") || "none"}; candidateIdsIncludedInReview={[...groupedCandidates.confirmed, ...groupedCandidates.possible].map((candidate) => candidate.localId).slice(0, 10).join(", ") || "none"}</p> : null}
          <div className="btns">
            <button onClick={saveSelected} disabled={saving || checkingDuplicates || selectedCount === 0}>{saving ? "Importing..." : manualReviewActive && selectedCount === 1 ? "Import this result" : selectedCount === 1 ? "Import selected result" : "Import selected results"}</button>
            <Link href="/stats" className="button secondary">Stats</Link>
          </div>
        </div>
      ) : null}

      {reviewableCount === 0 && !manualReviewActive && !searching && (error || success) ? (
        <div className="card">
          <h3>No importable results found</h3>
          <p>We did not find confirmed or possible matches for {year}. Try a direct Leirdue result list URL, check the shooter-name spelling, broaden the discipline filters, or add the result manually.</p>
          <div className="btns">
            <Link className="button secondary" href="/results/new">Add result manually</Link>
          </div>
        </div>
      ) : null}

      {manualReviewActive && manualBestCandidate ? (
        <section className="sessionGroup">
          <div className="groupHeader">
            <div>
              <h3>{manualBestCandidate.shooterMatchStatus === "matched_to_you" ? "Likely match" : "Best result from this link"}</h3>
              <p className="small muted">Review this row, then choose Import this result when it is correct.</p>
            </div>
            <span className="countPill">1 result</span>
          </div>
          <CandidateCard candidate={manualBestCandidate} shooterName={shooterName} onChange={updateCandidate} />
        </section>
      ) : null}

      {manualReviewActive && manualOtherCandidates.length > 0 ? (
        <details className="sessionGroup ignoredCandidatesGroup">
          <summary className="groupHeader">
            <div>
              <h3>Other results from this list</h3>
              <p className="small muted">Open if the highlighted row is not your result.</p>
            </div>
            <span className="countPill">{manualOtherCandidates.length}</span>
          </summary>
          {manualOtherCandidates.map((candidate) => (
            <CandidateCard key={candidate.localId} candidate={candidate} shooterName={shooterName} onChange={updateCandidate} />
          ))}
        </details>
      ) : null}

      {manualReviewActive && manualAlreadyImportedCandidates.length > 0 ? (
        <details className="sessionGroup ignoredCandidatesGroup">
          <summary className="groupHeader">
            <div>
              <h3>Already imported results from this list</h3>
              <p className="small muted">These rows appear to already exist in your results and are not included in the import action.</p>
            </div>
            <span className="countPill">{manualAlreadyImportedCandidates.length}</span>
          </summary>
          {manualAlreadyImportedCandidates.map((candidate) => (
            <CandidateCard key={candidate.localId} candidate={candidate} shooterName={shooterName} onChange={updateCandidate} />
          ))}
        </details>
      ) : null}

      {!manualReviewActive && ([
        { key: "confirmed", title: "Confirmed matches", description: "High-quality matches that are safe to scan and are checked by default." },
        { key: "possible", title: "Possible matches", description: "Medium/low confidence matches for review. Import only if this is your result." },
        { key: "alreadyImported", title: "Already imported", description: "Existing or exact duplicate results remain visible but are not normal import actions." },
      ] as const).map((section) => (
        groupedCandidates[section.key].length > 0 ? (
          <section key={section.key} className="sessionGroup">
            <div className="groupHeader">
              <div>
                <h3>{section.title}</h3>
                <p className="small muted">{section.description}</p>
              </div>
              <span className="countPill">{groupedCandidates[section.key].length}</span>
            </div>
            {groupedCandidates[section.key].map((candidate) => (
              <CandidateCard key={candidate.localId} candidate={candidate} shooterName={shooterName} onChange={updateCandidate} />
            ))}
          </section>
        ) : null
      ))}

      {!manualReviewActive && groupedCandidates.ignored.length > 0 ? (
        <details className="sessionGroup ignoredCandidatesGroup">
          <summary className="groupHeader">
            <div>
              <h3>Ignored / failed candidates</h3>
              <p className="small muted">Lists that were checked but not recommended. Open only when you want to inspect low-confidence or unsupported rows.</p>
            </div>
            <span className="countPill">{hiddenFromNormalListCount}</span>
          </summary>
          {groupedCandidates.ignored.map((candidate) => (
            <CandidateCard key={candidate.localId} candidate={candidate} shooterName={shooterName} onChange={updateCandidate} />
          ))}
        </details>
      ) : null}
    </main>
  );
}
