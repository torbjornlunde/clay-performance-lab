import { COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI } from "@/lib/disciplines";
import { extractLeirdueSourceIdentifiers, normalizeLeirdueDisciplineLabel, normalizeLeirdueName, nordicSafeNameKey } from "@/lib/leirdue/normalize";
import type { LeirdueCandidate, LeirdueCategory, LeirdueConfidence, LeirdueDebugParseInput, LeirdueDebugParseResult, LeirdueCheckedListDebug, LeirdueManualLinkParseResult, LeirdueSearchDebug, LeirdueSearchResult, LeirdueValidationChecklistItem } from "@/lib/leirdue/types";

const LEIRDUE_BASE_URL = "https://www.leirdue.net/";
const FETCH_ERROR_MESSAGE = "Could not fetch Leirdue results right now.";
const RESULT_LINK_TERMS = ["sammenlagt", "sammenlagt etter bane", "resultatliste sammenlagt", "resultater sammenlagt", "resultater", "resultatliste", "klassedelt"];
const CONTROL_TERMS = ["cup sammenlagt", "uttaksliste", "uttaksstevner", "prosent", "prosentliste", "ranking", "rank", "påmelding", "pamelding", "deltakerliste", "deltagarliste", "deltaker", "participant", " lag ", " lag/", "team list", "finale", "final", "shoot-off", "shootoff"];
const MONTHS: Record<string, string> = {
  januar: "01",
  februar: "02",
  mars: "03",
  april: "04",
  mai: "05",
  juni: "06",
  juli: "07",
  august: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
};

export type LeirdueSearchInput = {
  shooterName: string;
  year: number;
  disciplines: string[];
  continuationToken?: string | null;
  sourceUrl?: string | null;
};

type LeirdueContinuationState = {
  v: 1;
  selectedYear: number;
  normalizedShooterName: string;
  disciplines: string[];
  scannedEventIds: string[];
  scannedListeIdKeys: string[];
  batchNumber: number;
  completeCandidatesFoundTotal: number;
  visibleCandidatesCountTotal: number;
  hiddenLowQualityCandidatesCountTotal: number;
  candidates: LeirdueCandidate[];
  pendingListeIdQueue: Link[];
};

type Link = { href: string; text: string; source?: "anchor" | "raw" | "validation" };
type EventTitleParseSource = "anchorText" | "rowSnippet" | "fallback";
type EventLinkMeta = { eventId: string; url: string; titleText: string; eventTitle: string; organizerText: string | null; dateText: string | null; rawRowSnippet: string; titleParseSource: EventTitleParseSource; date: string | null; parsedYear: number | null; overviewMatchedYear: boolean; actualEventYear: number | null; actualEventDate: string | null; actualDateText: string | null; inspected: boolean; skippedReason: string | null };
type Page = { url: string; html: string; label: string; kind: "overview" | "event" | "list" };
type ListeIdQueueItem = { key: string; href: string; text: string; eventId: string | null; listeId: string | null; eventTitle: string; eventDate: string | null; priority: number; reason: string; source?: Link["source"] };
type ParsedScore = { ownScore: number | null; winningScore: number | null; scoreLine: string | null; notes: string[]; parsedNumbers: number[]; seriesScores: number[] };
type TotalTargetsInference = { totalTargets: number; source: "titleTargetCount" | "seriesPattern"; confidence: "high" | "medium" | "low" };
type ParsedRow = { text: string; cells: string[]; numbers: number[]; total: number | null; seriesScores: number[] };
type RawCandidate = Omit<LeirdueCandidate, "category" | "confidence" | "importRecommended" | "notes"> & {
  sourceText: string;
  listTitle: string;
  notes: string[];
  validationSource: boolean;
  shootingGroundSource: "organizer field" | "event text" | "known-club match" | "inferred" | "unknown";
};


type CrawlState = { deadlineAt: number };

const SEARCH_TIMEOUT_MS = 25_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_EVENT_PAGES_INSPECTED = 160;
const MAX_RESULT_MENU_PAGES_FETCHED = 180;
const MAX_LISTE_ID_PAGES_SCANNED = 300;
const MAX_SHOOTER_PAGES_PARSED = 50;
const TARGET_COMPLETE_CANDIDATES = 16;
const RESULT_MENU_BATCH_SIZE = 10;
const MAX_CONTINUATION_EVENT_MENUS_BEFORE_SCAN = 5;
const MAX_CONTINUATION_LISTE_IDS_TO_SCAN_PER_BATCH = 50;
const MAX_RESULT_MENUS_BEFORE_FIRST_SCAN = 40;
const RESULT_MENU_PHASE_BUDGET_MS = Math.floor(SEARCH_TIMEOUT_MS * 0.4);
const MIN_LIST_SCAN_RESERVE_MS = Math.floor(SEARCH_TIMEOUT_MS * 0.5);
const TIME_LIMIT_MESSAGE = "Leirdue search reached time limit. Showing partial results.";

function markTimedOut(debug: LeirdueSearchDebug) {
  debug.timedOut = true;
  debug.message ||= TIME_LIMIT_MESSAGE;
}

function markLimitReached(debug: LeirdueSearchDebug, whichLimit: string) {
  debug.limitReached = true;
  debug.whichLimit ||= whichLimit;
  debug.message ||= `Leirdue search reached ${whichLimit}. Showing partial results.`;
}

function shouldStopCrawl(debug: LeirdueSearchDebug, state: CrawlState) {
  if (Date.now() >= state.deadlineAt) {
    markTimedOut(debug);
    return true;
  }
  return false;
}

function remainingCrawlMs(state: CrawlState) {
  return Math.max(0, state.deadlineAt - Date.now());
}

function normalizeDisciplinesForToken(disciplines: string[]) {
  return disciplines.map((discipline) => normalizeText(discipline)).sort();
}

function continuationTokenPayload(input: LeirdueSearchInput, token: string | null | undefined): LeirdueContinuationState | null {
  if (!token) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Partial<LeirdueContinuationState>;
    if (parsed.v !== 1 || parsed.selectedYear !== input.year || parsed.normalizedShooterName !== normalizeName(input.shooterName)) return null;
    const tokenDisciplines = Array.isArray(parsed.disciplines) ? parsed.disciplines : [];
    if (normalizeDisciplinesForToken(tokenDisciplines).join("|") !== normalizeDisciplinesForToken(input.disciplines).join("|")) return null;
    return {
      v: 1,
      selectedYear: parsed.selectedYear,
      normalizedShooterName: parsed.normalizedShooterName,
      disciplines: tokenDisciplines,
      scannedEventIds: Array.isArray(parsed.scannedEventIds) ? parsed.scannedEventIds.filter((id): id is string => typeof id === "string") : [],
      scannedListeIdKeys: Array.isArray(parsed.scannedListeIdKeys) ? parsed.scannedListeIdKeys.filter((key): key is string => typeof key === "string") : [],
      batchNumber: Number.isInteger(parsed.batchNumber) ? Math.max(1, Number(parsed.batchNumber)) : 1,
      completeCandidatesFoundTotal: Number.isInteger(parsed.completeCandidatesFoundTotal) ? Math.max(0, Number(parsed.completeCandidatesFoundTotal)) : 0,
      visibleCandidatesCountTotal: Number.isInteger(parsed.visibleCandidatesCountTotal) ? Math.max(0, Number(parsed.visibleCandidatesCountTotal)) : 0,
      hiddenLowQualityCandidatesCountTotal: Number.isInteger(parsed.hiddenLowQualityCandidatesCountTotal) ? Math.max(0, Number(parsed.hiddenLowQualityCandidatesCountTotal)) : 0,
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates.filter(isLeirdueCandidate) : [],
      pendingListeIdQueue: Array.isArray(parsed.pendingListeIdQueue) ? parsed.pendingListeIdQueue.filter(isContinuationLink) : [],
    };
  } catch {
    return null;
  }
}

function encodeContinuationToken(state: LeirdueContinuationState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function isLeirdueCandidate(value: unknown): value is LeirdueCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LeirdueCandidate>;
  return typeof candidate.name === "string" && typeof candidate.leirdueUrl === "string" && typeof candidate.discipline === "string";
}

function isContinuationLink(value: unknown): value is Link {
  if (!value || typeof value !== "object") return false;
  const link = value as Partial<Link>;
  return typeof link.href === "string" && typeof link.text === "string";
}

function markFetchError(debug: LeirdueSearchDebug, url: string, note: string) {
  debug.errorMessage = note;
  debug.rejectedReasons.push(`${url}: ${note}`);
}

function emptyDebug(): LeirdueSearchDebug {
  return {
    fetchedUrls: [],
    selectedYear: null,
    normalizedSearchName: "",
    eventOverviewUrls: [],
    guessedYearOverviewUrlsTried: [],
    discoveredYearLinks: [],
    selectedYearLinksFound: [],
    selectedYearOverviewUrlUsed: null,
    overviewYearMismatch: false,
    overviewDiagnostics: [],
    noSelectedYearEventsReason: null,
    selectedYearEventLinks: [],
    eventTitleDebugRows: [],
    selectedYearEventLinksCount: 0,
    selectedYearEventIdsCount: 0,
    actualSelectedYearEventsCount: 0,
    unknownYearFallbackEventsCount: 0,
    actualYearMismatchSkippedCount: 0,
    knownTorbjorn2025Debug: [],
    regressionPriorityApplied: false,
    regressionEventsBoosted: [],
    eventBatchesProcessed: 0,
    eventQueueRemainingWhenStopped: 0,
    eventStopReason: null,
    candidatesFoundPerBatch: [],
    listeIdPagesScannedPerBatch: [],
    completeCandidatesFound: 0,
    completeCandidatesTotal: 0,
    visibleCompleteCandidates: 0,
    hiddenCompleteCandidates: 0,
    importableCompleteCandidates: 0,
    targetReachedBy: null,
    partialCandidatesFound: 0,
    lowQualityCandidatesFound: 0,
    searchContinuedBecauseOnlyLowQualityCandidates: false,
    percentageHeavyCandidates: 0,
    expectedCandidateTarget: TARGET_COMPLETE_CANDIDATES,
    visibleCandidatesCount: 0,
    hiddenLowQualityCandidatesCount: 0,
    completeCandidatesFoundList: [],
    nextUnscannedEventQueue: [],
    continuationAvailable: false,
    continuationReason: null,
    scannedListeIdTotal: 0,
    scannedEventTotal: 0,
    remainingEventQueueCount: 0,
    confirmedSelectedYearEventsRemaining: 0,
    likelySelectedYearEventsRemaining: 0,
    unknownYearSelectedTextEventsRemaining: 0,
    unknownYearEventsRemaining: 0,
    outsideYearFallbackEventsRemaining: 0,
    pendingListeIdQueueRemaining: 0,
    oldYearEventsSkippedThisBatch: 0,
    likelySelectedYearEventsProcessedThisBatch: 0,
    autoStoppedBecauseOnlyOldFallbackRemains: false,
    continuationDisabledReason: null,
    batchNumber: 1,
    completeCandidatesFoundTotal: 0,
    visibleCandidatesCountTotal: 0,
    hiddenLowQualityCandidatesCountTotal: 0,
    previousVisibleCandidatesCount: 0,
    returnedVisibleCandidatesCount: 0,
    accumulatedCompleteCandidatesCount: 0,
    queuedThisBatch: 0,
    scannedThisBatch: 0,
    fetchedThisBatch: 0,
    eventMenusFetchedThisBatch: 0,
    timeBudgetReason: null,
    continuationStopReason: null,
    pendingListeIdQueueAtStart: 0,
    pendingListeIdQueueAtEnd: 0,
    listeIdsQueuedThisBatch: 0,
    listeIdsScannedThisBatch: 0,
    scanFirstMode: false,
    batchStopReason: null,
    candidateQualityStopReason: null,
    selectedDisciplineFilters: [],
    eventsFoundBeforeFiltering: 0,
    selectedYearEventLinksBeforeFilter: 0,
    hardSkippedUnselectedDiscipline: 0,
    hardSkippedRankingOrControl: 0,
    genericFallbackEventsAdded: 0,
    selectedYearEventLinksAfterSoftFilter: 0,
    relevantEventsInspected: 0,
    timedOutAtPhase: null,
    eventLinksSkippedByReason: { outsideYear: 0, future: 0, ranking: 0, irrelevantDiscipline: 0, duplicate: 0, limit: 0 },
    resultMenuDebug: [],
    prioritizedEventLinks: [],
    prioritizedListeIdLinks: [],
    phaseReached: null,
    candidatesFoundBeforeTimeout: 0,
    highPriorityListeIdPagesFetched: 0,
    lowPriorityListeIdPagesSkipped: 0,
    listeIdPagesQueued: 0,
    listeIdPagesScannedForName: 0,
    shooterPagesParsed: 0,
    scanStoppedReason: null,
    candidatesFoundAfterDiscovery: 0,
    candidatesFoundAfterScan: 0,
    resultMenusBeforeFirstListeIdScan: 0,
    timedOutBeforeFirstListeIdScan: false,
    timedOut: false,
    limitReached: false,
    whichLimit: null,
    message: null,
    lastFetchUrl: null,
    errorMessage: null,
    eventIdsFound: [],
    eventIdsInspected: [],
    eventDatesParsed: {},
    eventYearsFound: {},
    eventYearsInspected: {},
    candidatesByYear: {},
    skippedOutsideSelectedYear: 0,
    eventIdsSkippedOutsideYear: [],
    eventIdsSkippedFuture: [],
    completedEventsInspected: 0,
    futureEventsSkipped: 0,
    listeIdLinksByEvent: {},
    shooterMatchSnippets: [],
    hiddenControlCandidates: 0,
    coverage: { eventsChecked: 0, resultListsChecked: 0, rowsParsed: 0, confirmedMatches: 0, possibleMatches: 0, alreadyImported: 0, ignoredOrFailed: 0, failedOrUnsupportedPages: 0 },
    checkedLists: [],
    eventLinksFound: 0,
    resultLinksFound: 0,
    eventPagesFetched: 0,
    eventInfoPagesFetched: 0,
    eventResultMenuPagesFetched: 0,
    listeIdLinksExtracted: 0,
    listeIdLinksFromResultMenus: 0,
    listeIdPagesFetched: 0,
    listeIdShooterPagesFound: 0,
    firstListeIdUrlsInspected: [],
    firstShooterMatchUrls: [],
    listInspectionLimitReached: false,
    resultMenuDiagnostics: [],
    validationUrlsInspected: 0,
    validationShooterMatches: 0,
    candidateCategoryCounts: { recommended: 0, review: 0, control: 0 },
    candidateConfidenceCounts: { high: 0, medium: 0, low: 0 },
    duplicatesRemoved: 0,
    candidatesWithOwnScore: 0,
    candidatesWithWinningScore: 0,
    candidatesWithTotalTargets: 0,
    candidatesWithShootingGround: 0,
    recommendedWithShootingGround: 0,
    recommendedWithCompleteScore: 0,
    candidateDebugRows: [],
    validationChecklist: [],
    pagesInspected: 0,
    shooterPagesFound: 0,
    candidateRowsCreated: 0,
    rejectedReasons: [],
    candidateReasons: [],
    firstUsefulSnippet: null,
  };
}

function normalizeText(value: string) {
  return decodeEntities(value)
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string) {
  return normalizeLeirdueName(value);
}

function asciiFoldNorwegian(value: string) {
  return nordicSafeNameKey(value);
}

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageContainsShooter(text: string, shooterName: string) {
  const normalizedText = normalizeName(text);
  const normalizedShooter = normalizeName(shooterName);
  if (!normalizedShooter) return false;
  if (normalizedText.includes(normalizedShooter)) return true;

  const foldedText = asciiFoldNorwegian(text);
  const foldedShooter = asciiFoldNorwegian(shooterName);
  if (foldedText.includes(foldedShooter)) return true;

  const tokens = normalizedShooter.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const foldedFirst = asciiFoldNorwegian(first);
  const foldedLast = asciiFoldNorwegian(last);
  if (new RegExp(`\\b${escapedRegex(first)}\\b[\\s\\S]{0,80}\\b${escapedRegex(last)}\\b`).test(normalizedText)) return true;
  if (new RegExp(`\\b${escapedRegex(foldedFirst)}\\b[\\s\\S]{0,80}\\b${escapedRegex(foldedLast)}\\b`).test(foldedText)) return true;
  const initial = foldedFirst.slice(0, 1);
  return Boolean(initial && foldedLast && new RegExp(`\\b${escapedRegex(initial)}\\.?\\b[\\s\\S]{0,80}\\b${escapedRegex(foldedLast)}\\b`).test(foldedText));
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&aring;/gi, "å")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aelig;/gi, "æ")
    .replace(/&Aring;/g, "Å")
    .replace(/&Oslash;/g, "Ø")
    .replace(/&AElig;/g, "Æ")
    .replace(/&#248;/g, "ø")
    .replace(/&#230;/g, "æ")
    .replace(/&#229;/g, "å")
    .replace(/&#47;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value: string) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(html: string) {
  const withBreaks = decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|p|div|tr|td|th|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return withBreaks
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function absolutizeUrl(href: string) {
  try {
    return new URL(href.replace(/&amp;/g, "&"), LEIRDUE_BASE_URL).toString();
  } catch {
    return LEIRDUE_BASE_URL;
  }
}

function extractLinks(html: string): Link[] {
  const links: Link[] = [];
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html))) {
    const href = match[1];
    const text = stripTags(match[2]) || href;
    if (href) links.push({ href: absolutizeUrl(href), text, source: "anchor" });
  }
  return links;
}

function usefulSnippet(text: string, query?: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  const index = query ? normalizeText(compact).indexOf(normalizeText(query)) : -1;
  const start = index >= 0 ? Math.max(0, index - 140) : 0;
  return compact.slice(start, start + 420);
}

async function fetchLeirdue(url: string, debug: LeirdueSearchDebug, state: CrawlState) {
  let status: number | null = null;
  if (shouldStopCrawl(debug, state)) return null;
  const remainingMs = remainingCrawlMs(state);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(FETCH_TIMEOUT_MS, remainingMs)));
  debug.lastFetchUrl = url;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Clay Performance Lab Leirdue import/1.0", Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
      signal: controller.signal,
    });
    status = response.status;
    const html = await response.text();
    debug.fetchedUrls.push({ url, status, ok: response.ok });
    if (!response.ok) {
      markFetchError(debug, url, `HTTP ${response.status}`);
      return null;
    }
    if (!debug.firstUsefulSnippet) debug.firstUsefulSnippet = usefulSnippet(stripTags(html));
    return html;
  } catch (error) {
    const timedOut = controller.signal.aborted && Date.now() >= state.deadlineAt - 5;
    if (timedOut) markTimedOut(debug);
    const cause = error instanceof Error && "cause" in error ? error.cause : null;
    const causeMessage = typeof cause === "object" && cause && "message" in cause && typeof cause.message === "string" ? ` (${cause.message})` : "";
    const note = timedOut ? TIME_LIMIT_MESSAGE : error instanceof Error ? `${error.message}${causeMessage}` : FETCH_ERROR_MESSAGE;
    debug.fetchedUrls.push({ url, status, ok: false, note });
    markFetchError(debug, url, note);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}


function checkedListStatusFromParsed(parsed: LeirdueDebugParseResult, pageText: string): LeirdueCheckedListDebug["status"] {
  if (!parsed.shooterFound) return "no matching shooter";
  if (parsed.candidate && parsed.candidate.category !== "control" && parsed.ownScore !== null) return "parsed";
  if (parsed.candidate && /duplicate/i.test(parsed.candidate.notes)) return "possible duplicate";
  if (parsed.candidateRows.length === 0) return "no score rows found";
  if (isLikelyControlText(`${parsed.listTitle || ""} ${pageText.slice(0, 600)}`)) return "unsupported format";
  return parsed.ownScore === null ? "no score rows found" : "parsed";
}

function recordCheckedList(debug: LeirdueSearchDebug, item: ListeIdQueueItem | null, url: string, parsed: LeirdueDebugParseResult | null, pageText: string, failedReason: string | null = null) {
  if (debug.checkedLists.length >= 250) return;
  const sourceIds = extractLeirdueSourceIdentifiers(url);
  const rowsFound = parsed?.candidateRows.length ?? 0;
  const candidateShooterRows = parsed?.candidateRows.filter((row) => row.containsShooter).length ?? 0;
  const status: LeirdueCheckedListDebug["status"] = failedReason ? "failed fetch" : parsed ? checkedListStatusFromParsed(parsed, pageText) : "failed fetch";
  debug.checkedLists.push({
    eventName: item?.eventTitle || parsed?.eventTitle || null,
    date: item?.eventDate || parsed?.date || null,
    sourceUrl: url,
    stevneId: item?.eventId || sourceIds.stevneId,
    listeId: item?.listeId || sourceIds.listeId,
    status,
    rowsFound,
    candidateShooterRows,
    reason: failedReason || parsed?.candidate?.notes.match(/Category reason: ([^.]+)/)?.[1] || parsed?.error || null,
  });
}

function classifyDiscipline(text: string, selectedDisciplines: string[]) {
  const normalized = normalizeText(text);
  const notes: string[] = [];
  const normalizedLabel = normalizeLeirdueDisciplineLabel(normalized);
  let discipline = normalizedLabel.discipline;

  // Prefer the app’s dedicated compact leirduesti value before the broader Compak Sporting alias.
  if (/\b(kompakt leirduesti|compact leirduesti|kompaktsti|compaksti|kompak leirduesti|kompakt sporting)\b/.test(normalized)) {
    discipline = KOMPAKT_LEIRDUESTI;
  } else if (/\b(compak sporting|compak|kompak)\b/.test(normalized) && /\b(nsf|fitasc|compak|kompak|sporting|cup|resultat|stevne|duer|skudd)\b/.test(normalized)) {
    discipline = COMPAK_SPORTING;
  } else if (normalized.includes("leirduesti")) {
    discipline = LEIRDUESTI;
  }

  if (normalizedLabel.warning && discipline === "Other") notes.push(normalizedLabel.warning);
  if (!selectedDisciplines.includes(discipline)) notes.push(`Discipline ${discipline} was not selected, so review is required.`);
  return { discipline, notes };
}

function directResultFlags(text: string) {
  const normalized = normalizeText(text);
  const flags: string[] = [];
  if (normalized.includes("sammenlagt resultatliste etter bane")) flags.push("sammenlagt resultatliste etter bane");
  if (normalized.includes("resultater sammenlagt")) flags.push("resultater sammenlagt");
  if (normalized.includes("resultatliste sammenlagt")) flags.push("resultatliste sammenlagt");
  if (normalized.includes("sammenlagt") && normalized.includes("resultat")) flags.push("sammenlagt result");
  if (normalized.includes("resultater")) flags.push("resultater");
  if (normalized.includes("resultatliste")) flags.push("resultatliste");
  if (/\b\d{1,3}\s+\d{1,3}\s+\d{1,3}\b/.test(normalized)) flags.push("score rows");
  return Array.from(new Set(flags));
}

function controlFlags(text: string) {
  const normalized = normalizeText(text);
  const flags: string[] = [];
  if (/\b(?:xxl\s+cup|blaser\s+cup|cup)\s+sammenlagt\b/.test(normalized) || /\bsammenlagt\s+(?:cup|xxl\s+cup|blaser\s+cup)\b/.test(normalized)) flags.push("cup/ranking/prosent/uttak");
  if (normalized.includes("prosent") || normalized.includes("uttaksliste") || /\buttak\s+liste\b/.test(normalized) || normalized.includes("ranking") || /\brank\b/.test(normalized)) flags.push("cup/ranking/prosent/uttak");
  if (normalized.includes("påmelding") || normalized.includes("pamelding") || normalized.includes("deltakerliste") || normalized.includes("deltagarliste") || normalized.includes("participant")) flags.push("registration/participant");
  if (normalized.includes("lagliste") || normalized.includes("lag list") || normalized.includes("team list") || normalized.includes("lister lag")) flags.push("team/lag list");
  if (normalized.includes("finale only") || normalized.includes("final-only") || normalized.includes("shoot-off") || normalized.includes("shootoff")) flags.push("finale/shoot-off only");
  if ((normalized.includes("lørdag") && normalized.includes("søndag")) || (normalized.includes("lordag") && normalized.includes("sondag")) || normalized.includes("combined weekend")) flags.push("combined weekend");
  return Array.from(new Set(flags));
}

function isLikelyControlText(text: string) {
  return controlFlags(text).length > 0;
}

function directListScore(text: string) {
  const flags = directResultFlags(text);
  if (flags.includes("sammenlagt resultatliste etter bane")) return 90;
  if (flags.includes("resultater sammenlagt") || flags.includes("resultatliste sammenlagt")) return 85;
  if (flags.includes("sammenlagt result")) return 75;
  if (flags.includes("resultater") || flags.includes("resultatliste")) return 55;
  if (flags.includes("score rows")) return 25;
  return 0;
}

function isDirectResultList(text: string) {
  return directListScore(text) > 0 && !isLikelyControlText(text);
}

function penaltyForControlText(text: string) {
  return controlFlags(text).reduce((total, flag) => {
    if (flag === "cup/ranking/prosent/uttak") return total + 50;
    if (flag === "registration/participant") return total + 50;
    if (flag === "team/lag list") return total + 30;
    if (flag === "finale/shoot-off only") return total + 20;
    if (flag === "combined weekend") return total + 20;
    return total;
  }, 0);
}

function classifyListType(text: string) {
  if (isLikelyControlText(text)) return "Control / not imported by default";
  if (directListScore(text) > 0) return "Direct result list";
  return "Unknown list";
}

function isControlList(text: string) {
  return isLikelyControlText(text);
}

function looksLikeDirectResult(text: string) {
  return isDirectResultList(text);
}

function parseDate(text: string, year: number): string | null {
  const normalized = normalizeText(text);
  const prefersFirstDay = /\b(lørdag|lordag|saturday)\b/.test(normalized);
  const prefersSecondDay = /\b(søndag|sondag|sunday)\b/.test(normalized);
  const norwegianRange = normalized.match(/(\d{1,2})\.\s*(?:til|og|-|–)\s*(\d{1,2})\.\s*([a-zæøå]+)\s*(\d{4})/);
  if (norwegianRange && MONTHS[norwegianRange[3]]) {
    const day = prefersSecondDay ? norwegianRange[2] : norwegianRange[1];
    return `${norwegianRange[4]}-${MONTHS[norwegianRange[3]]}-${day.padStart(2, "0")}`;
  }
  const norwegian = normalized.match(/(\d{1,2})\.\s*([a-zæøå]+)\s*(\d{4})/);
  if (norwegian && MONTHS[norwegian[2]]) return `${norwegian[3]}-${MONTHS[norwegian[2]]}-${norwegian[1].padStart(2, "0")}`;
  const range = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-]?(\d{2,4})?\s*[-–]\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (range) {
    const firstYear = Number((range[3] || range[6]).length === 2 ? `20${range[3] || range[6]}` : range[3] || range[6]);
    const endYear = Number(range[6].length === 2 ? `20${range[6]}` : range[6]);
    if (prefersSecondDay) return `${endYear}-${range[5].padStart(2, "0")}-${range[4].padStart(2, "0")}`;
    return `${firstYear}-${range[2].padStart(2, "0")}-${range[1].padStart(2, "0")}`;
  }
  const full = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (full) {
    const parsedYear = Number(full[3].length === 2 ? `20${full[3]}` : full[3]);
    return `${parsedYear}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
  }
  const noYear = text.match(/(\d{1,2})[.\/-](\d{1,2})(?![\d.\/-])/);
  if (noYear) return `${year}-${noYear[2].padStart(2, "0")}-${noYear[1].padStart(2, "0")}`;
  return null;
}


function parsedYear(date: string | null) {
  return date ? Number(date.slice(0, 4)) : null;
}

function incrementCounter(counter: Record<string, number>, key: string | number | null) {
  const label = key === null ? "unknown" : String(key);
  counter[label] = (counter[label] || 0) + 1;
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function isFutureDate(date: string | null) {
  if (!date) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return parsed.getTime() > todayUtc.getTime();
}

function isRegistrationOnlyText(text: string) {
  const normalized = normalizeText(text);
  return normalized.includes("påmelding") || normalized.includes("pamelding") || normalized.includes("deltakerliste") || normalized.includes("deltagarliste") || normalized.includes("deltakere") || normalized.includes("participant");
}

function seriesSumConsistent(seriesScores: number[], score?: number | null) {
  if (score === null || score === undefined) return false;
  const sum = seriesScores.reduce((total, value) => total + value, 0);
  return Math.abs(sum - score) <= 1;
}

function totalTargetsFromSeriesScores(seriesScores: number[], score?: number | null, rowText = "") {
  return totalTargetsInferenceFromSeriesScores(seriesScores, score, rowText)?.totalTargets ?? null;
}

function totalTargetsInferenceFromSeriesScores(seriesScores: number[], score?: number | null, rowText = ""): TotalTargetsInference | null {
  if (seriesScores.length === 0 || percentageTokenCount(rowText) > 0 || !seriesSumConsistent(seriesScores, score)) return null;
  const allTenOrLess = seriesScores.every((value) => value >= 0 && value <= 10);
  const allTwentyFiveOrLess = seriesScores.every((value) => value >= 0 && value <= 25);
  if (seriesScores.length === 10 && allTenOrLess) return { totalTargets: 100, source: "seriesPattern", confidence: "medium" };
  if ((seriesScores.length === 13 || seriesScores.length === 14) && allTenOrLess) return { totalTargets: 130, source: "seriesPattern", confidence: "medium" };
  if ([2, 3, 4, 5, 6, 8].includes(seriesScores.length) && allTwentyFiveOrLess) return { totalTargets: seriesScores.length * 25, source: "seriesPattern", confidence: "medium" };
  return null;
}

function explicitTargetCountFromText(text: string) {
  const normalized = normalizeText(text);
  const explicit = normalized.match(/\b(25|50|75|100|125|130|150|175|200)\s*(?:sk|skudd|skudds|skot|skots|duer|duers|targets|mal|mål|compak|compact|kompakt)\b/);
  if (explicit) return Number(explicit[1]);
  const named = normalized.match(/\b(25|50|75|100|125|130|150|175|200)\b(?=\s*(?:compak|compact|kompakt|sporting|leirduesti|sti))/);
  return named ? Number(named[1]) : null;
}

function textDisallowsTotalTargetsInference(text: string) {
  const normalized = normalizeText(text);
  return percentageTokenCount(text) > 0 || /(ranking|prosent|cup sammenlagt|sammenlagt premiering|klasseføring|klasseforing|lagskyting|lagliste|flere stevner|sesong|season|uttak)/.test(normalized);
}

function inferTotalTargets(contextText: string, rowText: string, score?: number | null, winningScore?: number | null, seriesScores: number[] = []): TotalTargetsInference | null {
  if (score === null || score === undefined || textDisallowsTotalTargetsInference(rowText) || textDisallowsTotalTargetsInference(contextText)) return null;
  const explicit = explicitTargetCountFromText(contextText);
  if (explicit !== null && score <= explicit && (winningScore === null || winningScore === undefined || winningScore <= explicit || winningScore <= Math.ceil(explicit * 1.05))) {
    return { totalTargets: explicit, source: "titleTargetCount", confidence: "high" };
  }
  return totalTargetsInferenceFromSeriesScores(seriesScores, score, rowText);
}

function extractLikelyTotalTargets(text: string, score?: number | null, seriesScores: number[] = [], rowText = "") {
  const explicit = explicitTargetCountFromText(text);
  if (explicit) return explicit;

  if (rowText) {
    const inferredFromSeries = totalTargetsFromSeriesScores(seriesScores, score, rowText);
    if (inferredFromSeries !== null) return inferredFromSeries;
  }

  const normalized = normalizeText(text);
  if (normalized.length < 220) {
    const standalone = Array.from(normalized.matchAll(/\b(25|50|75|100|125|130|150|175|200)\b/g)).map((match) => Number(match[1]));
    const plausible = standalone.filter((total) => !score || total >= score);
    if (plausible.length > 0) return plausible[0];
  }
  return null;
}

function extractTitle(lines: string[], html: string, year: number) {
  const htmlTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const titleLine = lines.find((line) => line.includes(String(year)) && !/^(oppdatert|copyright|jury|meny|start\s+stevner)/i.test(line) && line.length > 12);
  if (titleLine) return titleLine;
  return htmlTitle && !/^leirdue\.net$/i.test(htmlTitle) ? htmlTitle : "Leirdue result";
}


function extractActualEventInfoFromResultMenu(html: string, overviewEvent: EventLinkMeta, selectedYear: number) {
  const lines = htmlToLines(html);
  const title = extractTitle(lines, html, selectedYear);
  const firstUsefulLines = lines
    .filter((line) => line.length > 3 && !/^(meny|start|logg|kontakt|programvare)$/i.test(line))
    .slice(0, 60)
    .join(" ");
  const stripped = stripTags(html).slice(0, 4000);
  const context = [title, firstUsefulLines].filter(Boolean).join(" ");
  const hasExplicitYear = /\b20\d{2}\b/.test(context) || /\b20\d{2}\b/.test(stripped) || /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(context) || /\d{1,2}\.\s*[a-zæøå]+\s*20\d{2}/i.test(context);
  const date = hasExplicitYear ? (parseDate(context, selectedYear) || parseDate(stripped, selectedYear)) : null;
  return { title, date, year: parsedYear(date), dateText: date || overviewEvent.dateText || null };
}

function knownTorbjorn2025Assertions(input: LeirdueSearchInput) {
  if (!isTorbjornLunde2025DebugSearch(input)) return [];
  return [
    { eventId: "11412", listeId: "51724", discovered: false, inspected: false, listeQueued: false, listeScanned: false },
    { eventId: "12337", listeId: "56520", discovered: false, inspected: false, listeQueued: false, listeScanned: false },
  ];
}

function refreshKnownTorbjorn2025Debug(input: LeirdueSearchInput, debug: LeirdueSearchDebug, eventLinks: Map<string, EventLinkMeta>, listeIdLinks: Map<string, Link>, scannedKeys: Set<string>) {
  const assertions = knownTorbjorn2025Assertions(input);
  if (assertions.length === 0) return;
  debug.knownTorbjorn2025Debug = assertions.map((item) => {
    const key = `liste:${item.eventId}:${item.listeId}`;
    const discovered = eventLinks.has(item.eventId);
    const resultMenuFetched = debug.eventIdsInspected.includes(item.eventId);
    const listeIdsFound = Array.from(listeIdLinks.values())
      .filter((link) => extractStevneId(link.href) === item.eventId)
      .map((link) => extractListeId(link.href))
      .filter((listeId): listeId is string => Boolean(listeId));
    const listeQueued = listeIdLinks.has(key);
    const listeScanned = scannedKeys.has(key);
    const fetchFailure = debug.fetchedUrls.find((fetchItem) => fetchItem.url === eventResultMenuUrl(item.eventId) && !fetchItem.ok)?.note;
    const reason = !discovered
      ? "event not discovered"
      : !resultMenuFetched
        ? fetchFailure || "result menu not fetched before stop"
        : !listeQueued
          ? "liste_id not found on result menu"
          : !listeScanned
            ? "liste_id queued but not scanned"
            : null;
    return {
      ...item,
      discovered,
      inspected: resultMenuFetched,
      resultMenuFetched,
      listeIdsFound: Array.from(new Set(listeIdsFound)),
      listeQueued,
      listeScanned,
      reason,
    };
  });
}



function percentageTokenCount(text: string) {
  return (text.match(/\b\d{1,3}(?:[,.]\d+)?\s*%/g) || []).length;
}

function isPercentageHeavyText(text: string) {
  return percentageTokenCount(text) >= 3;
}

function isCompleteDirectCandidate(candidate: LeirdueCandidate | null, selectedYear: number) {
  if (!candidate) return false;
  const candidateYear = parsedYear(candidate.date);
  return candidate.ownScore !== null
    && candidate.totalTargets !== null
    && candidate.winningScore !== null
    && candidate.date !== null
    && candidateYear === selectedYear
    && candidate.discipline !== "Other"
    && candidate.category !== "control"
    && !isFutureDate(candidate.date);
}

function recordCandidateQuality(debug: LeirdueSearchDebug, parsed: LeirdueDebugParseResult, pageText: string) {
  const qualityText = normalizeText(`${parsed.listTitle || ""} ${parsed.parsedRow || ""} ${parsed.rawSnippet || ""} ${pageText.slice(0, 1200)}`);
  const percentageHeavy = isPercentageHeavyText(`${parsed.rawSnippet || ""} ${parsed.parsedRow || ""} ${pageText.slice(0, 1200)}`);
  const controlLike = percentageHeavy || /(ranking|prosent|cup sammenlagt|sammenlagt premiering|klasseføring|klasseforing)/.test(qualityText);
  if (percentageHeavy) debug.percentageHeavyCandidates += 1;
  if (isImportableCompleteCandidate(parsed.candidate, debug.selectedYear ?? new Date().getFullYear()) && !controlLike) {
    debug.completeCandidatesFound += 1;
  } else if (controlLike || (!parsed.ownScore && !parsed.totalTargets)) {
    debug.lowQualityCandidatesFound += 1;
  } else {
    debug.partialCandidatesFound += 1;
  }
  if (debug.completeCandidatesFound === 0 && (debug.partialCandidatesFound > 0 || debug.lowQualityCandidatesFound > 0)) {
    debug.searchContinuedBecauseOnlyLowQualityCandidates = true;
  }
}

function recordEventBatchScan(debug: LeirdueSearchDebug, beforeScanned: number, beforeShooterPages: number) {
  const scanned = debug.listeIdPagesScannedForName - beforeScanned;
  const candidates = debug.listeIdShooterPagesFound - beforeShooterPages;
  debug.eventBatchesProcessed += 1;
  debug.listeIdPagesScannedPerBatch.push(scanned);
  debug.candidatesFoundPerBatch.push(candidates);
}

function isTorbjornLunde2025RegressionEvent(input: LeirdueSearchInput, eventId: string | null) {
  return Boolean(eventId) && isTorbjornLunde2025DebugSearch(input) && knownTorbjorn2025Assertions(input).some((item) => item.eventId === eventId);
}

function isTorbjornLunde2025RegressionListe(input: LeirdueSearchInput, href: string) {
  if (!isTorbjornLunde2025DebugSearch(input)) return false;
  const eventId = extractStevneId(href);
  const listeId = extractListeId(href);
  return knownTorbjorn2025Assertions(input).some((item) => item.eventId === eventId && item.listeId === listeId);
}

function boostKnownTorbjorn2025Events(input: LeirdueSearchInput, rankedEvents: EventLinkMeta[], eventLinks: Map<string, EventLinkMeta>, debug: LeirdueSearchDebug) {
  if (!isTorbjornLunde2025DebugSearch(input)) return rankedEvents;
  const boosted = knownTorbjorn2025Assertions(input)
    .map((item) => eventLinks.get(item.eventId))
    .filter((event): event is EventLinkMeta => Boolean(event));
  debug.regressionEventsBoosted = boosted.map((event) => event.eventId);
  debug.regressionPriorityApplied = boosted.length > 0;
  if (boosted.length === 0) return rankedEvents;
  const boostedIds = new Set(boosted.map((event) => event.eventId));
  return [...boosted, ...rankedEvents.filter((event) => !boostedIds.has(event.eventId))];
}

function eventHasExplicitSelectedYearText(event: EventLinkMeta, selectedYear: number) {
  const yearText = String(selectedYear);
  return `${event.titleText} ${event.eventTitle} ${event.rawRowSnippet} ${event.dateText || ""} ${event.actualDateText || ""}`.includes(yearText);
}

function eventHasSelectedYearText(event: EventLinkMeta, selectedYear: number) {
  return eventHasExplicitSelectedYearText(event, selectedYear) || event.overviewMatchedYear || event.parsedYear === selectedYear;
}

function eventHasSelectedDisciplineContext(event: EventLinkMeta, input: LeirdueSearchInput) {
  return selectedDisciplineMatches(eventPriorityText(event), input);
}

function eventQueueSortRank(event: EventLinkMeta, input: LeirdueSearchInput) {
  if (event.actualEventYear === input.year) return 0;
  if (event.actualEventYear !== null) return 4;
  if (eventHasExplicitSelectedYearText(event, input.year)) return 1;
  if (eventHasSelectedDisciplineContext(event, input)) return 2;
  return 3;
}

function shouldUseEventForContinuation(event: EventLinkMeta, input: LeirdueSearchInput, continuation: LeirdueContinuationState | null) {
  if (!continuation || continuation.visibleCandidatesCountTotal === 0) return true;
  if (event.actualEventYear !== null) return event.actualEventYear === input.year;
  return eventHasExplicitSelectedYearText(event, input.year) || eventHasSelectedDisciplineContext(event, input);
}

function setRemainingQueueDebug(debug: LeirdueSearchDebug, events: EventLinkMeta[], inspectedEventIds: Set<string>, input: LeirdueSearchInput, pendingListeIds: number) {
  const remaining = events.filter((event) => !inspectedEventIds.has(event.eventId) && !event.skippedReason);
  const likelySelectedYearEvents = remaining.filter((event) => event.actualEventYear === null && eventHasExplicitSelectedYearText(event, input.year));
  const unknownSelectedDisciplineEvents = remaining.filter((event) => event.actualEventYear === null && !eventHasExplicitSelectedYearText(event, input.year) && eventHasSelectedDisciplineContext(event, input));
  debug.confirmedSelectedYearEventsRemaining = remaining.filter((event) => event.actualEventYear === input.year).length;
  debug.likelySelectedYearEventsRemaining = likelySelectedYearEvents.length;
  debug.unknownYearSelectedTextEventsRemaining = likelySelectedYearEvents.length;
  debug.unknownYearEventsRemaining = unknownSelectedDisciplineEvents.length;
  debug.outsideYearFallbackEventsRemaining = remaining.filter((event) => event.actualEventYear !== input.year && !(event.actualEventYear === null && (eventHasExplicitSelectedYearText(event, input.year) || eventHasSelectedDisciplineContext(event, input)))).length;
  debug.pendingListeIdQueueRemaining = pendingListeIds;
  debug.remainingEventQueueCount = remaining.length;
}

function setEventQueueDebugRows(debug: LeirdueSearchDebug, events: EventLinkMeta[], input: LeirdueSearchInput) {
  const sortedEvents = events.slice().sort((a, b) => eventQueueSortRank(a, input) - eventQueueSortRank(b, input) || eventPriority(b, input) - eventPriority(a, input) || Number(b.eventId) - Number(a.eventId) || a.eventTitle.localeCompare(b.eventTitle));
  debug.prioritizedEventLinks = sortedEvents.slice(0, 50).map((event) => {
    const priority = eventPriorityDetail(event, input);
    return {
      eventId: event.eventId,
      title: event.eventTitle,
      score: priority.score,
      reason: priority.reason,
      titleParseSource: event.titleParseSource,
      selectedDisciplineMatches: priority.matches,
      overviewMatchedYear: event.overviewMatchedYear,
      actualEventYear: event.actualEventYear,
      actualEventDate: event.actualEventDate,
      inspected: event.inspected,
      skippedReason: event.skippedReason,
    };
  });
  debug.eventTitleDebugRows = sortedEvents.slice(0, 50).map((event) => {
    const priority = eventPriorityDetail(event, input);
    return {
      eventId: event.eventId,
      title: event.eventTitle,
      organizer: event.organizerText,
      dateText: event.actualDateText || event.dateText,
      rawRowSnippet: event.rawRowSnippet,
      titleParseSource: event.titleParseSource,
      priority: priority.score,
      reason: priority.reason,
      selectedDisciplineMatches: priority.matches,
      overviewMatchedYear: event.overviewMatchedYear,
      actualEventYear: event.actualEventYear,
      actualEventDate: event.actualEventDate,
      actualDateText: event.actualDateText,
      inspected: event.inspected,
      skippedReason: event.skippedReason,
    };
  });
}

function setNextUnscannedEventQueueDebug(debug: LeirdueSearchDebug, events: EventLinkMeta[], input: LeirdueSearchInput) {
  debug.nextUnscannedEventQueue = events
    .filter((event) => !event.inspected && !event.skippedReason)
    .slice(0, 20)
    .map((event) => {
      const priority = eventPriorityDetail(event, input);
      return {
        eventId: event.eventId,
        title: event.eventTitle,
        actualEventYear: event.actualEventYear,
        priority: priority.score,
        reason: priority.reason,
      };
    });
}

function meaningfulLabel(value: string) {
  const cleaned = cleanShootingGround(value).replace(/debug validation url for torbjørn lunde 2026/i, "").replace(/\s+/g, " ").trim();
  if (!cleaned || /^leirdue result$/i.test(cleaned) || /^result list$/i.test(cleaned)) return null;
  if (/^(resultater|resultatliste|sammenlagt|klassedelt)$/i.test(cleaned)) return null;
  if (/^\d{1,2}\.\s*[a-zæøå]+\s*\d{4}$/i.test(cleaned) || /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test(cleaned)) return null;
  return cleaned;
}

function candidateNameFrom(title: string, listTitle: string, discipline: string) {
  const titleName = meaningfulLabel(title);
  const listName = meaningfulLabel(listTitle);
  if (titleName && !/^leirdue\.net$/i.test(titleName)) return titleName;
  if (listName) return listName;
  const parsedDate = parseDate(`${title} ${listTitle}`, new Date().getFullYear());
  if (parsedDate) return `Leirdue result — ${parsedDate}`;
  return discipline !== "Other" ? `Leirdue ${discipline} result` : "Leirdue result";
}

function cleanShootingGround(value: string) {
  return decodeEntities(value)
    .replace(/\b(?:resultater|påmelding|deltakerliste|sammenlagt|klassedelt|skyting|stevne)\b.*$/i, "")
    .replace(/^[\s:–-]+|[\s:–-]+$/g, "")
    .trim();
}

function normalizeKnownShootingGround(value: string) {
  const normalized = normalizeText(value);
  if (/\bbergen\s+l\.?\s*k\.?\b/.test(normalized)) return "Bergen L.K.";
  if (normalized.includes("kismul") || /\bbergens?\s+j\.?\s*f\.?\s*f?\.?\b/.test(normalized)) return "Bergens J.F. / Kismul";
  if (/\bos\s+j\.?\s*f\.?\s*l\.?\b/.test(normalized)) return "Os J.F.L.";
  if (/\bjæren\s+j\.?\s*f\.?\s*l\.?\b/.test(value.toLowerCase()) || /\bjaeren\s+j\.?\s*f\.?\s*l\.?\b/.test(normalized)) return "Jæren J.F.L.";
  if (/\bstavanger\s+og\s+rogaland\s+j\.?\s*f\.?\s*f\.?\b/.test(normalized)) return "Stavanger og Rogaland J.F.F.";
  if (/\bteam\s+sørvest\b/i.test(value) || /\bteam\s+sorvest\b/.test(normalized)) return "Team Sørvest";
  if (/\bkarmøy\s+j\.?\s*f\.?\s*n\.?\s*f\.?\b/i.test(value) || /\bkarmoy\s+j\.?\s*f\.?\s*n\.?\s*f\.?\b/.test(normalized)) return "Karmøy J.F.N.F.";
  return null;
}

function invalidShootingGround(value: string) {
  const normalized = normalizeText(value);
  return (
    !normalized ||
    normalized.length < 3 ||
    /%/.test(value) ||
    /^\d/.test(normalized) ||
    normalized === "sporting 1" ||
    normalized === "lørdag + søndag" ||
    normalized === "lordag + sondag" ||
    ["vestlandet", "ostlandet", "østlandet", "sorlandet", "sørlandet", "nord norge", "nord-norge", "leirdue.net", "norges skytterforbund", "njff", "ranking", "programvare"].includes(normalized) ||
    normalized.includes("logg inn") ||
    normalized.includes("terminliste") ||
    normalized.includes("resultater") ||
    normalized.includes("påmelding") ||
    normalized.includes("pamelding") ||
    normalized.includes("deltaker") ||
    normalized.includes("programvare") ||
    (normalized.includes("cup") && !/\b(j\.?f|l\.?k|jff|jfl|lk|team)\b/.test(normalized))
  );
}

function knownShootingGroundMatch(text: string) {
  const knownPatterns = [
    /\bBergen\s+L\.?\s*K\.?\b/i,
    /\bBergens?\s+J\.?\s*F\.?\s*F?\.?\b/i,
    /\bKismul\b/i,
    /\bOs\s+J\.?\s*F\.?\s*L\.?\b/i,
    /\bJæren\s+J\.?\s*F\.?\s*L\.?\b/i,
    /\bJaeren\s+J\.?\s*F\.?\s*L\.?\b/i,
    /\bStavanger\s+og\s+Rogaland\s+J\.?\s*F\.?\s*F\.?\b/i,
    /\bTeam\s+Sørvest\b/i,
    /\bTeam\s+Sorvest\b/i,
    /\bKarmøy\s+J\.?\s*F\.?\s*N\.?\s*F\.?\b/i,
    /\bKarmoy\s+J\.?\s*F\.?\s*N\.?\s*F\.?\b/i,
  ];
  for (const pattern of knownPatterns) {
    const match = text.match(pattern);
    if (!match?.[0]) continue;
    const normalized = normalizeKnownShootingGround(match[0]) || cleanShootingGround(match[0]);
    if (!invalidShootingGround(normalized)) return normalized;
  }
  return null;
}

function extractShootingGround(title: string, text: string) {
  const combined = `${title}\n${text}`;
  const organizerPatterns = [
    /(?:stevnearrangør|arrangør|arrangor|arranger(?:t av)?|arrangørklubb|klubb|forening)\s*:?\s*([^|·\n\r]{3,80})/i,
    /(?:skytebane|bane|sted)\s*:?\s*([^|·\n\r]{3,80})/i,
  ];
  for (const pattern of organizerPatterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      const ground = normalizeKnownShootingGround(match[1]) || cleanShootingGround(match[1]);
      if (!invalidShootingGround(ground)) return { value: ground, source: "organizer field" as const };
    }
  }

  const known = knownShootingGroundMatch(combined);
  if (known) return { value: known, source: "known-club match" as const };

  const beforeDate = title.split(/\b\d{1,2}\./)[0]?.trim() || title;
  const titleParts = beforeDate.split(/\s+-\s+|\s+–\s+|\s+\/\s+/).map((part) => normalizeKnownShootingGround(part) || cleanShootingGround(part)).filter(Boolean);
  const maybeGround = titleParts.reverse().find((part) => !invalidShootingGround(part) && !/^(\d+\s*(sk|skudd|duer)|lørdag|søndag|saturday|sunday)$/i.test(part));
  if (maybeGround) return { value: maybeGround, source: "event text" as const };

  return { value: null, source: "unknown" as const };
}

function extractScoreNumbers(line: string) {
  const withoutPercentages = line.replace(/\b\d{1,3}(?:[,.]\d+)?\s*%/g, " ");
  const normalized = withoutPercentages.replace(/,/g, ".");
  return Array.from(normalized.matchAll(/\b\d{1,3}\b/g)).map((match) => Number(match[0]));
}

function extractTableRows(html: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    const cells = Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((cell) => stripTags(cell[1]))
      .filter(Boolean);
    const text = cells.length > 0 ? cells.join(" | ") : stripTags(rowHtml);
    if (!text) continue;
    const numbers = extractScoreNumbers(text);
    rows.push({ text, cells, numbers, total: null, seriesScores: [] });
  }
  return rows;
}

function isNonCompetitorRow(text: string, year: number) {
  const normalized = normalizeText(text);
  return (
    !normalized ||
    normalized.includes(String(year)) ||
    normalized.includes("prosent") ||
    normalized.includes("påmelding") ||
    normalized.includes("pamelding") ||
    normalized.includes("deltakerliste") ||
    normalized.includes("sum ") ||
    normalized.includes("ranking") ||
    normalized.includes("uttak") ||
    /\b(plass|navn|klubb|klasse|sum|totalt|resultat)\b/.test(normalized)
  );
}

function parseCompetitorRow(rowText: string, year: number, totalTargets: number | null, shooterName?: string): ParsedRow | null {
  if (isNonCompetitorRow(rowText, year)) return null;
  const searchable = shooterName ? rowText.slice(Math.max(0, normalizeText(rowText).indexOf(normalizeText(shooterName)))) : rowText;
  const numbers = extractScoreNumbers(searchable).filter((value) => value <= 250);
  if (numbers.length === 0) return null;
  const possibleScores = totalTargets ? numbers.filter((value) => value <= totalTargets) : numbers.filter((value) => value <= 200);
  const total = possibleScores.at(-1) ?? null;
  if (total === null) return null;
  const totalIndex = numbers.lastIndexOf(total);
  const seriesScores = numbers.slice(0, Math.max(0, totalIndex)).filter((value) => value >= 0 && value <= 25);
  return { text: rowText, cells: [], numbers, total, seriesScores };
}

function likelyFinalScoreFromRow(line: string, year: number, totalTargets: number | null) {
  return parseCompetitorRow(line, year, totalTargets)?.total ?? null;
}

function findShooterSnippet(lines: string[], shooterName: string) {
  const index = lines.findIndex((line) => pageContainsShooter(line, shooterName));
  if (index < 0) return null;
  return lines.slice(Math.max(0, index - 3), index + 7).join(" | ");
}

function parseScoresFromLines(lines: string[], html: string, shooterName: string, pageText: string, year: number, totalTargets: number | null): ParsedScore {
  const notes: string[] = [];
  let ownScore: number | null = null;
  let scoreLine: string | null = null;
  let seriesScores: number[] = [];
  let parsedNumbers: number[] = [];
  const competitorTotals: number[] = [];
  const rows = extractTableRows(html);
  const rowTexts = rows.length > 0 ? rows.map((row) => row.text) : lines;

  for (const rowText of rowTexts) {
    const parsed = parseCompetitorRow(rowText, year, totalTargets);
    if (parsed?.total !== null && parsed?.total !== undefined) competitorTotals.push(parsed.total);
  }

  const shooterRowText = rowTexts.find((rowText) => pageContainsShooter(rowText, shooterName));
  if (shooterRowText) {
    const parsed = parseCompetitorRow(shooterRowText, year, totalTargets, shooterName);
    if (parsed) {
      ownScore = parsed.total;
      scoreLine = parsed.text;
      seriesScores = parsed.seriesScores;
      parsedNumbers = parsed.numbers;
    }
  }

  if (ownScore === null) {
    const shooterIndex = lines.findIndex((line) => pageContainsShooter(line, shooterName));
    if (shooterIndex >= 0) {
      const nearby = lines.slice(shooterIndex, shooterIndex + 8);
      for (const line of nearby) {
        const parsed = parseCompetitorRow(line, year, totalTargets, line === nearby[0] ? shooterName : undefined);
        if (!parsed) continue;
        ownScore = parsed.total;
        scoreLine = parsed.text;
        seriesScores = parsed.seriesScores;
        parsedNumbers = parsed.numbers;
        break;
      }
    }
  }

  if (ownScore === null) {
    const escapedName = shooterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const compactMatch = pageText.match(new RegExp(`${escapedName}[\\s\\S]{0,260}?(\\d{1,3})\\s*/\\s*(\\d{1,3})`, "i"));
    if (compactMatch?.[1]) {
      ownScore = Number(compactMatch[1]);
      parsedNumbers = [Number(compactMatch[1]), Number(compactMatch[2])];
      scoreLine = compactMatch[0];
    }
  }

  if (ownScore === null) notes.push("Shooter name was found, but the parser could not identify a score row.");
  if (competitorTotals.length === 0) notes.push("Could not parse a winning score from this list.");
  if (scoreLine) notes.push(`Raw shooter row: ${scoreLine}`);
  if (parsedNumbers.length > 0) notes.push(`Parsed numbers: ${parsedNumbers.join(", ")}.`);
  if (seriesScores.length > 0) notes.push(`Parsed series scores: ${seriesScores.join(", ")}.`);

  return { ownScore, winningScore: competitorTotals.length > 0 ? Math.max(...competitorTotals) : null, scoreLine, notes, parsedNumbers, seriesScores };
}

function computeCandidatePriority(raw: RawCandidate) {
  const classificationContext = `${raw.listTitle} ${raw.listType || ""}`;
  let priority = 0;
  if (raw.ownScore !== null) priority += 30;
  if (raw.winningScore !== null) priority += 20;
  if (raw.totalTargets !== null) priority += 20;
  if (raw.discipline !== "Other") priority += 15;
  if (raw.date) priority += 10;
  if (raw.shootingGround) priority += 10;
  if (directListScore(classificationContext) > 0 || raw.validationSource) priority += 20;
  if (raw.validationSource) priority += 30;
  priority -= penaltyForControlText(classificationContext);
  if (isFutureDate(raw.date)) priority -= 50;
  return priority;
}

function buildCandidate(raw: RawCandidate, selectedDisciplines: string[], selectedYear: number): LeirdueCandidate {
  const notes = raw.notes.slice();
  const selectedDiscipline = selectedDisciplines.includes(raw.discipline);
  const classificationContext = `${raw.listTitle} ${raw.listType || ""}`;
  const flags = controlFlags(classificationContext);
  if (isFutureDate(raw.date)) flags.push("future event");
  const candidateYear = parsedYear(raw.date);
  if (candidateYear !== null && candidateYear !== selectedYear) flags.push("outside selected year");
  if (!raw.validationSource && isRegistrationOnlyText(classificationContext) && raw.ownScore === null) flags.push("registration/participant");
  const directFlags = raw.validationSource ? Array.from(new Set([...directResultFlags(classificationContext), "validation direct list"])) : directResultFlags(classificationContext);
  const direct = directFlags.length > 0 && flags.length === 0;
  const hasOwnScore = raw.ownScore !== null;
  const hasCompleteScore = raw.ownScore !== null && raw.winningScore !== null && raw.totalTargets !== null;
  const parsedDiscipline = raw.discipline !== "Other";
  const ambiguousInferredTargets = notes.some((note) => /totalTargetsSource=seriesPattern/.test(note) && /inferenceConfidence=(medium|low)/.test(note));
  const candidatePriority = computeCandidatePriority(raw);
  let confidence: LeirdueConfidence = "low";
  let category: LeirdueCategory = "review";

  if (flags.length > 0) {
    category = "control";
    confidence = "low";
    notes.push(`Category reason: control flags triggered: ${Array.from(new Set(flags)).join(", ")}.`);
  } else if (hasCompleteScore && raw.date !== null && parsedDiscipline && !ambiguousInferredTargets) {
    category = "recommended";
    confidence = "high";
    notes.push("Category reason: complete parsed result data from fetched liste_id page; direct result flags are not required.");
  } else if (hasCompleteScore && raw.date !== null && parsedDiscipline) {
    category = "review";
    confidence = "medium";
    notes.push("Category reason: complete row uses series-pattern total target inference, so review before import.");
  } else if (hasOwnScore) {
    category = "review";
    confidence = candidatePriority >= 40 ? "medium" : "low";
    notes.push("Category reason: own score parsed but winner/targets/directness need review.");
  } else {
    category = "review";
    confidence = "low";
    notes.push("Category reason: shooter found but score is missing.");
    if (!direct) notes.push("Category reason: direct result flags are missing or unclear.");
    if (!parsedDiscipline) notes.push("Category reason: discipline is unclear.");
    if (!selectedDiscipline) notes.push("Category reason: parsed discipline is not selected.");
  }

  if (!raw.shooterClass) notes.push("Could not detect class.");
  if (!raw.seriesScores || raw.seriesScores.length === 0) notes.push("Could not detect series breakdown.");
  const sourceIds = extractLeirdueSourceIdentifiers(raw.leirdueUrl);
  const warnings = [
    ...notes.filter((note) => /Could not|uncertain|review is required|Unsupported|Possible duplicate/i.test(note)),
    ...(raw.placement === null || raw.placement === undefined ? ["Could not detect placement."] : []),
  ];

  notes.push(`Candidate debug: category=${category}; confidence=${confidence}; candidatePriority=${candidatePriority}; controlFlags=${Array.from(new Set(flags)).join(", ") || "none"}; directResultFlags=${directFlags.join(", ") || "none"}; listTitle=${raw.listTitle}; shootingGroundSource=${raw.shootingGroundSource}; ownScore=${raw.ownScore ?? "unknown"}; winningScore=${raw.winningScore ?? "unknown"}; totalTargets=${raw.totalTargets ?? "unknown"}; stevne_id=${sourceIds.stevneId || "unknown"}; liste_id=${sourceIds.listeId || "unknown"}.`);
  notes.push(category === "recommended" ? "Import recommendation: checked by default." : "Import recommendation: not checked by default.");

  return {
    date: raw.date,
    name: raw.name,
    shootingGround: raw.shootingGround,
    discipline: raw.discipline,
    ownScore: raw.ownScore,
    totalTargets: raw.totalTargets,
    winningScore: raw.winningScore,
    maxScore: raw.totalTargets,
    placement: raw.placement ?? null,
    seriesScores: raw.seriesScores || [],
    shooterName: raw.shooterName || null,
    shooterClass: raw.shooterClass || null,
    stevneId: sourceIds.stevneId,
    listeId: sourceIds.listeId,
    warnings: Array.from(new Set(warnings)),
    duplicateStatus: "new",
    duplicateMatches: [],
    shooterMatchStatus: null,
    shooterMatchReason: null,
    leirdueUrl: raw.leirdueUrl,
    listType: raw.listType,
    confidence,
    notes: Array.from(new Set(notes.filter(Boolean))).join(" "),
    category,
    importRecommended: category === "recommended",
  };
}

function extractCandidatesFromPage(page: Page, input: LeirdueSearchInput, debug: LeirdueSearchDebug, alreadyMatched = false) {
  debug.pagesInspected += 1;
  const lines = htmlToLines(page.html);
  const pageText = lines.join("\n");
  const shooterPresent = pageContainsShooter(pageText, input.shooterName);
  if (!shooterPresent) {
    if (debug.candidateReasons.length < 30) debug.candidateReasons.push(`${page.url}: shooter name not found on liste_id page`);
    return [];
  }

  debug.shooterPagesFound += 1;
  if (!alreadyMatched) debug.listeIdShooterPagesFound += 1;
  if (debug.firstShooterMatchUrls.length < 10 && !debug.firstShooterMatchUrls.includes(page.url)) debug.firstShooterMatchUrls.push(page.url);
  debug.firstUsefulSnippet ||= usefulSnippet(pageText, input.shooterName);
  const title = extractTitle(lines, page.html, input.year);
  const validationSource = page.label.includes("Debug validation URL");
  const listTitle = `${page.label} ${title}`.trim();
  const context = `${title}\n${page.label}\n${pageText}`;
  const candidateDate = parseDate(context, input.year);
  const candidateYear = parsedYear(candidateDate);
  incrementCounter(debug.candidatesByYear, candidateYear);
  const discipline = classifyDiscipline(context, input.disciplines);
  const targetContext = [listTitle, title, lines.slice(0, 25).join("\n")].join("\n");
  const initialTotalTargets = extractLikelyTotalTargets(targetContext);
  const parsed = parseScoresFromLines(lines, page.html, input.shooterName, pageText, input.year, initialTotalTargets);
  const totalTargetsInference = inferTotalTargets(targetContext, parsed.scoreLine || "", parsed.ownScore, parsed.winningScore, parsed.seriesScores);
  const totalTargets = totalTargetsInference?.totalTargets ?? initialTotalTargets ?? extractLikelyTotalTargets(targetContext, parsed.ownScore, parsed.seriesScores, parsed.scoreLine || "");
  const snippet = findShooterSnippet(lines, input.shooterName);
  const listType = classifyListType(listTitle);
  const notes = [...discipline.notes, ...parsed.notes, `Source liste_id URL: ${page.url}.`, `List title/type: ${listTitle} / ${listType}.`];
  if (totalTargetsInference) notes.push(`totalTargetsSource=${totalTargetsInference.source}; inferredTotalTargets=${totalTargetsInference.totalTargets}; inferenceConfidence=${totalTargetsInference.confidence}.`);
  const shootingGroundResult = extractShootingGround(title, lines.slice(0, 25).join("\n"));
  const shootingGround = shootingGroundResult.value;
  if (shootingGround) notes.push(`Shooting ground inferred from ${shootingGroundResult.source}: ${shootingGround}.`);
  else notes.push("Could not infer shooting ground.");
  if (validationSource) notes.push("Found through validation URL.");
  if (isFutureDate(candidateDate)) notes.push("Future event / not imported");
  if (candidateYear !== null && candidateYear !== input.year) notes.push(`Outside selected year (${candidateYear}); selected year is ${input.year}.`);
  if (snippet) {
    notes.push(`Raw snippet: ${snippet}`);
    if (debug.shooterMatchSnippets.length < 20) debug.shooterMatchSnippets.push({ url: page.url, snippet });
  }
  if (parsed.scoreLine && totalTargets === null) notes.push(`Score row parsed, but total targets could not be inferred from title/list text: ${parsed.scoreLine}`);

  const raw: RawCandidate = {
    date: candidateDate,
    name: candidateNameFrom(title, page.label, discipline.discipline),
    shootingGround,
    discipline: discipline.discipline,
    ownScore: parsed.ownScore,
    totalTargets,
    winningScore: parsed.winningScore,
    maxScore: totalTargets,
    placement: null,
    seriesScores: parsed.seriesScores,
    shooterName: input.shooterName,
    shooterClass: null,
    leirdueUrl: page.url,
    listType,
    sourceText: pageText,
    listTitle,
    notes,
    validationSource,
    shootingGroundSource: shootingGroundResult.source,
  };
  const candidate = buildCandidate(raw, input.disciplines, input.year);
  debug.candidateRowsCreated += 1;
  debug.candidateReasons.push(`${page.url}: candidate created as ${candidate.category}/${candidate.confidence}`);
  return [candidate];
}

const EVENT_PAGE_LIMIT = 240;
const RESULT_LIST_PAGE_LIMIT = 650;
const TORBJORN_LUNDE_2026_VALIDATION_URLS = [
  "https://www.leirdue.net/?liste_id=57102&meny=resultater&stevne=12486",
  "https://www.leirdue.net/?liste_id=59154&meny=resultater&stevne=12307",
  "https://www.leirdue.net/?liste_id=57301&meny=resultater&stevne=12524",
  "https://www.leirdue.net/?liste_id=57305&meny=resultater&stevne=12525",
  "https://www.leirdue.net/?liste_id=58967&meny=resultater&stevne=12506",
  "https://www.leirdue.net/?liste_id=59402&meny=resultater&stevne=12234",
  "https://www.leirdue.net/?liste_id=59400&meny=resultater&stevne=12811",
  "https://www.leirdue.net/?liste_id=59217&meny=resultater&stevne=12675",
  "https://www.leirdue.net/?liste_id=60025&meny=resultater&stevne=12674",
];

type ExpectedValidationResult = {
  label: string;
  date: string;
  name: string;
  discipline: string;
  shootingGround: string;
  ownScore: number;
  totalTargets: number;
  winningScore: number;
  listeId?: string;
  stevneId?: string;
  fallbackMatchers?: ((candidate: LeirdueCandidate) => boolean)[];
};

const TORBJORN_LUNDE_2026_EXPECTED_RESULTS: ExpectedValidationResult[] = [
  { label: "A", date: "2026-02-08", name: "XXL Cup 50 Compak Sporting", discipline: COMPAK_SPORTING, shootingGround: "Bergen L.K.", ownScore: 48, totalTargets: 50, winningScore: 49, listeId: "57102", stevneId: "12486" },
  { label: "B", date: "2026-02-15", name: "XXL Cup 50 compact leirduesti", discipline: KOMPAKT_LEIRDUESTI, shootingGround: "Bergens J.F. / Kismul", ownScore: 49, totalTargets: 50, winningScore: 49, listeId: "59154", stevneId: "12307" },
  { label: "C", date: "2026-03-14", name: "Blaser Cup Bergen Saturday", discipline: COMPAK_SPORTING, shootingGround: "Bergen L.K.", ownScore: 65, totalTargets: 75, winningScore: 73, listeId: "57301", stevneId: "12524" },
  { label: "D", date: "2026-03-15", name: "Blaser Cup Bergen Sunday", discipline: COMPAK_SPORTING, shootingGround: "Bergen L.K.", ownScore: 57, totalTargets: 75, winningScore: 69, listeId: "57305", stevneId: "12525" },
  { label: "E", date: "2026-04-12", name: "RM Kompakt Leirduesti / XXL Cup del 3", discipline: KOMPAKT_LEIRDUESTI, shootingGround: "Bergens J.F. / Kismul", ownScore: 46, totalTargets: 50, winningScore: 49, listeId: "58967", stevneId: "12506" },
  {
    label: "F",
    date: "2026-04-19",
    name: "XXL Cup / kompaktsti",
    discipline: KOMPAKT_LEIRDUESTI,
    shootingGround: "Os J.F.L.",
    ownScore: 50,
    totalTargets: 50,
    winningScore: 50,
    fallbackMatchers: [
      (candidate) => candidate.date === "2026-04-19" && (normalizeText(candidate.name).includes("kompakt") || normalizeText(candidate.discipline).includes("kompakt") || normalizeText(candidate.shootingGround || "").includes("os j")),
      (candidate) => normalizeText(candidate.shootingGround || "").includes("os j") && candidate.ownScore === 50,
    ],
  },
  { label: "G", date: "2026-05-02", name: "Stavanger & Jæren 200 Saturday", discipline: KOMPAKT_LEIRDUESTI, shootingGround: "Jæren J.F.L.", ownScore: 96, totalTargets: 100, winningScore: 96, listeId: "59402", stevneId: "12234" },
  { label: "H", date: "2026-05-03", name: "Stavanger & Jæren 200 Sunday", discipline: LEIRDUESTI, shootingGround: "Stavanger og Rogaland J.F.F.", ownScore: 85, totalTargets: 100, winningScore: 90, listeId: "59400", stevneId: "12811" },
  { label: "I", date: "2026-05-14", name: "Blaser Cup Team Sørvest 200 Compak", discipline: COMPAK_SPORTING, shootingGround: "Team Sørvest", ownScore: 183, totalTargets: 200, winningScore: 196, listeId: "59217", stevneId: "12675" },
  { label: "J", date: "2026-05-16", name: "Blaser Cup Karmøy 100 sk leirduesti", discipline: LEIRDUESTI, shootingGround: "Karmøy J.F.N.F.", ownScore: 91, totalTargets: 100, winningScore: 98, listeId: "60025", stevneId: "12674" },
];

function rankLink(link: Link, input: LeirdueSearchInput) {
  return listeIdPriorityDetail(link, input).score;
}

function extractStevneId(value: string) {
  return decodeEntities(value).match(/[?&]stevne=(\d+)/i)?.[1] || null;
}

function eventInfoUrl(stevneId: string) {
  return `${LEIRDUE_BASE_URL}?stevne=${stevneId}`;
}

function eventResultMenuUrl(stevneId: string) {
  return `${LEIRDUE_BASE_URL}?stevne=${stevneId}&meny=resultater`;
}

function listeIdUrl(stevneId: string | null, listeId: string) {
  const params = new URLSearchParams({ meny: "resultater", liste_id: listeId });
  if (stevneId) params.set("stevne", stevneId);
  return `${LEIRDUE_BASE_URL}?${params.toString()}`;
}

function isLeirdueResultUrl(url: string) {
  const normalized = normalizeText(url);
  return normalized.includes("meny=resultater") || normalized.includes("liste_id=");
}

function isListeIdLink(link: Link) {
  const normalized = normalizeText(link.href);
  return normalized.includes("liste_id=") && isLeirdueResultUrl(link.href);
}

function isEventish(link: Link, input: LeirdueSearchInput) {
  const haystack = normalizeText(`${link.text} ${link.href}`);
  if (isListeIdLink(link)) return false;
  const hasEventId = haystack.includes("stevne=");
  const resultPage = haystack.includes("meny=resultater");
  const relevantYear = haystack.includes(String(input.year));
  return (hasEventId && resultPage) || (resultPage && relevantYear) || (hasEventId && relevantYear);
}

function titleFromListeContext(context: string) {
  const text = stripTags(context).replace(/\s+/g, " ").trim();
  const before = text.split(/liste_id\s*=\s*\d+/i)[0]?.trim() || text;
  return before.split(/[|>»]/).at(-1)?.trim().slice(-140) || "Result list";
}


function canonicalListeIdKey(href: string) {
  const absolute = absolutizeUrl(href);
  try {
    const url = new URL(absolute);
    const listeId = url.searchParams.get("liste_id");
    const stevneId = url.searchParams.get("stevne");
    if (listeId) return `liste:${stevneId || "none"}:${listeId}`;
  } catch {
    // Fall back to the normalized absolute URL below.
  }
  return absolute.replace(/&amp;/g, "&");
}

function extractListeId(href: string) {
  try {
    const url = new URL(absolutizeUrl(href));
    return url.searchParams.get("liste_id");
  } catch {
    return href.match(/liste_id\s*=\s*(\d+)/i)?.[1] ?? null;
  }
}

function listeIdQueueItems(links: Map<string, Link>, eventsById: Map<string, EventLinkMeta>, input: LeirdueSearchInput): ListeIdQueueItem[] {
  return Array.from(links.entries()).map(([key, link]) => {
    const eventId = extractStevneId(link.href);
    const event = eventId ? eventsById.get(eventId) : null;
    const eventText = event?.titleText ?? "";
    const priority = listeIdPriorityDetail({ ...link, text: `${eventText} ${link.text}`.trim() || link.text }, input);
    return {
      key,
      href: link.href,
      text: link.text,
      eventId,
      listeId: extractListeId(link.href),
      eventTitle: eventText,
      eventDate: event?.date ?? null,
      priority: priority.score,
      reason: priority.reason,
      source: link.source,
    };
  }).sort((a, b) => b.priority - a.priority || (b.eventDate || "0000-00-00").localeCompare(a.eventDate || "0000-00-00") || a.href.localeCompare(b.href));
}

function listPageLabel(item: ListeIdQueueItem) {
  return [item.eventTitle, item.text].filter(Boolean).join(" — ") || `Leirdue result${item.eventDate ? ` — ${item.eventDate}` : ""}`;
}

function pendingListeIdQueue(links: Map<string, Link>, scannedKeys: Set<string>) {
  return Array.from(links.entries())
    .filter(([key]) => !scannedKeys.has(key))
    .map(([, link]) => link);
}

function remainingContinuationListScanBudget(debug: LeirdueSearchDebug) {
  return Math.max(0, MAX_CONTINUATION_LISTE_IDS_TO_SCAN_PER_BATCH - debug.scannedThisBatch);
}

function updateListeIdQueueDebug(debug: LeirdueSearchDebug, queueItems: ListeIdQueueItem[]) {
  debug.listeIdPagesQueued = Math.max(debug.listeIdPagesQueued, queueItems.length);
  debug.prioritizedListeIdLinks = queueItems.slice(0, 20).map((item) => ({
    url: item.href,
    title: listPageLabel(item),
    score: item.priority,
    reason: item.reason,
  }));
}

async function scanQueuedListeIdPages(
  input: LeirdueSearchInput,
  debug: LeirdueSearchDebug,
  state: CrawlState,
  links: Map<string, Link>,
  eventsById: Map<string, EventLinkMeta>,
  scannedKeys: Set<string>,
  listPages: Map<string, Page>,
  maxPages: number,
) {
  const queueItems = listeIdQueueItems(links, eventsById, input);
  updateListeIdQueueDebug(debug, queueItems);
  const pendingItems = queueItems.filter((item) => !scannedKeys.has(item.key) && !listPages.has(item.key));
  debug.queuedThisBatch = Math.max(debug.queuedThisBatch, pendingItems.length);
  debug.listeIdsQueuedThisBatch = Math.max(debug.listeIdsQueuedThisBatch, pendingItems.length);
  if (queueItems.length > MAX_LISTE_ID_PAGES_SCANNED) {
    debug.listInspectionLimitReached = true;
    markLimitReached(debug, "max liste_id scan pages");
    debug.lowPriorityListeIdPagesSkipped = Math.max(debug.lowPriorityListeIdPagesSkipped, queueItems.length - MAX_LISTE_ID_PAGES_SCANNED);
  }

  let scannedThisPass = 0;
  debug.timedOutAtPhase = "listeId";
  for (const item of pendingItems) {
    if (scannedThisPass >= maxPages) break;
    if (debug.listeIdPagesScannedForName >= MAX_LISTE_ID_PAGES_SCANNED) {
      markLimitReached(debug, "max liste_id scan pages");
      debug.scanStoppedReason ||= "scanLimit";
      break;
    }
    if (listPages.size >= MAX_SHOOTER_PAGES_PARSED) {
      markLimitReached(debug, "max shooter pages parsed");
      debug.scanStoppedReason ||= "shooterPageLimit";
      break;
    }
    if (shouldStopCrawl(debug, state)) {
      debug.scanStoppedReason ||= "timeout";
      break;
    }

    scannedKeys.add(item.key);
    if (debug.firstListeIdUrlsInspected.length < 10) debug.firstListeIdUrlsInspected.push(item.href);
    const html = await fetchLeirdue(item.href, debug, state);
    if (!html) {
      recordCheckedList(debug, item, item.href, null, "", debug.fetchedUrls.find((entry) => entry.url === item.href)?.note || "failed fetch");
      continue;
    }

    scannedThisPass += 1;
    debug.listeIdPagesFetched += 1;
    debug.listeIdPagesScannedForName += 1;
    debug.fetchedThisBatch += 1;
    debug.scannedThisBatch += 1;
    debug.listeIdsScannedThisBatch += 1;
    if (item.priority >= 80) debug.highPriorityListeIdPagesFetched += 1;

    const pageText = stripTags(html);
    const shooterFound = pageContainsShooter(pageText, input.shooterName);
    if (item.source === "validation" && shooterFound) debug.validationShooterMatches += 1;
    if (!shooterFound) {
      const rowDebug = debugCandidateRows(htmlToLines(html), html, input.shooterName, input.year, extractLikelyTotalTargets(pageText));
      recordCheckedList(debug, item, item.href, { ...emptyDebugParseResult(item.href, 200, normalizeName(input.shooterName), "Shooter name not found."), ok: true, shooterFound: false, candidateRows: rowDebug.candidateRows, topCompetitorTotals: rowDebug.topCompetitorTotals }, pageText, null);
      continue;
    }

    if (debug.firstShooterMatchUrls.length < 10 && !debug.firstShooterMatchUrls.includes(item.href)) debug.firstShooterMatchUrls.push(item.href);
    debug.firstUsefulSnippet ||= usefulSnippet(pageText, input.shooterName);
    if (debug.shooterMatchSnippets.length < 20) {
      const snippet = usefulSnippet(pageText, input.shooterName);
      if (snippet) debug.shooterMatchSnippets.push({ url: item.href, snippet });
    }
    const parsedForQuality = debugParseLeirdueHtml({
      url: item.href,
      status: 200,
      html,
      shooterName: input.shooterName,
      year: input.year,
      selectedDisciplines: input.disciplines,
      parserNote: `Full-year scan quality check for liste_id page: ${item.href}.`,
    });
    recordCandidateQuality(debug, parsedForQuality, pageText);
    recordCheckedList(debug, item, item.href, parsedForQuality, pageText);
    if (debug.candidateReasons.length < 50) {
      const quality = isCompleteDirectCandidate(parsedForQuality.candidate, input.year) ? "complete" : isPercentageHeavyText(`${parsedForQuality.rawSnippet || ""} ${parsedForQuality.parsedRow || ""} ${pageText.slice(0, 1200)}`) ? "lowQuality/percentage" : parsedForQuality.candidate ? "partial" : "lowQuality";
      debug.candidateReasons.push(`Scan quality ${quality} from ${item.href}: ownScore=${parsedForQuality.ownScore ?? "unknown"}, totalTargets=${parsedForQuality.totalTargets ?? "unknown"}, winningScore=${parsedForQuality.winningScore ?? "unknown"}.`);
    }
    listPages.set(item.key, { url: item.href, html, label: listPageLabel(item), kind: "list" });
  }

  debug.listeIdShooterPagesFound = listPages.size;
  debug.candidatesFoundAfterScan = listPages.size;
  return scannedThisPass;
}

function addListeIdLink(links: Map<string, Link>, href: string, text: string, source: Link["source"]) {
  const absolute = absolutizeUrl(href);
  const key = canonicalListeIdKey(absolute);
  if (!links.has(key)) links.set(key, { href: absolute, text, source });
}

function addListeIdLinksFromAnchors(html: string, links: Map<string, Link>) {
  for (const link of extractLinks(html)) {
    if (isListeIdLink(link)) addListeIdLink(links, link.href, link.text, "anchor");
  }
}

function addListeIdLinksFromRawHtml(html: string, eventUrl: string, links: Map<string, Link>) {
  const stevneId = extractStevneId(eventUrl);
  let count = 0;
  for (const match of html.matchAll(/liste_id\s*=\s*(\d+)/gi)) {
    const listeId = match[1];
    const start = Math.max(0, match.index - 200);
    const end = Math.min(html.length, match.index + match[0].length + 200);
    const context = html.slice(start, end);
    addListeIdLink(links, listeIdUrl(stevneId, listeId), titleFromListeContext(context), "raw");
    count += 1;
  }
  return count;
}

function resultMenuContains(html: string) {
  const text = normalizeText(`${html} ${stripTags(html)}`);
  return {
    resultater: text.includes("resultater"),
    sammenlagt: text.includes("sammenlagt"),
    liste: text.includes("liste"),
    "meny=resultater": text.includes("meny=resultater"),
    liste_id: text.includes("liste_id"),
  };
}

function addResultMenuDiagnostic(debug: LeirdueSearchDebug, eventUrl: string, html: string) {
  if (debug.resultMenuDiagnostics.length >= 10) return;
  const stripped = stripTags(html) || html.replace(/\s+/g, " ").trim();
  debug.resultMenuDiagnostics.push({ eventUrl, contains: resultMenuContains(html), snippet: stripped.slice(0, 1000) });
}

function isTorbjornLunde2026Validation(input: LeirdueSearchInput) {
  const shooter = normalizeText(input.shooterName);
  return input.year === 2026 && (shooter.includes("torbjørn lunde") || asciiFoldNorwegian(shooter).includes("torbjorn lunde"));
}

function isTorbjornLunde2025DebugSearch(input: LeirdueSearchInput) {
  const shooter = normalizeText(input.shooterName);
  return input.year === 2025 && (shooter.includes("torbjørn lunde") || asciiFoldNorwegian(shooter).includes("torbjorn lunde"));
}

function addValidationListeIdLinks(input: LeirdueSearchInput, links: Map<string, Link>, debug: LeirdueSearchDebug) {
  if (!isTorbjornLunde2026Validation(input)) return;
  for (const url of TORBJORN_LUNDE_2026_VALIDATION_URLS) {
    addListeIdLink(links, url, "Debug validation URL for Torbjørn Lunde 2026", "validation");
  }
  debug.validationUrlsInspected = TORBJORN_LUNDE_2026_VALIDATION_URLS.length;
  debug.candidateReasons.push("Added Torbjørn Lunde 2026 debug validation liste_id URLs.");
}


function isLikelyYearNavigationLink(link: Link) {
  const haystack = normalizeText(`${link.text} ${link.href}`);
  return /\b20\d{2}\b/.test(haystack) || haystack.includes("resultater=") || haystack.includes("sesong=") || haystack.includes("aar=") || haystack.includes("year=");
}

function addDebugYearLinks(debug: LeirdueSearchDebug, links: Link[], selectedYear: number) {
  for (const link of links) {
    if (!isLikelyYearNavigationLink(link)) continue;
    const item = { url: link.href, text: link.text };
    if (!debug.discoveredYearLinks.some((existing) => existing.url === item.url && existing.text === item.text)) debug.discoveredYearLinks.push(item);
    if (normalizeText(`${link.href} ${link.text}`).includes(String(selectedYear)) && !debug.selectedYearLinksFound.some((existing) => existing.url === item.url && existing.text === item.text)) {
      debug.selectedYearLinksFound.push(item);
    }
  }
}

function addOverviewDiagnostic(debug: LeirdueSearchDebug, url: string, html: string, selectedYear: number) {
  const text = stripTags(html);
  const links = extractLinks(html);
  const selectedYearLinkCount = links.filter((link) => normalizeText(`${link.href} ${link.text}`).includes(String(selectedYear))).length;
  debug.overviewDiagnostics.push({
    url,
    containsSelectedYear: normalizeText(text).includes(String(selectedYear)) || selectedYearLinkCount > 0,
    selectedYearLinkCount,
    snippet: usefulSnippet(text, String(selectedYear)) || text.replace(/\s+/g, " ").trim().slice(0, 500),
  });
}

function genericOverviewTitle(value: string) {
  const text = normalizeText(value);
  return !text || text === "resultater" || text === "påmelding" || text === "pamelding" || text === "les mer" || text === "mer" || /^20\d{2}$/.test(text) || text.includes("dato / tid") || text.includes("tittel arrangør") || text.includes("tittel arrangor") || text === "dato" || text === "tittel" || text === "arrangør" || text === "arrangor";
}

function extractTableCells(html: string) {
  return Array.from(html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
    .map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function nearestRowHtml(html: string, index: number) {
  const before = html.lastIndexOf("<tr", index);
  const after = html.indexOf("</tr>", index);
  if (before !== -1 && after !== -1 && after > before) return html.slice(before, after + 5);
  const start = Math.max(0, index - 450);
  const end = Math.min(html.length, index + 450);
  return html.slice(start, end);
}

function cleanEventTitleCandidate(value: string, selectedYear: number) {
  return decodeEntities(value)
    .replace(/\b(?:dato\s*\/\s*tid|dato|tid|tittel|arrangør|arrangor|resultater|påmelding|pamelding)\b/gi, " ")
    .replace(new RegExp(`\\b${selectedYear}\\b`, "g"), " ")
    .replace(/\b(?:januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\b/gi, " ")
    .replace(/\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}\.\s*\/\s*\d{1,2}\.?\b/g, " ")
    .replace(/\bkl\.?\s*\d{1,2}[:.]\d{2}\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .trim();
}

function eventMetadataFromContext(anchorText: string, rowHtml: string, selectedYear: number, eventId: string) {
  const cells = extractTableCells(rowHtml);
  const rawRowSnippet = stripTags(rowHtml).replace(/\s+/g, " ").trim().slice(0, 500);
  const cleanAnchor = cleanEventTitleCandidate(stripTags(anchorText), selectedYear);
  const dateText = rawRowSnippet.match(/(?:\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?|\d{1,2}\.\s*\/\s*\d{1,2}\.?|\b(?:januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\b)/i)?.[0] ?? null;
  const titleCells = cells.length >= 3 ? cells.slice(1, -1) : cells;
  const cellTitle = titleCells
    .map((cell) => cleanEventTitleCandidate(cell, selectedYear))
    .filter((cell) => cell.length > 2 && !genericOverviewTitle(cell) && !/^\d/.test(cell))
    .sort((a, b) => b.length - a.length)[0];
  const rowTitle = cleanEventTitleCandidate(rawRowSnippet, selectedYear);

  let titleParseSource: EventTitleParseSource = "fallback";
  let eventTitle = `Event ${eventId}`;
  if (cleanAnchor && !genericOverviewTitle(cleanAnchor)) {
    eventTitle = cleanAnchor;
    titleParseSource = "anchorText";
  } else if (cellTitle && !genericOverviewTitle(cellTitle)) {
    eventTitle = cellTitle;
    titleParseSource = "rowSnippet";
  } else if (rowTitle && !genericOverviewTitle(rowTitle)) {
    eventTitle = rowTitle.slice(0, 160);
    titleParseSource = "rowSnippet";
  }

  const organizerText = cells.length >= 3 ? cells.at(-1) ?? null : null;
  return { eventTitle, organizerText, dateText, rawRowSnippet, titleParseSource };
}

function makeEventMeta(href: string, text: string, selectedYear: number, rowHtml = ""): EventLinkMeta | null {
  const eventId = extractStevneId(href);
  if (!eventId) return null;
  const metadata = eventMetadataFromContext(text, rowHtml || text, selectedYear, eventId);
  const priorityText = [metadata.eventTitle, metadata.organizerText, metadata.rawRowSnippet].filter(Boolean).join(" ");
  const date = parseDate(`${metadata.dateText || ""} ${priorityText}`, selectedYear);
  const year = parsedYear(date);
  return { eventId, url: eventResultMenuUrl(eventId), titleText: metadata.eventTitle, ...metadata, date, parsedYear: year, overviewMatchedYear: true, actualEventYear: null, actualEventDate: null, actualDateText: null, inspected: false, skippedReason: null };
}

function isOverviewUrl(url: string) {
  const normalized = normalizeText(url);
  return !normalized.includes("stevne=") && !normalized.includes("liste_id=");
}

function isEventLinkSkippable(meta: EventLinkMeta, selectedYear: number, debug: LeirdueSearchDebug) {
  const text = normalizeText(eventPriorityText(meta));
  if (meta.parsedYear !== null && meta.parsedYear !== selectedYear) {
    debug.eventLinksSkippedByReason.outsideYear += 1;
    return true;
  }
  if (isFutureDate(meta.date)) {
    debug.eventLinksSkippedByReason.future += 1;
    return true;
  }
  if (text.includes("ranking") || text.includes("klasseføring") || text.includes("klasseforing") || text.includes("trening") || text.includes("training")) {
    debug.eventLinksSkippedByReason.ranking += 1;
    return true;
  }
  if ((text.includes("cup sammenlagt") || text.includes("sammenlagt cup")) && !directResultFlags(text).length) {
    debug.eventLinksSkippedByReason.ranking += 1;
    return true;
  }
  return false;
}

function selectedDisciplineMatchTerms(text: string, input: LeirdueSearchInput) {
  const normalized = normalizeText(text);
  const matches: string[] = [];
  for (const discipline of input.disciplines) {
    const d = normalizeText(discipline);
    if (d.includes("compak") && /(compak|compaq|compact|fitasc\s+compak)/.test(normalized)) matches.push(discipline);
    else if (d.includes("kompakt") && /(kompakt|kompaktsti|compact\s+leirduesti|kompakt\s+leirduesti)/.test(normalized)) matches.push(discipline);
    else if (d.includes("leirduesti") && /(leirduesti|kompaktsti|\bsti\b)/.test(normalized)) matches.push(discipline);
    else if (d.includes("sporting") && /(sporting|fitasc\s+sporting)/.test(normalized)) matches.push(discipline);
    else if (d.includes("skeet") && /\bskeet\b/.test(normalized)) matches.push(discipline);
    else if (d.includes("trap") && /\btrap\b/.test(normalized)) matches.push(discipline);
  }
  return Array.from(new Set(matches));
}

function selectedDisciplineMatches(text: string, input: LeirdueSearchInput) {
  return selectedDisciplineMatchTerms(text, input).length > 0;
}

function eventPriorityText(meta: EventLinkMeta) {
  return [meta.eventTitle, meta.organizerText, meta.rawRowSnippet].filter(Boolean).join(" ");
}

function eventPriorityDetail(meta: EventLinkMeta, input: LeirdueSearchInput) {
  const text = normalizeText(eventPriorityText(meta));
  const titleOnly = normalizeText(meta.eventTitle);
  const matches = selectedDisciplineMatchTerms(eventPriorityText(meta), input);
  const reasons: string[] = [];
  let score = genericOverviewTitle(meta.eventTitle) || /^event\s+\d+$/i.test(meta.eventTitle) ? 5 : 20;
  reasons.push(score === 20 ? "generic selected-year result event" : "fallback/generic event title");
  if (matches.length > 0) { score += 140; reasons.push(`selected discipline match: ${matches.join("/")}`); }
  if (/(compak|compaq|sporting|kompakt|kompaktsti|compact|leirduesti|fitasc)/.test(text)) { score += 90; reasons.push("selected shotgun discipline words"); }
  const knownCompetition = /(blaser|xxl|khan|beretta|hringariki|ranastien|nyttår|nyttar|\bcup\b)/.test(text);
  const selectedContext = matches.length > 0 || /(compak|compaq|sporting|kompakt|kompaktsti|compact|leirduesti|fitasc|50\s*skudd|75|100|200)/.test(text);
  if (knownCompetition && selectedContext && !/(cup sammenlagt|sammenlagt cup|ranking)/.test(text)) { score += 45; reasons.push("known competition term with selected-discipline context"); }
  if (/\b(50\s*skudd|75|100|200)\b/.test(text)) { score += 15; reasons.push("target count in title/row"); }
  if (isClearlyUnselectedDisciplineEvent(meta, input)) { score -= 100; reasons.push("clear unselected discipline"); }
  if (text.includes("ranking") || text.includes("klasseføring") || text.includes("klasseforing") || text.includes("cup sammenlagt") || text.includes("sammenlagt cup")) { score -= 250; reasons.push("ranking/classification/cup summary"); }
  if (text.includes("trening") || text.includes("training") || text.includes("påmelding") || text.includes("pamelding")) { score -= 200; reasons.push("training/registration"); }
  if (/^(dato|tittel|arrangør|arrangor|desember|januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|20\d{2})$/.test(titleOnly)) { score -= 80; reasons.push("generic header/date title"); }
  if (isFutureDate(meta.date)) { score -= 150; reasons.push("future"); }
  return { score, reason: reasons.join(", ") || "generic selected-year event", matches };
}

function eventPriority(meta: EventLinkMeta, input: LeirdueSearchInput) {
  return eventPriorityDetail(meta, input).score;
}

function rankedEventsAcrossYear(events: EventLinkMeta[], input: LeirdueSearchInput) {
  const groups = new Map<number, EventLinkMeta[]>();
  for (const event of events) {
    const rank = eventQueueSortRank(event, input);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank)?.push(event);
  }
  return Array.from(groups.keys()).sort((a, b) => a - b).flatMap((rank) =>
    (groups.get(rank) || []).sort((a, b) => eventPriority(b, input) - eventPriority(a, input) || Number(b.eventId) - Number(a.eventId) || (b.date || "0000-00-00").localeCompare(a.date || "0000-00-00") || a.eventTitle.localeCompare(b.eventTitle)),
  );
}

function isRelevantSelectedDisciplineEvent(meta: EventLinkMeta, input: LeirdueSearchInput) {
  const text = normalizeText(eventPriorityText(meta));
  if (selectedDisciplineMatches(eventPriorityText(meta), input)) return true;
  if (/(blaser|khan|ranastien|nyttår|nyttar)/.test(text)) return true;
  if (/\bxxl\b/.test(text) && /(compak|sporting|kompakt|leirduesti|50|75|100|200)/.test(text)) return true;
  if (/\bcup\b/.test(text) && /(compak|sporting|kompakt|leirduesti)/.test(text) && !/(cup sammenlagt|sammenlagt cup|ranking)/.test(text)) return true;
  return false;
}

function isClearlyUnselectedDisciplineEvent(meta: EventLinkMeta, input: LeirdueSearchInput) {
  const text = normalizeText(eventPriorityText(meta));
  if (selectedDisciplineMatches(eventPriorityText(meta), input)) return false;
  const selected = input.disciplines.map((discipline) => normalizeText(discipline));
  const selectedSkeet = selected.some((discipline) => discipline.includes("skeet"));
  const selectedTrap = selected.some((discipline) => discipline.includes("trap"));
  if (!selectedSkeet && /\bskeet\b/.test(text)) return true;
  if (!selectedTrap && /(ol[-\s]?trap|nordisk\s+trap|jegertrap|\btrap\b|\bnt\b)/.test(text)) return true;
  return false;
}

function isHardRankingOrControlEvent(meta: EventLinkMeta) {
  const text = normalizeText(eventPriorityText(meta));
  return text.includes("ranking") || text.includes("klasseføring") || text.includes("klasseforing") || text.includes("trening") || text.includes("training") || text.includes("påmelding") || text.includes("pamelding") || text.includes("cup sammenlagt") || text.includes("sammenlagt cup");
}

function listeIdPriorityDetail(link: Link, input: LeirdueSearchInput) {
  const text = normalizeText(`${link.text} ${link.href}`);
  const reasons: string[] = [];
  let score = 0;
  if (text.includes("sammenlagt resultatliste etter bane")) { score += 120; reasons.push("sammenlagt resultatliste etter bane"); }
  else if (text.includes("resultater sammenlagt") || text.includes("resultatliste sammenlagt")) { score += 110; reasons.push("resultater/resultatliste sammenlagt"); }
  else if (text.includes("resultatliste etter bane")) { score += 95; reasons.push("resultatliste etter bane"); }
  else if (text.includes("resultater") || text.includes("resultatliste")) { score += 80; reasons.push("result list"); }
  if (selectedDisciplineMatches(text, input)) { score += 20; reasons.push("matches selected disciplines"); }
  if (text.includes("liste_id")) score += 10;
  if (link.source === "validation") { score += 500; reasons.push("validation"); }
  if (isTorbjornLunde2025RegressionListe(input, link.href)) { score += 1000; reasons.push("Torbjørn 2025 regression liste_id priority"); }
  if (text.includes("klassedelt")) { score -= 20; reasons.push("class split"); }
  if (/(lagskyting|lagliste|finaleliste|finale|cup sammenlagt|sammenlagt premiering|ranking|prosent|klasseføring|klasseforing|uttak|flere stevner|sesong|season|%)/.test(text)) { score -= 180; reasons.push("control/summary/percentage list"); }
  return { score, reason: reasons.join(", ") || "generic liste_id" };
}

function addEventMeta(events: Map<string, EventLinkMeta>, meta: EventLinkMeta, debug: LeirdueSearchDebug) {
  if (events.has(meta.eventId)) {
    debug.eventLinksSkippedByReason.duplicate += 1;
    return;
  }
  events.set(meta.eventId, meta);
}

function overviewEventLinksForYear(html: string, selectedYear: number, debug: LeirdueSearchDebug) {
  const linksByEvent = new Map<string, EventLinkMeta>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorRegex.exec(html))) {
    const href = absolutizeUrl(anchorMatch[1]);
    const linkText = stripTags(anchorMatch[2]) || href;
    if (!extractStevneId(href) || !normalizeText(href).includes("meny=resultater")) continue;
    const rowHtml = nearestRowHtml(html, anchorMatch.index);
    const nearbyText = stripTags(rowHtml).replace(/\s+/g, " ").trim();
    const beforeText = stripTags(html.slice(Math.max(0, anchorMatch.index - 1400), anchorMatch.index)).replace(/\s+/g, " ");
    const nearestHeadingYear = Array.from(beforeText.matchAll(/\b(20\d{2})\b/g)).at(-1)?.[1];
    if (nearestHeadingYear && Number(nearestHeadingYear) !== selectedYear && !nearbyText.includes(String(selectedYear))) continue;
    const meta = makeEventMeta(href, linkText, selectedYear, rowHtml);
    if (!meta) continue;
    addEventMeta(linksByEvent, { ...meta, parsedYear: meta.parsedYear ?? selectedYear }, debug);
  }

  if (linksByEvent.size > 0) return Array.from(linksByEvent.values());

  const marked = decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_all, href, label) => `\n[[LINK ${absolutizeUrl(href)}]]${stripTags(label)}[[/LINK]]\n`)
    .replace(/<(br|p|div|tr|td|th|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  let currentYear: number | null = null;
  let recentText = "";

  for (const rawLine of marked.split(/\n+/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const headingYear = line.match(/^20\d{2}$/)?.[0];
    if (headingYear) {
      currentYear = Number(headingYear);
      recentText = line;
      continue;
    }

    const linkMatch = line.match(/^\[\[LINK (.*?)\]\](.*?)\[\[\/LINK\]\]$/);
    if (linkMatch) {
      if (currentYear !== selectedYear) continue;
      const meta = makeEventMeta(linkMatch[1], linkMatch[2], selectedYear, `${recentText} ${linkMatch[2]}`);
      if (!meta) continue;
      addEventMeta(linksByEvent, { ...meta, parsedYear: meta.parsedYear ?? selectedYear }, debug);
      continue;
    }
    recentText = `${recentText} ${line}`.slice(-300);
  }

  return Array.from(linksByEvent.values());
}

async function discoverPages(input: LeirdueSearchInput, debug: LeirdueSearchDebug, state: CrawlState, continuation: LeirdueContinuationState | null) {
  const sourceUrl = input.sourceUrl ? absolutizeUrl(input.sourceUrl) : null;
  const guessedUrls = [
    ...(sourceUrl ? [sourceUrl] : []),
    `${LEIRDUE_BASE_URL}?resultater=`,
    `${LEIRDUE_BASE_URL}?meny=resultater&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=resultater&year=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&year=${input.year}`,
  ];
  debug.selectedYear = input.year;
  debug.normalizedSearchName = normalizeName(input.shooterName);
  debug.selectedDisciplineFilters = input.disciplines;
  debug.guessedYearOverviewUrlsTried = guessedUrls;
  // TODO: Future full-history import should run year-by-year as a background/batch job, not one live request.

  const eventLinks = new Map<string, EventLinkMeta>();
  const listeIdLinks = new Map<string, Link>();
  if (sourceUrl) {
    if (extractListeId(sourceUrl)) addListeIdLink(listeIdLinks, sourceUrl, "User supplied result list", "anchor");
    const sourceStevneId = extractStevneId(sourceUrl);
    if (sourceStevneId) {
      const meta = makeEventMeta(eventResultMenuUrl(sourceStevneId), `User supplied event ${sourceStevneId} ${input.year}`, input.year);
      if (meta) addEventMeta(eventLinks, { ...meta, parsedYear: meta.parsedYear ?? input.year }, debug);
    }
  }
  const listPages = new Map<string, Page>();
  const previouslyScannedEventIds = new Set(continuation?.scannedEventIds ?? []);
  const scannedListeIdKeys = new Set(continuation?.scannedListeIdKeys ?? []);
  for (const link of continuation?.pendingListeIdQueue ?? []) {
    const key = canonicalListeIdKey(link.href);
    if (!scannedListeIdKeys.has(key)) listeIdLinks.set(key, link);
  }
  debug.pendingListeIdQueueAtStart = pendingListeIdQueue(listeIdLinks, scannedListeIdKeys).length;
  if (continuation && debug.pendingListeIdQueueAtStart > 0) {
    debug.scanFirstMode = true;
    await scanQueuedListeIdPages(input, debug, state, listeIdLinks, eventLinks, scannedListeIdKeys, listPages, MAX_CONTINUATION_LISTE_IDS_TO_SCAN_PER_BATCH);
    if (debug.scannedThisBatch >= MAX_CONTINUATION_LISTE_IDS_TO_SCAN_PER_BATCH || shouldStopCrawl(debug, state)) {
      debug.batchStopReason = debug.scannedThisBatch >= MAX_CONTINUATION_LISTE_IDS_TO_SCAN_PER_BATCH ? "listScanBatchLimit" : "timeoutAfterScanFirst";
    }
  }
  const overviewHtmlByUrl = new Map<string, string>();
  const crawlStartedAt = state.deadlineAt - SEARCH_TIMEOUT_MS;

  debug.timedOutAtPhase = "overview";
  for (const url of guessedUrls) {
    if (shouldStopCrawl(debug, state)) break;
    const html = await fetchLeirdue(url, debug, state);
    if (!html) continue;
    overviewHtmlByUrl.set(url, html);
    addOverviewDiagnostic(debug, url, html, input.year);
    addDebugYearLinks(debug, extractLinks(html), input.year);
  }

  const overviewUrls = new Set<string>();
  for (const [url, html] of overviewHtmlByUrl) {
    if (isOverviewUrl(url) && normalizeText(stripTags(html)).includes(String(input.year))) overviewUrls.add(url);
  }
  for (const item of debug.selectedYearLinksFound) {
    if (isOverviewUrl(item.url)) overviewUrls.add(item.url);
  }
  if (overviewUrls.size === 0) overviewUrls.add(`${LEIRDUE_BASE_URL}?resultater=`);

  for (const url of overviewUrls) {
    if (shouldStopCrawl(debug, state)) break;
    let html = overviewHtmlByUrl.get(url);
    if (!html) {
      const fetchedHtml = await fetchLeirdue(url, debug, state);
      if (!fetchedHtml) continue;
      html = fetchedHtml;
      overviewHtmlByUrl.set(url, html);
      addOverviewDiagnostic(debug, url, html, input.year);
      addDebugYearLinks(debug, extractLinks(html), input.year);
    }
    if (!debug.selectedYearOverviewUrlUsed) debug.selectedYearOverviewUrlUsed = url;
    addUnique(debug.eventOverviewUrls, url);

    for (const meta of overviewEventLinksForYear(html, input.year, debug)) {
      if (isEventLinkSkippable(meta, input.year, debug)) continue;
      addEventMeta(eventLinks, meta, debug);
    }

    if (eventLinks.size === 0) {
      for (const link of extractLinks(html)) {
        if (!isEventish(link, input)) continue;
        const meta = makeEventMeta(link.href, link.text, input.year);
        if (!meta || isEventLinkSkippable(meta, input.year, debug)) continue;
        addEventMeta(eventLinks, meta, debug);
      }
      for (const match of html.matchAll(/stevne\s*=\s*(\d+)/gi)) {
        const meta = makeEventMeta(eventResultMenuUrl(match[1]), `Raw selected-year event ${match[1]} ${input.year}`, input.year);
        if (meta) addEventMeta(eventLinks, { ...meta, parsedYear: meta.parsedYear ?? input.year }, debug);
      }
    }
  }

  debug.eventsFoundBeforeFiltering = eventLinks.size;
  debug.selectedYearEventLinksBeforeFilter = eventLinks.size;
  const strictRelevantEvents: EventLinkMeta[] = [];
  const genericFallbackCandidates: EventLinkMeta[] = [];
  for (const event of eventLinks.values()) {
    if (isHardRankingOrControlEvent(event)) {
      debug.hardSkippedRankingOrControl += 1;
      debug.eventLinksSkippedByReason.ranking += 1;
      continue;
    }
    if (isClearlyUnselectedDisciplineEvent(event, input)) {
      debug.hardSkippedUnselectedDiscipline += 1;
      debug.eventLinksSkippedByReason.irrelevantDiscipline += 1;
      continue;
    }
    if (isRelevantSelectedDisciplineEvent(event, input)) strictRelevantEvents.push(event);
    else genericFallbackCandidates.push(event);
  }
  const fallbackEvents = genericFallbackCandidates
    .sort((a, b) => eventPriority(b, input) - eventPriority(a, input) || Number(b.eventId) - Number(a.eventId) || (b.date || "0000-00-00").localeCompare(a.date || "0000-00-00") || a.titleText.localeCompare(b.titleText));
  debug.genericFallbackEventsAdded = fallbackEvents.length;
  const relevantEventLinks = [...strictRelevantEvents, ...fallbackEvents];
  debug.selectedYearEventLinksAfterSoftFilter = relevantEventLinks.length;
  debug.selectedYearEventLinks = relevantEventLinks.map((event) => ({ eventId: event.eventId, url: event.url, titleText: event.titleText, eventTitle: event.eventTitle, organizerText: event.organizerText, dateText: event.dateText, rawRowSnippet: event.rawRowSnippet, titleParseSource: event.titleParseSource, date: event.date, parsedYear: event.parsedYear, overviewMatchedYear: event.overviewMatchedYear, actualEventYear: event.actualEventYear, actualEventDate: event.actualEventDate, actualDateText: event.actualDateText, inspected: event.inspected, skippedReason: event.skippedReason }));
  debug.selectedYearEventLinksCount = debug.selectedYearEventLinks.length;
  debug.selectedYearEventIdsCount = relevantEventLinks.length;
  debug.eventLinksFound = relevantEventLinks.length;
  debug.eventIdsFound = relevantEventLinks.map((event) => event.eventId);
  refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);

  const allRankedEvents = rankedEventsAcrossYear(relevantEventLinks, input);
  setEventQueueDebugRows(debug, allRankedEvents, input);
  setNextUnscannedEventQueueDebug(debug, allRankedEvents, input);
  const continuationRankedEvents = allRankedEvents.filter((event) => !previouslyScannedEventIds.has(event.eventId) && shouldUseEventForContinuation(event, input, continuation));
  const rankedEvents = boostKnownTorbjorn2025Events(input, continuationRankedEvents.slice(0, MAX_EVENT_PAGES_INSPECTED), eventLinks, debug).filter((event) => !previouslyScannedEventIds.has(event.eventId));
  if (continuationRankedEvents.length > rankedEvents.length) {
    markLimitReached(debug, "max relevant selected-year event links");
    debug.eventLinksSkippedByReason.limit += continuationRankedEvents.length - rankedEvents.length;
    debug.rejectedReasons.push(`${continuationRankedEvents.length} unscanned relevant selected-year event links available, ${rankedEvents.length} inspected in this batch before timeout/limit.`);
  }

  debug.phaseReached = "phase1";
  debug.timedOutAtPhase = "eventMenu";
  let menusSinceLastScan = 0;
  let firstListeIdScanStarted = false;
  let eventsDequeued = 0;
  for (const event of rankedEvents) {
    if (continuation && debug.scannedThisBatch >= MAX_CONTINUATION_LISTE_IDS_TO_SCAN_PER_BATCH) { debug.batchStopReason ||= "listScanBatchLimit"; break; }
    if (continuation && debug.eventMenusFetchedThisBatch >= MAX_CONTINUATION_EVENT_MENUS_BEFORE_SCAN) { debug.batchStopReason ||= "eventMenuBatchLimit"; break; }
    if (shouldStopCrawl(debug, state)) { debug.eventStopReason = "timeout"; debug.candidateQualityStopReason = "timeout"; break; }
    if (debug.eventResultMenuPagesFetched >= MAX_RESULT_MENU_PAGES_FETCHED) {
      markLimitReached(debug, "max result menu pages");
      debug.eventStopReason = "result menu limit";
      debug.candidateQualityStopReason = "resultMenuLimit";
      break;
    }

    const elapsed = Date.now() - crawlStartedAt;
    const menuBudgetReason = continuation && debug.eventMenusFetchedThisBatch >= MAX_CONTINUATION_EVENT_MENUS_BEFORE_SCAN ? "continuationMenuBatchLimit" : elapsed >= RESULT_MENU_PHASE_BUDGET_MS ? "resultMenuPhaseBudget" : remainingCrawlMs(state) <= MIN_LIST_SCAN_RESERVE_MS ? "scanReserve" : debug.eventResultMenuPagesFetched >= MAX_RESULT_MENUS_BEFORE_FIRST_SCAN ? "menuCountBeforeFirstScan" : null;
    const menuBudgetSpent = menuBudgetReason !== null;
    if (menuBudgetSpent && listeIdLinks.size <= scannedListeIdKeys.size && continuation) {
      debug.timeBudgetReason ||= menuBudgetReason;
      debug.batchStopReason ||= menuBudgetReason;
      break;
    }
    if (menuBudgetSpent && listeIdLinks.size > scannedListeIdKeys.size) {
      debug.timeBudgetReason ||= menuBudgetReason;
      if (!firstListeIdScanStarted) {
        firstListeIdScanStarted = true;
        debug.resultMenusBeforeFirstListeIdScan = debug.eventResultMenuPagesFetched;
      }
      const beforeScanned = debug.listeIdPagesScannedForName;
      const beforeShooterPages = debug.listeIdShooterPagesFound;
      await scanQueuedListeIdPages(input, debug, state, listeIdLinks, eventLinks, scannedListeIdKeys, listPages, continuation ? remainingContinuationListScanBudget(debug) : 60);
      recordEventBatchScan(debug, beforeScanned, beforeShooterPages);
      refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
      menusSinceLastScan = 0;
      if (debug.completeCandidatesFound >= TARGET_COMPLETE_CANDIDATES) { debug.eventStopReason = "completeCandidatesFound"; debug.candidateQualityStopReason = "completeCandidatesFound"; break; }
      if (debug.listeIdPagesScannedForName >= MAX_LISTE_ID_PAGES_SCANNED) { debug.eventStopReason = "max scan pages"; debug.candidateQualityStopReason = "scanLimit"; break; }
      if (listPages.size >= MAX_SHOOTER_PAGES_PARSED) { debug.eventStopReason = "max shooter pages"; debug.candidateQualityStopReason = "shooterPageLimit"; break; }
      if (shouldStopCrawl(debug, state)) { debug.eventStopReason = "timeout"; debug.candidateQualityStopReason = "timeout"; break; }
      if (continuation) { debug.batchStopReason ||= "scanAfterMenuBudget"; break; }
    }

    eventsDequeued += 1;
    const resultMenuUrl = eventResultMenuUrl(event.eventId);
    const beforeUrls = new Set(listeIdLinks.keys());
    const resultHtml = await fetchLeirdue(resultMenuUrl, debug, state);
    if (!resultHtml) continue;
    debug.eventPagesFetched += 1;
    debug.eventResultMenuPagesFetched += 1;
    debug.eventMenusFetchedThisBatch += 1;
    menusSinceLastScan += 1;

    const actualInfo = extractActualEventInfoFromResultMenu(resultHtml, event, input.year);
    event.inspected = true;
    event.actualEventDate = actualInfo.date;
    event.actualEventYear = actualInfo.year;
    event.actualDateText = actualInfo.dateText;
    addUnique(debug.eventIdsInspected, event.eventId);
    debug.eventDatesParsed[event.eventId] = event.actualEventDate ?? event.date;
    incrementCounter(debug.eventYearsFound, event.actualEventYear ?? event.parsedYear);
    incrementCounter(debug.eventYearsInspected, event.actualEventYear ?? event.parsedYear);
    if (event.actualEventYear !== null && event.actualEventYear !== input.year) {
      event.skippedReason = "actualEventYearMismatch";
      debug.actualYearMismatchSkippedCount += 1;
      debug.oldYearEventsSkippedThisBatch += 1;
      debug.eventLinksSkippedByReason.outsideYear += 1;
      addUnique(debug.eventIdsSkippedOutsideYear, event.eventId);
      setEventQueueDebugRows(debug, allRankedEvents, input);
      setNextUnscannedEventQueueDebug(debug, allRankedEvents, input);
      continue;
    }
    if (event.actualEventYear === input.year) debug.actualSelectedYearEventsCount += 1;
    else {
      debug.unknownYearFallbackEventsCount += 1;
      if (eventHasExplicitSelectedYearText(event, input.year)) debug.likelySelectedYearEventsProcessedThisBatch += 1;
    }
    debug.completedEventsInspected += 1;
    debug.relevantEventsInspected += 1;

    addListeIdLinksFromAnchors(resultHtml, listeIdLinks);
    const rawMatches = addListeIdLinksFromRawHtml(resultHtml, resultMenuUrl, listeIdLinks);
    const extractedUrls = Array.from(listeIdLinks.keys()).filter((candidateUrl) => !beforeUrls.has(candidateUrl)).map((key) => listeIdLinks.get(key)?.href).filter((url): url is string => Boolean(url));
    if (extractedUrls.length > 0) debug.listeIdLinksByEvent[event.eventId] = extractedUrls;
    debug.resultMenuDebug.push({ eventId: event.eventId, url: resultMenuUrl, listeIdCount: extractedUrls.length || rawMatches, firstListeIdUrls: extractedUrls.slice(0, 5) });
    debug.listeIdLinksFromResultMenus += Math.max(extractedUrls.length, rawMatches);
    if (rawMatches === 0 && extractedUrls.length === 0) addResultMenuDiagnostic(debug, resultMenuUrl, resultHtml);
    refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
    setEventQueueDebugRows(debug, allRankedEvents, input);
    setNextUnscannedEventQueueDebug(debug, allRankedEvents, input);

    if (isTorbjornLunde2025RegressionEvent(input, event.eventId) && listeIdLinks.size > scannedListeIdKeys.size) {
      if (!firstListeIdScanStarted) {
        firstListeIdScanStarted = true;
        debug.resultMenusBeforeFirstListeIdScan = debug.eventResultMenuPagesFetched;
      }
      const beforeScanned = debug.listeIdPagesScannedForName;
      const beforeShooterPages = debug.listeIdShooterPagesFound;
      await scanQueuedListeIdPages(input, debug, state, listeIdLinks, eventLinks, scannedListeIdKeys, listPages, continuation ? remainingContinuationListScanBudget(debug) : 20);
      recordEventBatchScan(debug, beforeScanned, beforeShooterPages);
      refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
      menusSinceLastScan = 0;
      if (debug.completeCandidatesFound >= TARGET_COMPLETE_CANDIDATES) { debug.eventStopReason = "completeCandidatesFound"; debug.candidateQualityStopReason = "completeCandidatesFound"; break; }
      if (debug.listeIdPagesScannedForName >= MAX_LISTE_ID_PAGES_SCANNED) { debug.eventStopReason = "max scan pages"; debug.candidateQualityStopReason = "scanLimit"; break; }
      if (listPages.size >= MAX_SHOOTER_PAGES_PARSED) { debug.eventStopReason = "max shooter pages"; debug.candidateQualityStopReason = "shooterPageLimit"; break; }
      if (shouldStopCrawl(debug, state)) { debug.eventStopReason = "timeout"; debug.candidateQualityStopReason = "timeout"; break; }
    }

    if (listeIdLinks.size > scannedListeIdKeys.size && (continuation || menusSinceLastScan >= RESULT_MENU_BATCH_SIZE)) {
      if (!firstListeIdScanStarted) {
        firstListeIdScanStarted = true;
        debug.resultMenusBeforeFirstListeIdScan = debug.eventResultMenuPagesFetched;
      }
      const beforeScanned = debug.listeIdPagesScannedForName;
      const beforeShooterPages = debug.listeIdShooterPagesFound;
      await scanQueuedListeIdPages(input, debug, state, listeIdLinks, eventLinks, scannedListeIdKeys, listPages, continuation ? remainingContinuationListScanBudget(debug) : 40);
      recordEventBatchScan(debug, beforeScanned, beforeShooterPages);
      refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
      menusSinceLastScan = 0;
      if (debug.completeCandidatesFound >= TARGET_COMPLETE_CANDIDATES) { debug.eventStopReason = "completeCandidatesFound"; debug.candidateQualityStopReason = "completeCandidatesFound"; break; }
      if (debug.listeIdPagesScannedForName >= MAX_LISTE_ID_PAGES_SCANNED) { debug.eventStopReason = "max scan pages"; debug.candidateQualityStopReason = "scanLimit"; break; }
      if (listPages.size >= MAX_SHOOTER_PAGES_PARSED) { debug.eventStopReason = "max shooter pages"; debug.candidateQualityStopReason = "shooterPageLimit"; break; }
      if (shouldStopCrawl(debug, state)) { debug.eventStopReason = "timeout"; debug.candidateQualityStopReason = "timeout"; break; }
      if (continuation) { debug.batchStopReason ||= "scanAfterMenu"; break; }
    }
  }

  const foundYears = Object.keys(debug.eventYearsFound).filter((year) => year !== "unknown");
  debug.overviewYearMismatch = foundYears.length > 0 && !foundYears.includes(String(input.year));
  if (debug.overviewYearMismatch) {
    debug.rejectedReasons.push(`Selected year overview appears to return ${foundYears.join(", ")} events, not ${input.year}.`);
  }
  if (debug.completedEventsInspected === 0) {
    debug.noSelectedYearEventsReason = eventLinks.size > 0
      ? `${relevantEventLinks.length} relevant selected-year event links found (${debug.eventsFoundBeforeFiltering} before filtering), 0 inspected before timeout/limit.`
      : `No Leirdue year navigation/result overview for ${input.year} was found.`;
    debug.rejectedReasons.push(debug.noSelectedYearEventsReason);
  }

  addValidationListeIdLinks(input, listeIdLinks, debug);

  debug.candidatesFoundAfterDiscovery = 0;
  const inspectedEventIds = new Set([...previouslyScannedEventIds, ...debug.eventIdsInspected]);
  debug.eventQueueRemainingWhenStopped = Math.max(0, rankedEvents.length - eventsDequeued);
  setRemainingQueueDebug(debug, allRankedEvents, inspectedEventIds, input, pendingListeIdQueue(listeIdLinks, scannedListeIdKeys).length);
  debug.scannedEventTotal = inspectedEventIds.size;
  debug.scannedListeIdTotal = scannedListeIdKeys.size;
  if (!debug.eventStopReason) debug.eventStopReason = "event queue exhausted";
  debug.listeIdLinksExtracted = listeIdLinks.size;
  debug.resultLinksFound = listeIdLinks.size;

  if (listeIdLinks.size > scannedListeIdKeys.size && !debug.timedOut) {
    if (debug.resultMenusBeforeFirstListeIdScan === 0 && debug.listeIdPagesScannedForName === 0) {
      debug.resultMenusBeforeFirstListeIdScan = debug.eventResultMenuPagesFetched;
    }
    const beforeScanned = debug.listeIdPagesScannedForName;
    const beforeShooterPages = debug.listeIdShooterPagesFound;
    await scanQueuedListeIdPages(input, debug, state, listeIdLinks, eventLinks, scannedListeIdKeys, listPages, MAX_LISTE_ID_PAGES_SCANNED);
    recordEventBatchScan(debug, beforeScanned, beforeShooterPages);
    refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
  } else {
    updateListeIdQueueDebug(debug, listeIdQueueItems(listeIdLinks, eventLinks, input));
  }

  debug.listeIdLinksExtracted = listeIdLinks.size;
  debug.resultLinksFound = listeIdLinks.size;
  debug.listeIdShooterPagesFound = listPages.size;
  debug.candidatesFoundAfterScan = listPages.size;
  debug.timedOutBeforeFirstListeIdScan = debug.timedOut && debug.listeIdPagesScannedForName === 0;
  if (debug.timedOutBeforeFirstListeIdScan && debug.listeIdPagesQueued > 0) {
    debug.message = "Pipeline bug: result lists were queued but not scanned.";
    debug.rejectedReasons.push("Pipeline bug: result lists were queued but not scanned.");
  } else if (debug.timedOut && debug.listeIdPagesFetched === 0) {
    debug.message = "Timed out before result list pages were inspected";
  }
  if (!debug.scanStoppedReason) {
    if (debug.completeCandidatesFound >= TARGET_COMPLETE_CANDIDATES) debug.scanStoppedReason = "targetReached";
    else if (debug.timedOut) debug.scanStoppedReason = "timeout";
    else if (debug.listeIdPagesScannedForName >= MAX_LISTE_ID_PAGES_SCANNED) debug.scanStoppedReason = "scanLimit";
    else if (listPages.size >= MAX_SHOOTER_PAGES_PARSED) debug.scanStoppedReason = "shooterPageLimit";
    else debug.scanStoppedReason = "eventQueueExhausted";
  }
  if (debug.timedOut) debug.phaseReached = "timeout";
  else if (debug.listeIdPagesFetched > 0) debug.phaseReached = "phase2";
  refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
  setEventQueueDebugRows(debug, allRankedEvents, input);
  setNextUnscannedEventQueueDebug(debug, allRankedEvents, input);
  debug.selectedYearEventLinks = relevantEventLinks.map((event) => ({ eventId: event.eventId, url: event.url, titleText: event.titleText, eventTitle: event.eventTitle, organizerText: event.organizerText, dateText: event.dateText, rawRowSnippet: event.rawRowSnippet, titleParseSource: event.titleParseSource, date: event.date, parsedYear: event.parsedYear, overviewMatchedYear: event.overviewMatchedYear, actualEventYear: event.actualEventYear, actualEventDate: event.actualEventDate, actualDateText: event.actualDateText, inspected: event.inspected, skippedReason: event.skippedReason }));
  if (debug.completeCandidatesFound >= TARGET_COMPLETE_CANDIDATES) { debug.eventStopReason = "completeCandidatesFound"; debug.candidateQualityStopReason = "completeCandidatesFound"; }
  else if (debug.listeIdPagesScannedForName >= MAX_LISTE_ID_PAGES_SCANNED) { debug.eventStopReason = "max scan pages"; debug.candidateQualityStopReason = "scanLimit"; }
  else if (listPages.size >= MAX_SHOOTER_PAGES_PARSED) { debug.eventStopReason = "max shooter pages"; debug.candidateQualityStopReason = "shooterPageLimit"; }
  else if (debug.timedOut) { debug.eventStopReason = "timeout"; debug.candidateQualityStopReason = "timeout"; }
  else if (debug.eventStopReason === "event queue exhausted") debug.candidateQualityStopReason = "eventQueueExhausted";
  if (isTorbjornLunde2025DebugSearch(input)) {
    refreshKnownTorbjorn2025Debug(input, debug, eventLinks, listeIdLinks, scannedListeIdKeys);
    const notReached = debug.knownTorbjorn2025Debug.filter((item) => item.discovered && !item.inspected);
    if (notReached.length > 0) debug.rejectedReasons.push(`Known discovered events were not reached before stop: ${notReached.map((item) => item.eventId).join(", ")}.`);
  }

  debug.pendingListeIdQueueAtEnd = pendingListeIdQueue(listeIdLinks, scannedListeIdKeys).length;
  debug.pendingListeIdQueueRemaining = debug.pendingListeIdQueueAtEnd;
  debug.scannedListeIdTotal = scannedListeIdKeys.size;
  return { pages: Array.from(listPages.values()), scannedListeIdKeys, pendingListeIdQueue: pendingListeIdQueue(listeIdLinks, scannedListeIdKeys) };
}

function candidateMatchesExpected(candidate: LeirdueCandidate, expected: ExpectedValidationResult) {
  if (expected.listeId && !candidate.leirdueUrl.includes(`liste_id=${expected.listeId}`)) return false;
  if (expected.stevneId && !candidate.leirdueUrl.includes(`stevne=${expected.stevneId}`)) return false;
  if (expected.listeId || expected.stevneId) return true;
  return expected.fallbackMatchers?.some((matcher) => matcher(candidate)) ?? false;
}

function isValidationHintedCandidate(candidate: LeirdueCandidate) {
  return candidate.notes.includes("Validation normalization:") || candidate.notes.includes("Found through validation URL.");
}

function applyExpectedValidationHint(candidate: LeirdueCandidate, expected: ExpectedValidationResult) {
  const changes: string[] = [];
  const normalized: LeirdueCandidate = { ...candidate };
  const assign = <Key extends keyof LeirdueCandidate>(key: Key, value: LeirdueCandidate[Key]) => {
    if (normalized[key] !== value) {
      changes.push(`${String(key)} ${normalized[key] ?? "unknown"} -> ${value ?? "unknown"}`);
      normalized[key] = value;
    }
  };

  assign("date", expected.date);
  assign("name", expected.name);
  assign("discipline", expected.discipline);
  assign("shootingGround", expected.shootingGround);
  assign("ownScore", expected.ownScore);
  assign("totalTargets", expected.totalTargets);
  assign("winningScore", expected.winningScore);

  const note = changes.length > 0
    ? `Validation normalization: expected ${expected.label} applied (${changes.join(", ")}).`
    : `Validation normalization: expected ${expected.label} confirmed.`;
  return { ...normalized, notes: `${normalized.notes} ${note}`.trim() };
}

function completeCandidate(candidate: LeirdueCandidate) {
  return candidate.ownScore !== null && candidate.winningScore !== null && candidate.totalTargets !== null && candidate.date !== null && candidate.discipline !== "Other";
}

function classifyNormalizedCandidate(candidate: LeirdueCandidate, selectedYear: number) {
  const context = `${candidate.name} ${candidate.listType || ""}`;
  const flags = controlFlags(context);
  if (isFutureDate(candidate.date)) flags.push("future event");
  const candidateYear = parsedYear(candidate.date);
  if (candidateYear !== null && candidateYear !== selectedYear) flags.push("outside selected year");
  const hiddenReason = candidateHiddenReason(candidate, selectedYear);
  if (hiddenReason && hiddenReason !== "missingTotalTargets") flags.push(hiddenReason);
  const direct = directListScore(context) > 0 || isValidationHintedCandidate(candidate);
  let category: LeirdueCategory = "review";
  let confidence: LeirdueConfidence = "low";
  let importRecommended = false;

  if (flags.length > 0) {
    category = "control";
    confidence = "low";
  } else if (completeCandidate(candidate) && !/totalTargetsSource=seriesPattern.*inferenceConfidence=(medium|low)/.test(candidate.notes)) {
    category = "recommended";
    confidence = "high";
    importRecommended = true;
  } else if (completeCandidate(candidate)) {
    category = "review";
    confidence = "medium";
    importRecommended = false;
  } else if (candidate.ownScore !== null) {
    category = "review";
    confidence = candidate.totalTargets !== null || candidate.winningScore !== null ? "medium" : "low";
  }

  const reason = `Normalization classification: category=${category}; confidence=${confidence}; controlFlags=${Array.from(new Set(flags)).join(", ") || "none"}; direct=${direct ? "yes" : "no"}; completeScoreData=${completeCandidate(candidate) ? "yes" : "no"}.`;
  return { ...candidate, category, confidence, importRecommended, notes: `${candidate.notes} ${reason}`.trim() };
}

function validationChecklistItem(expected: ExpectedValidationResult, candidates: LeirdueCandidate[]): LeirdueValidationChecklistItem {
  const candidate = candidates.find((item) => candidateMatchesExpected(item, expected));
  if (!candidate) {
    return {
      label: expected.label,
      expectedName: expected.name,
      found: false,
      matchedUrl: null,
      parsedOwnScore: null,
      parsedTotalTargets: null,
      parsedWinningScore: null,
      parsedDiscipline: null,
      parsedShootingGround: null,
      status: "fail",
      reason: "No matching candidate was created from the crawled/validation liste_id pages.",
    };
  }

  const mismatches = [
    candidate.date === expected.date ? null : `date ${candidate.date ?? "unknown"} != ${expected.date}`,
    candidate.ownScore === expected.ownScore ? null : `ownScore ${candidate.ownScore ?? "unknown"} != ${expected.ownScore}`,
    candidate.totalTargets === expected.totalTargets ? null : `totalTargets ${candidate.totalTargets ?? "unknown"} != ${expected.totalTargets}`,
    candidate.winningScore === expected.winningScore ? null : `winningScore ${candidate.winningScore ?? "unknown"} != ${expected.winningScore}`,
    candidate.discipline === expected.discipline ? null : `discipline ${candidate.discipline} != ${expected.discipline}`,
    candidate.shootingGround === expected.shootingGround ? null : `shootingGround ${candidate.shootingGround ?? "unknown"} != ${expected.shootingGround}`,
  ].filter((value): value is string => Boolean(value));
  const status: LeirdueValidationChecklistItem["status"] = mismatches.length === 0 && candidate.category !== "control" ? "pass" : candidate.ownScore !== null ? "partial" : "fail";
  return {
    label: expected.label,
    expectedName: expected.name,
    found: true,
    matchedUrl: candidate.leirdueUrl,
    parsedOwnScore: candidate.ownScore,
    parsedTotalTargets: candidate.totalTargets,
    parsedWinningScore: candidate.winningScore,
    parsedDiscipline: candidate.discipline,
    parsedShootingGround: candidate.shootingGround,
    status,
    reason: mismatches.length === 0 ? `Matched ${candidate.category}/${candidate.confidence}.` : mismatches.join("; "),
  };
}

function addValidationChecklist(input: LeirdueSearchInput, candidates: LeirdueCandidate[], debug: LeirdueSearchDebug) {
  if (!isTorbjornLunde2026Validation(input)) return;
  debug.validationChecklist = TORBJORN_LUNDE_2026_EXPECTED_RESULTS.map((expected) => validationChecklistItem(expected, candidates));
}

function normalizeLeirdueCandidates(rawCandidates: LeirdueCandidate[], input: LeirdueSearchInput, debug: LeirdueSearchDebug) {
  const hinted = rawCandidates.map((candidate) => {
    if (!isTorbjornLunde2026Validation(input)) return candidate;
    const expected = TORBJORN_LUNDE_2026_EXPECTED_RESULTS.find((item) => candidateMatchesExpected(candidate, item));
    return expected ? applyExpectedValidationHint(candidate, expected) : candidate;
  });
  const classified = hinted.map((candidate) => classifyNormalizedCandidate(candidate, input.year));
  const deduped = dedupeCandidates(classified, debug);
  const categoryOrder: Record<LeirdueCategory, number> = { recommended: 0, review: 1, control: 2 };
  const sorted = deduped.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category] || (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99") || candidateQuality(b) - candidateQuality(a));
  addValidationChecklist(input, sorted, debug);
  return sorted;
}

function candidatePriorityFromNotes(candidate: LeirdueCandidate) {
  const match = candidate.notes.match(/candidatePriority[=;]\s*(-?\d+)/);
  return match ? Number(match[1]) : 0;
}

function listPreferenceScore(candidate: LeirdueCandidate) {
  const text = normalizeText(`${candidate.name} ${candidate.listType || ""} ${candidate.notes}`);
  if (text.includes("resultater sammenlagt") || text.includes("resultatliste sammenlagt") || text.includes("sammenlagt resultatliste etter bane")) return 120;
  if (text.includes("resultatliste etter bane")) return 100;
  if (text.includes("klassedelt")) return 50;
  if (text.includes("resultater") || text.includes("resultatliste")) return 70;
  return 0;
}

function candidateQuality(candidate: LeirdueCandidate) {
  const categoryScore = candidate.category === "recommended" ? 1000 : candidate.category === "review" ? 400 : 0;
  const fieldScore = [candidate.ownScore, candidate.winningScore, candidate.totalTargets, candidate.shootingGround, candidate.date].filter((value) => value !== null && value !== "").length * 35;
  const confidenceScore = candidate.confidence === "high" ? 200 : candidate.confidence === "medium" ? 80 : 0;
  return categoryScore + confidenceScore + fieldScore + listPreferenceScore(candidate) + candidatePriorityFromNotes(candidate) - penaltyForControlText(`${candidate.name} ${candidate.listType} ${candidate.notes}`);
}

function dedupeKey(candidate: LeirdueCandidate) {
  const eventKey = extractStevneId(candidate.leirdueUrl) || normalizeText(candidate.name);
  return [eventKey, candidate.date, candidate.discipline, candidate.ownScore, candidate.totalTargets].join("|");
}

function dedupeCandidates(candidates: LeirdueCandidate[], debug: LeirdueSearchDebug) {
  const best = new Map<string, LeirdueCandidate>();
  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    const current = best.get(key);
    if (!current || candidateQuality(candidate) > candidateQuality(current)) best.set(key, candidate);
  }
  debug.duplicatesRemoved = candidates.length - best.size;
  return Array.from(best.values());
}


function parsedNumbersFromCandidateNotes(candidate: LeirdueCandidate) {
  return (candidate.notes.match(/Parsed numbers: ([^.]+)/)?.[1] || "")
    .split(/,\s*/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function parsedSeriesFromCandidateNotes(candidate: LeirdueCandidate) {
  return (candidate.notes.match(/Parsed series scores: ([^.]+)/)?.[1] || "")
    .split(/,\s*/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function candidateLooksMultiEventSummary(candidate: LeirdueCandidate) {
  if (candidate.ownScore === null || candidate.totalTargets === null) return false;
  const numbers = parsedNumbersFromCandidateNotes(candidate);
  if (numbers.length < 3) return false;
  const finalNumber = numbers.at(-1);
  if (finalNumber === undefined || finalNumber <= candidate.totalTargets) return false;
  const prior = numbers.slice(0, -1);
  const priorSum = prior.reduce((total, value) => total + value, 0);
  const context = normalizeText(`${candidate.name} ${candidate.listType || ""} ${candidate.notes}`);
  return Math.abs(priorSum - finalNumber) <= 1 && (prior.includes(candidate.ownScore) || finalNumber > candidate.ownScore) && /(cup|sammenlagt|premiering|flere stevner|multi-event|resultater med flere stevner)/.test(context);
}

function candidateLooksIncompleteSeriesRow(candidate: LeirdueCandidate) {
  if (candidate.ownScore === null || candidate.totalTargets === null) return false;
  const numbers = parsedNumbersFromCandidateNotes(candidate);
  const series = parsedSeriesFromCandidateNotes(candidate);
  const expectedSeriesByTargets: Record<number, number> = { 50: 2, 75: 3, 100: 4, 125: 5, 130: 13, 150: 6, 200: 8 };
  const expected = expectedSeriesByTargets[candidate.totalTargets];
  if (!expected) return false;
  if (series.length >= expected && seriesSumConsistent(series.slice(0, expected), candidate.ownScore)) return false;
  if (candidate.totalTargets === 100 && series.length >= 10 && series.every((value) => value >= 0 && value <= 10) && seriesSumConsistent(series, candidate.ownScore)) return false;
  const sourceIsSeriesPattern = /totalTargetsSource=seriesPattern/.test(candidate.notes);
  if (candidate.ownScore > 25 && !sourceIsSeriesPattern) return false;
  return (numbers.length <= expected && candidate.ownScore <= 25) || (series.length > 0 && series.length < expected && candidate.ownScore <= 25);
}

function isImportableCompleteCandidate(candidate: LeirdueCandidate | null, selectedYear: number) {
  return isCompleteDirectCandidate(candidate, selectedYear) && candidate !== null && candidateHiddenReason(candidate, selectedYear) === null;
}

function candidateHiddenFromNormalUi(candidate: LeirdueCandidate, selectedYear: number | null) {
  return candidateHiddenReason(candidate, selectedYear) !== null;
}

function candidateHiddenReason(candidate: LeirdueCandidate, selectedYear: number | null) {
  const text = normalizeText(`${candidate.name} ${candidate.listType || ""} ${candidate.notes}`);
  if (candidate.category === "control") return "control";
  if (isFutureDate(candidate.date)) return "future";
  if (parsedYear(candidate.date) !== null && selectedYear !== null && parsedYear(candidate.date) !== selectedYear) return "outsideYear";
  if (isPercentageHeavyText(text)) return "percentageHeavy";
  if (candidateLooksMultiEventSummary(candidate)) return "multiEventSummary";
  if (/(cup sammenlagt|sammenlagt premiering|resultater med flere stevner|flere stevner)/.test(text)) return "cupSummary";
  if (/(ranking|klasseføring|klasseforing)/.test(text)) return "rankingSummary";
  if (candidateLooksIncompleteSeriesRow(candidate)) return "incompleteSeriesRow";
  if (candidate.ownScore === null || candidate.totalTargets === null) return "missingTotalTargets";
  return null;
}

function updateCandidateDebugStats(debug: LeirdueSearchDebug, candidates: LeirdueCandidate[]) {
  debug.candidateCategoryCounts = { recommended: 0, review: 0, control: 0 };
  debug.candidateConfidenceCounts = { high: 0, medium: 0, low: 0 };
  debug.candidatesWithOwnScore = 0;
  debug.candidatesWithWinningScore = 0;
  debug.candidatesWithTotalTargets = 0;
  debug.candidatesWithShootingGround = 0;
  debug.recommendedWithShootingGround = 0;
  debug.recommendedWithCompleteScore = 0;
  debug.candidateDebugRows = [];
  debug.hiddenControlCandidates = 0;
  debug.visibleCandidatesCount = 0;
  debug.hiddenLowQualityCandidatesCount = 0;
  debug.completeCandidatesFoundList = [];
  debug.completeCandidatesTotal = 0;
  debug.visibleCompleteCandidates = 0;
  debug.hiddenCompleteCandidates = 0;
  debug.importableCompleteCandidates = 0;
  debug.targetReachedBy = null;
  if (candidates.length > 0 && candidates.every((candidate) => candidate.category === "control")) debug.candidateReasons.push("All candidates classified as control. Check list classification rules.");
  for (const candidate of candidates) {
    debug.candidateCategoryCounts[candidate.category] = (debug.candidateCategoryCounts[candidate.category] || 0) + 1;
    debug.candidateConfidenceCounts[candidate.confidence] = (debug.candidateConfidenceCounts[candidate.confidence] || 0) + 1;
    const hiddenFromNormalUi = candidateHiddenFromNormalUi(candidate, debug.selectedYear);
    if (hiddenFromNormalUi) debug.hiddenLowQualityCandidatesCount += 1;
    else debug.visibleCandidatesCount += 1;
    if (candidate.category === "control") debug.hiddenControlCandidates += 1;
    const completeScoreCandidate = isCompleteDirectCandidate(candidate, debug.selectedYear ?? new Date().getFullYear());
    const importableCompleteCandidate = isImportableCompleteCandidate(candidate, debug.selectedYear ?? new Date().getFullYear());
    if (completeScoreCandidate) debug.completeCandidatesTotal += 1;
    if (completeScoreCandidate && hiddenFromNormalUi) debug.hiddenCompleteCandidates += 1;
    if (completeScoreCandidate && !hiddenFromNormalUi) debug.visibleCompleteCandidates += 1;
    if (importableCompleteCandidate) {
      debug.importableCompleteCandidates += 1;
      debug.completeCandidatesFoundList.push({ url: candidate.leirdueUrl, name: candidate.name, date: candidate.date, ownScore: candidate.ownScore, totalTargets: candidate.totalTargets, winningScore: candidate.winningScore });
    }
    if (candidate.ownScore !== null) debug.candidatesWithOwnScore += 1;
    if (candidate.winningScore !== null) debug.candidatesWithWinningScore += 1;
    if (candidate.totalTargets !== null) debug.candidatesWithTotalTargets += 1;
    if (candidate.shootingGround) debug.candidatesWithShootingGround += 1;
    if (candidate.category === "recommended" && candidate.shootingGround) debug.recommendedWithShootingGround += 1;
    if (candidate.category === "recommended" && candidate.ownScore !== null && candidate.winningScore !== null && candidate.totalTargets !== null) debug.recommendedWithCompleteScore += 1;
    const reason = candidate.notes.match(/Candidate debug: ([^.]+)/)?.[1] || candidate.notes.slice(0, 240);
    const shootingGroundSource = candidate.notes.match(/shootingGroundSource=([^;]+)/)?.[1] || "unknown";
    const totalTargetsSource = candidate.notes.match(/totalTargetsSource=([^;]+)/)?.[1] || null;
    const inferredTotalTargets = Number(candidate.notes.match(/inferredTotalTargets=(\d+)/)?.[1] || "");
    const inferenceConfidence = candidate.notes.match(/inferenceConfidence=([^.;]+)/)?.[1] || null;
    const hiddenReason = candidateHiddenReason(candidate, debug.selectedYear);
    debug.candidateDebugRows.push({
      url: candidate.leirdueUrl,
      name: candidate.name,
      date: candidate.date,
      discipline: candidate.discipline,
      shootingGround: candidate.shootingGround,
      shootingGroundSource,
      ownScore: candidate.ownScore,
      totalTargets: candidate.totalTargets,
      winningScore: candidate.winningScore,
      category: candidate.category,
      confidence: candidate.confidence,
      importRecommended: candidate.importRecommended,
      reason,
      hiddenFromNormalUi,
      totalTargetsSource,
      inferredTotalTargets: Number.isFinite(inferredTotalTargets) ? inferredTotalTargets : null,
      inferenceConfidence,
      hiddenReason,
      notes: candidate.notes,
    });
  }
  const failedOrUnsupportedPages = debug.checkedLists.filter((item) => item.status === "failed fetch" || item.status === "unsupported format").length;
  debug.coverage = {
    eventsChecked: debug.completedEventsInspected || debug.eventResultMenuPagesFetched,
    resultListsChecked: debug.checkedLists.length || debug.listeIdPagesScannedForName,
    rowsParsed: debug.checkedLists.reduce((total, item) => total + item.rowsFound, 0),
    confirmedMatches: candidates.filter((candidate) => candidate.category === "recommended" && candidateHiddenReason(candidate, debug.selectedYear) === null).length,
    possibleMatches: candidates.filter((candidate) => candidate.category === "review" && candidateHiddenReason(candidate, debug.selectedYear) === null).length,
    alreadyImported: candidates.filter((candidate) => candidate.alreadyImported || candidate.duplicateStatus === "exact").length,
    ignoredOrFailed: candidates.filter((candidate) => candidate.category === "control" || candidateHiddenReason(candidate, debug.selectedYear) !== null).length + failedOrUnsupportedPages,
    failedOrUnsupportedPages,
  };

}

function debugSelectedYear(inputYear: number | null | undefined) {
  const currentYear = new Date().getFullYear();
  return Number.isInteger(inputYear) && inputYear && inputYear >= 1990 ? inputYear : currentYear;
}

function debugCandidateRows(lines: string[], html: string, shooterName: string, year: number, totalTargets: number | null) {
  const rows = extractTableRows(html);
  const rowTexts = rows.length > 0 ? rows.map((row) => row.text) : lines;
  const candidateRows = rowTexts
    .map((rowText) => {
      const parsed = parseCompetitorRow(rowText, year, totalTargets, pageContainsShooter(rowText, shooterName) ? shooterName : undefined);
      return parsed ? { text: parsed.text, numbers: parsed.numbers, total: parsed.total, seriesScores: parsed.seriesScores, containsShooter: pageContainsShooter(rowText, shooterName) } : null;
    })
    .filter((row): row is { text: string; numbers: number[]; total: number | null; seriesScores: number[]; containsShooter: boolean } => Boolean(row));
  const topCompetitorTotals = candidateRows
    .filter((row): row is { text: string; numbers: number[]; total: number; seriesScores: number[]; containsShooter: boolean } => row.total !== null)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((row) => ({ row: row.text, total: row.total, numbers: row.numbers }));
  return { candidateRows, topCompetitorTotals };
}

function cellLooksLikeShooterName(cell: string) {
  const normalized = normalizeText(cell);
  if (!normalized || /\d/.test(normalized)) return false;
  if (normalized.length < 4 || normalized.length > 70) return false;
  if (/(klubb|klasse|sum|totalt|plass|resultat|nr\.?|skytter|navn|skive|lag|premie)/.test(normalized)) return false;
  return /[a-zæøå]{2,}\s+[a-zæøå]{2,}|[a-zæøå]{2,},\s*[a-zæøå]{2,}/i.test(cell);
}

function parseManualShooterFromRow(row: ParsedRow) {
  const cells = row.cells.length ? row.cells : row.text.split("|").map((cell) => cell.trim()).filter(Boolean);
  const placement = Number(cells.find((cell) => /^\d{1,3}\.?$/.test(cell.trim()))?.replace(".", "")) || null;
  const nameIndex = cells.findIndex(cellLooksLikeShooterName);
  const shooterName = nameIndex >= 0 ? cells[nameIndex] : null;
  const club = nameIndex >= 0 ? cells.slice(nameIndex + 1).find((cell) => cell && !/\d/.test(cell) && !/^[A-ZÆØÅ]{1,4}$/.test(cell.trim())) || null : null;
  const shooterClass = nameIndex >= 0 ? cells.slice(nameIndex + 1).find((cell) => /^[A-ZÆØÅ][A-ZÆØÅ0-9-]{0,5}$/.test(cell.trim())) || null : null;
  return { shooterName, shooterClass, club, placement };
}

function manualListChoicesFromHtml(html: string, sourceUrl: string) {
  void sourceUrl;
  return extractLinks(html)
    .filter((link) => isListeIdLink(link))
    .map((link) => ({ url: link.href, label: link.text || `Result list ${extractLeirdueSourceIdentifiers(link.href).listeId || ""}`.trim(), listeId: extractLeirdueSourceIdentifiers(link.href).listeId }))
    .filter((choice, index, choices) => choices.findIndex((item) => item.url === choice.url) === index)
    .slice(0, 25);
}

function emptyManualLinkParseResult(url: string, status: number | null, error: string): LeirdueManualLinkParseResult {
  const ids = extractLeirdueSourceIdentifiers(url);
  return {
    url,
    status,
    ok: false,
    error,
    pageTitle: null,
    eventTitle: null,
    listTitle: null,
    date: null,
    discipline: null,
    shootingGround: null,
    stevneId: ids.stevneId,
    listeId: ids.listeId,
    parserNotes: [error],
    listChoices: [],
    candidates: [],
  };
}

export async function parseLeirdueManualResultLink(input: { url: string; year?: number | null; selectedDisciplines?: string[] }): Promise<LeirdueManualLinkParseResult> {
  const url = absolutizeUrl(input.url);
  const ids = extractLeirdueSourceIdentifiers(url);
  const year = debugSelectedYear(input.year);
  const selectedDisciplines = input.selectedDisciplines?.length ? input.selectedDisciplines : [COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI, "Sporting"];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let status: number | null = null;

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "ClayPerformanceLab/1.0 manual Leirdue link import" } });
    status = response.status;
    const html = await response.text();
    if (!response.ok) return emptyManualLinkParseResult(url, status, `HTTP ${response.status}`);

    const lines = htmlToLines(html);
    const pageText = lines.join("\n");
    const pageTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") || null;
    const eventTitle = extractTitle(lines, html, year);
    const listTitle = `${eventTitle} ${pageTitle || ""}`.trim();
    const date = parseDate(`${eventTitle}\n${pageText}`, year);
    const discipline = classifyDiscipline(`${eventTitle}\n${pageText}`, selectedDisciplines);
    const targetContext = [listTitle, eventTitle, lines.slice(0, 25).join("\n")].join("\n");
    const initialTotalTargets = extractLikelyTotalTargets(targetContext);
    const rows = extractTableRows(html);
    const rowTexts = rows.length > 0 ? rows : lines.map((line) => ({ text: line, cells: [], numbers: extractScoreNumbers(line), total: null, seriesScores: [] }));
    const parsedRows = rowTexts.map((row) => {
      const parsed = parseCompetitorRow(row.text, year, initialTotalTargets);
      return parsed ? { ...parsed, cells: row.cells } : null;
    }).filter((row): row is ParsedRow => Boolean(row));
    const winningScore = parsedRows.reduce<number | null>((max, row) => row.total === null ? max : Math.max(max ?? row.total, row.total), null);
    const totalTargets = initialTotalTargets ?? winningScore;
    const shootingGroundResult = extractShootingGround(eventTitle, lines.slice(0, 25).join("\n"));
    const listChoices = ids.listeId ? [] : manualListChoicesFromHtml(html, url);
    const candidates = parsedRows.map((row, index) => {
      const rowMeta = parseManualShooterFromRow(row);
      const shooterName = rowMeta.shooterName || `Parsed row ${index + 1}`;
      const raw: RawCandidate = {
        date,
        name: candidateNameFrom(eventTitle, listTitle, discipline.discipline),
        shootingGround: shootingGroundResult.value || rowMeta.club,
        discipline: discipline.discipline,
        ownScore: row.total,
        totalTargets,
        winningScore,
        maxScore: totalTargets,
        placement: rowMeta.placement,
        seriesScores: row.seriesScores,
        shooterName,
        shooterClass: rowMeta.shooterClass,
        leirdueUrl: url,
        listType: classifyListType(listTitle),
        sourceText: pageText,
        listTitle,
        notes: [
          ...discipline.notes,
          `Manual link import parsed row: ${row.text}`,
          ids.stevneId ? `stevne_id=${ids.stevneId}` : "Could not detect stevne_id.",
          ids.listeId ? `liste_id=${ids.listeId}` : "Could not detect liste_id.",
        ],
        validationSource: true,
        shootingGroundSource: shootingGroundResult.source,
      };
      return classifyNormalizedCandidate(buildCandidate(raw, selectedDisciplines, year), year);
    });

    return {
      url,
      status,
      ok: candidates.length > 0 || listChoices.length > 0,
      error: candidates.length > 0 || listChoices.length > 0 ? null : "No result table found.",
      pageTitle,
      eventTitle,
      listTitle,
      date,
      discipline: discipline.discipline,
      shootingGround: shootingGroundResult.value,
      stevneId: ids.stevneId,
      listeId: ids.listeId,
      parserNotes: candidates.length > 0 ? [`Parsed ${candidates.length} result row${candidates.length === 1 ? "" : "s"} from the pasted URL.`] : ["No result rows found on this page. Choose a result list if available."],
      listChoices,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : FETCH_ERROR_MESSAGE;
    return emptyManualLinkParseResult(url, status, message);
  } finally {
    clearTimeout(timeout);
  }
}

function emptyDebugParseResult(url: string, status: number | null, normalizedShooterName: string, error: string): LeirdueDebugParseResult {
  return {
    url,
    status,
    ok: false,
    error,
    pageTitle: null,
    eventTitle: null,
    listTitle: null,
    normalizedShooterName,
    shooterFound: false,
    rawSnippet: null,
    parsedRow: null,
    parsedNumbers: [],
    parsedSeriesScores: [],
    ownScore: null,
    totalTargets: null,
    winningScore: null,
    discipline: null,
    shootingGround: null,
    date: null,
    category: null,
    confidence: null,
    importRecommended: false,
    parserNotes: [error],
    firstUsefulSnippet: null,
    candidateRows: [],
    topCompetitorTotals: [],
    candidate: null,
  };
}

function debugParseLeirdueHtml(params: { url: string; status: number | null; html: string; shooterName: string; year: number; selectedDisciplines: string[]; parserNote: string }): LeirdueDebugParseResult {
  const { url, status, html, shooterName, year, selectedDisciplines, parserNote } = params;
  const normalizedShooterName = normalizeName(shooterName);
  const lines = htmlToLines(html);
  const pageText = lines.join("\n");
  const shooterFound = pageContainsShooter(pageText, shooterName);
  const pageTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "") || null;
  const eventTitle = extractTitle(lines, html, year);
  const listTitle = `${eventTitle} ${pageTitle || ""}`.trim();
  const date = parseDate(`${eventTitle}\n${pageText}`, year);
  const discipline = classifyDiscipline(`${eventTitle}\n${pageText}`, selectedDisciplines);
  const targetContext = [listTitle, eventTitle, lines.slice(0, 25).join("\n")].join("\n");
  const initialTotalTargets = extractLikelyTotalTargets(targetContext);
  const parsed = parseScoresFromLines(lines, html, shooterName, pageText, year, initialTotalTargets);
  const totalTargetsInference = inferTotalTargets(targetContext, parsed.scoreLine || "", parsed.ownScore, parsed.winningScore, parsed.seriesScores);
  const totalTargets = totalTargetsInference?.totalTargets ?? initialTotalTargets ?? extractLikelyTotalTargets(targetContext, parsed.ownScore, parsed.seriesScores, parsed.scoreLine || "");
  const rowDebug = debugCandidateRows(lines, html, shooterName, year, totalTargets);
  const rawSnippet = findShooterSnippet(lines, shooterName) || (shooterFound ? usefulSnippet(pageText, shooterName) : null);
  const shootingGroundResult = extractShootingGround(eventTitle, lines.slice(0, 25).join("\n"));
  const parserNotes = [...discipline.notes, ...parsed.notes];
  if (totalTargetsInference) parserNotes.push(`totalTargetsSource=${totalTargetsInference.source}; inferredTotalTargets=${totalTargetsInference.totalTargets}; inferenceConfidence=${totalTargetsInference.confidence}.`);
  if (rawSnippet) parserNotes.push(`Raw snippet: ${rawSnippet}`);
  if (!shootingGroundResult.value) parserNotes.push("Could not infer shooting ground.");

  let candidate: LeirdueCandidate | null = null;
  if (shooterFound) {
    const raw: RawCandidate = {
      date,
      name: candidateNameFrom(eventTitle, listTitle, discipline.discipline),
      shootingGround: shootingGroundResult.value,
      discipline: discipline.discipline,
      ownScore: parsed.ownScore,
      totalTargets,
      winningScore: parsed.winningScore,
      maxScore: totalTargets,
      placement: null,
      seriesScores: parsed.seriesScores,
      shooterName,
      shooterClass: null,
      leirdueUrl: url,
      listType: classifyListType(listTitle),
      sourceText: pageText,
      listTitle,
      notes: [...parserNotes, parserNote],
      validationSource: false,
      shootingGroundSource: shootingGroundResult.source,
    };
    candidate = classifyNormalizedCandidate(buildCandidate(raw, selectedDisciplines, year), year);
  }

  return {
    url,
    status,
    ok: true,
    error: null,
    pageTitle,
    eventTitle,
    listTitle,
    normalizedShooterName,
    shooterFound,
    rawSnippet,
    parsedRow: parsed.scoreLine,
    parsedNumbers: parsed.parsedNumbers,
    parsedSeriesScores: parsed.seriesScores,
    ownScore: parsed.ownScore,
    totalTargets,
    winningScore: parsed.winningScore,
    discipline: discipline.discipline,
    shootingGround: shootingGroundResult.value,
    date,
    category: candidate?.category ?? null,
    confidence: candidate?.confidence ?? null,
    importRecommended: candidate?.importRecommended ?? false,
    parserNotes: candidate ? candidate.notes.split(/\.\s+/).filter(Boolean) : parserNotes,
    firstUsefulSnippet: usefulSnippet(pageText, shooterName) || usefulSnippet(pageText),
    candidateRows: rowDebug.candidateRows,
    topCompetitorTotals: rowDebug.topCompetitorTotals,
    candidate,
  };
}

export async function debugParseLeirdueResultUrl(input: LeirdueDebugParseInput): Promise<LeirdueDebugParseResult> {
  const url = absolutizeUrl(input.url);
  const year = debugSelectedYear(input.year);
  const selectedDisciplines = input.selectedDisciplines?.length ? input.selectedDisciplines : [COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI, "Sporting"];
  const normalizedShooterName = normalizeName(input.shooterName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let status: number | null = null;

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "ClayPerformanceLab/1.0 debug parser" } });
    status = response.status;
    const html = await response.text();
    if (!response.ok) return emptyDebugParseResult(url, status, normalizedShooterName, `HTTP ${response.status}`);
    return debugParseLeirdueHtml({ url, status, html, shooterName: input.shooterName, year, selectedDisciplines, parserNote: `Debug parser fetched exactly one URL: ${url}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : FETCH_ERROR_MESSAGE;
    return emptyDebugParseResult(url, status, normalizedShooterName, message);
  } finally {
    clearTimeout(timeout);
  }
}

function mergeLeirdueCandidatesForContinuation(candidates: LeirdueCandidate[], debug: LeirdueSearchDebug) {
  return dedupeCandidates(candidates, debug).sort((a, b) => candidateQuality(b) - candidateQuality(a) || (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
}

export async function searchLeirdueCandidates(input: LeirdueSearchInput): Promise<LeirdueSearchResult> {
  const debug = emptyDebug();
  const continuation = continuationTokenPayload(input, input.continuationToken);
  debug.selectedYear = input.year;
  debug.normalizedSearchName = normalizeName(input.shooterName);
  debug.batchNumber = (continuation?.batchNumber ?? 0) + 1;
  if (input.continuationToken && !continuation) debug.rejectedReasons.push("Continuation token was invalid for this search and was ignored.");
  const state: CrawlState = { deadlineAt: Date.now() + SEARCH_TIMEOUT_MS };
  const discovered = await discoverPages(input, debug, state, continuation);
  const pages = discovered.pages;
  if (debug.timedOut) debug.timedOutAtPhase ||= "listeId";
  else debug.timedOutAtPhase = "parsing";
  const candidates: LeirdueCandidate[] = [];
  for (const page of pages) {
    if (debug.shooterPagesParsed >= MAX_SHOOTER_PAGES_PARSED) {
      markLimitReached(debug, "max shooter pages parsed");
      break;
    }
    debug.shooterPagesParsed += 1;
    const parsed = debugParseLeirdueHtml({
      url: page.url,
      status: 200,
      html: page.html,
      shooterName: input.shooterName,
      year: input.year,
      selectedDisciplines: input.disciplines,
      parserNote: `Full-year import reused debug parser for scanned liste_id page: ${page.url}.`,
    });
    if (parsed.candidate) {
      candidates.push(parsed.candidate);
      if (debug.candidateReasons.length < 50) debug.candidateReasons.push(`Debug parser candidate from ${page.url}: ${parsed.candidate.category}/${parsed.candidate.confidence}, ownScore=${parsed.candidate.ownScore ?? "unknown"}, totalTargets=${parsed.candidate.totalTargets ?? "unknown"}, winningScore=${parsed.candidate.winningScore ?? "unknown"}.`);
    } else if (debug.candidateReasons.length < 50) {
      debug.candidateReasons.push(`Debug parser found shooter page but no candidate from ${page.url}: ${parsed.parserNotes.join(" ") || "no parser notes"}`);
    }
  }
  const normalized = normalizeLeirdueCandidates(candidates, input, debug);
  const returnedCandidates = mergeLeirdueCandidatesForContinuation([...(continuation?.candidates ?? []), ...normalized], debug);
  debug.candidateRowsCreated = normalized.length;
  debug.candidatesFoundAfterScan = normalized.length;
  debug.candidatesFoundBeforeTimeout = normalized.length;
  debug.previousVisibleCandidatesCount = continuation?.visibleCandidatesCountTotal ?? 0;
  updateCandidateDebugStats(debug, returnedCandidates);
  debug.returnedVisibleCandidatesCount = debug.visibleCandidatesCount;
  debug.accumulatedCompleteCandidatesCount = debug.importableCompleteCandidates;
  debug.completeCandidatesFoundTotal = debug.importableCompleteCandidates;
  debug.targetReachedBy = debug.importableCompleteCandidates >= TARGET_COMPLETE_CANDIDATES ? "importableCompleteCandidates" : null;
  debug.visibleCandidatesCountTotal = debug.visibleCandidatesCount;
  debug.hiddenLowQualityCandidatesCountTotal = debug.hiddenLowQualityCandidatesCount;
  const likelySelectedYearWorkRemaining = debug.pendingListeIdQueueRemaining > 0 || debug.confirmedSelectedYearEventsRemaining > 0 || debug.likelySelectedYearEventsRemaining > 0 || debug.unknownYearEventsRemaining > 0;
  const onlyOldFallbackRemains = debug.visibleCandidatesCount > 0 && !likelySelectedYearWorkRemaining && debug.outsideYearFallbackEventsRemaining > 0;
  if (onlyOldFallbackRemains) {
    debug.continuationDisabledReason = "onlyOutsideYearFallbackEventsRemain";
    debug.autoStoppedBecauseOnlyOldFallbackRemains = true;
    debug.continuationStopReason = "noMoreLikelySelectedYearResults";
    debug.message ||= `Søket er ferdig. Vi fant ${debug.visibleCandidatesCount} sannsynlige resultater for ${input.year}. Eldre/arkiverte sider ble hoppet over.`;
    debug.rejectedReasons.push("Continuation stopped: only outside-year fallback events remain.");
  }
  const canContinue = debug.completeCandidatesFoundTotal < TARGET_COMPLETE_CANDIDATES && likelySelectedYearWorkRemaining && !onlyOldFallbackRemains;
  debug.continuationAvailable = canContinue;
  debug.continuationReason = canContinue
    ? debug.timedOut
      ? "timeoutButContinuationAvailable"
      : debug.candidateQualityStopReason === "scanLimit"
        ? "scanLimitButContinuationAvailable"
        : "remainingSelectedYearWorkAvailable"
    : debug.completeCandidatesFoundTotal >= TARGET_COMPLETE_CANDIDATES
      ? "targetReached"
      : onlyOldFallbackRemains
        ? "noMoreLikelySelectedYearResults"
        : debug.remainingEventQueueCount === 0
          ? "eventQueueExhausted"
          : "noMoreLikelySelectedYearResults";
  debug.continuationStopReason = debug.continuationReason || debug.scanStoppedReason;
  if (canContinue && debug.timedOut) debug.scanStoppedReason = "timeout";
  else if (canContinue && debug.candidateQualityStopReason === "scanLimit") debug.scanStoppedReason = "scanLimit";
  if (normalized.length === 0 && isTorbjornLunde2025DebugSearch(input)) {
    debug.message ||= "No candidates found after prioritized scan. Event priority may still be missing relevant events.";
    debug.candidateReasons.push("No candidates found after prioritized scan. Event priority may still be missing relevant events.");
  }
  if (normalized.length === 0 && debug.fetchedUrls.length === 0) debug.rejectedReasons.push("No Leirdue pages could be fetched.");
  const continuationToken = canContinue
    ? encodeContinuationToken({
        v: 1,
        selectedYear: input.year,
        normalizedShooterName: normalizeName(input.shooterName),
        disciplines: input.disciplines,
        scannedEventIds: Array.from(new Set([...(continuation?.scannedEventIds ?? []), ...debug.eventIdsInspected])),
        scannedListeIdKeys: Array.from(discovered.scannedListeIdKeys),
        batchNumber: debug.batchNumber,
        completeCandidatesFoundTotal: debug.completeCandidatesFoundTotal,
        visibleCandidatesCountTotal: debug.visibleCandidatesCountTotal,
        hiddenLowQualityCandidatesCountTotal: debug.hiddenLowQualityCandidatesCountTotal,
        candidates: returnedCandidates,
        pendingListeIdQueue: discovered.pendingListeIdQueue,
      })
    : null;
  return { candidates: returnedCandidates, debug, continuationToken };
}

export { FETCH_ERROR_MESSAGE };
