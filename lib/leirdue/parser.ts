import { COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI } from "@/lib/disciplines";
import type { LeirdueCandidate, LeirdueCategory, LeirdueConfidence, LeirdueSearchDebug, LeirdueSearchResult } from "@/lib/leirdue/types";

const LEIRDUE_BASE_URL = "https://www.leirdue.net/";
const FETCH_ERROR_MESSAGE = "Could not fetch Leirdue results right now.";
const RESULT_LINK_TERMS = ["sammenlagt", "sammenlagt etter bane", "resultatliste sammenlagt", "resultater sammenlagt", "resultater", "resultatliste", "klassedelt"];
const CONTROL_TERMS = ["cup sammenlagt", "uttaksliste", "uttaksstevner", "prosent", "prosentliste", " lag ", " lag/", "team list", "finale", "final", "shoot-off", "shootoff"];
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
};

type Link = { href: string; text: string };
type Page = { url: string; html: string; label: string; kind: "overview" | "event" | "list" };
type ParsedScore = { ownScore: number | null; winningScore: number | null; scoreLine: string | null; notes: string[] };
type RawCandidate = Omit<LeirdueCandidate, "category" | "confidence" | "importRecommended" | "notes"> & {
  sourceText: string;
  listTitle: string;
  notes: string[];
};

function emptyDebug(): LeirdueSearchDebug {
  return {
    fetchedUrls: [],
    eventLinksFound: 0,
    resultLinksFound: 0,
    eventPagesFetched: 0,
    listeIdLinksExtracted: 0,
    listeIdPagesFetched: 0,
    listeIdShooterPagesFound: 0,
    firstListeIdUrlsInspected: [],
    firstShooterMatchUrls: [],
    listInspectionLimitReached: false,
    pagesInspected: 0,
    shooterPagesFound: 0,
    candidateRowsCreated: 0,
    rejectedReasons: [],
    candidateReasons: [],
    firstUsefulSnippet: null,
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    if (href) links.push({ href: absolutizeUrl(href), text });
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

async function fetchLeirdue(url: string, debug: LeirdueSearchDebug) {
  let status: number | null = null;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Clay Performance Lab Leirdue import/1.0", Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    status = response.status;
    const html = await response.text();
    debug.fetchedUrls.push({ url, status, ok: response.ok });
    if (!response.ok) {
      debug.rejectedReasons.push(`${url}: HTTP ${response.status}`);
      return null;
    }
    if (!debug.firstUsefulSnippet) debug.firstUsefulSnippet = usefulSnippet(stripTags(html));
    return html;
  } catch (error) {
    const note = error instanceof Error ? error.message : FETCH_ERROR_MESSAGE;
    debug.fetchedUrls.push({ url, status, ok: false, note });
    debug.rejectedReasons.push(`${url}: ${note}`);
    return null;
  }
}

function classifyDiscipline(text: string, selectedDisciplines: string[]) {
  const normalized = normalizeText(text);
  const notes: string[] = [];
  let discipline = "Other";

  if (/\b(kompakt leirduesti|compact leirduesti|kompaktsti|compaksti|kompak leirduesti|kompakt sporting)\b/.test(normalized)) {
    discipline = KOMPAKT_LEIRDUESTI;
  } else if (/\b(compak sporting|compak)\b/.test(normalized) && /\b(nsf|fitasc|compak|sporting|cup|resultat|stevne|duer|skudd)\b/.test(normalized)) {
    discipline = COMPAK_SPORTING;
  } else if (normalized.includes("leirduesti")) {
    discipline = LEIRDUESTI;
  } else if (normalized.includes("engelsk sporting") || /\bsporting\b/.test(normalized)) {
    discipline = "Sporting";
  } else if (/\btrap\b/.test(normalized)) {
    discipline = "Trap";
  } else if (/\bskeet\b/.test(normalized)) {
    discipline = "Skeet";
  } else {
    notes.push("Discipline is uncertain from Leirdue title/page text.");
  }

  if (!selectedDisciplines.includes(discipline)) notes.push(`Discipline ${discipline} was not selected, so review is required.`);
  return { discipline, notes };
}

function classifyListType(text: string) {
  const normalized = ` ${normalizeText(text)} `;
  if (CONTROL_TERMS.some((term) => normalized.includes(term))) return "Control / not imported by default";
  if (RESULT_LINK_TERMS.some((term) => normalized.includes(term))) return "Result list";
  return "Unknown list";
}

function isControlList(text: string) {
  const normalized = ` ${normalizeText(text)} `;
  return CONTROL_TERMS.some((term) => normalized.includes(term));
}

function looksLikeDirectResult(text: string) {
  const normalized = normalizeText(text);
  return RESULT_LINK_TERMS.some((term) => normalized.includes(term)) || /\b\d{1,3}\s+\d{1,3}\s+\d{1,3}\b/.test(normalized);
}

function parseDate(text: string, year: number): string | null {
  const normalized = normalizeText(text);
  const norwegianRange = normalized.match(/(\d{1,2})\.\s*(?:til|og|-|–)\s*(\d{1,2})\.\s*([a-zæøå]+)\s*(\d{4})/);
  if (norwegianRange && MONTHS[norwegianRange[3]]) return `${norwegianRange[4]}-${MONTHS[norwegianRange[3]]}-${norwegianRange[2].padStart(2, "0")}`;
  const norwegian = normalized.match(/(\d{1,2})\.\s*([a-zæøå]+)\s*(\d{4})/);
  if (norwegian && MONTHS[norwegian[2]]) return `${norwegian[3]}-${MONTHS[norwegian[2]]}-${norwegian[1].padStart(2, "0")}`;
  const range = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](?:\d{2,4})?\s*[-–]\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (range) {
    const endYear = Number(range[5].length === 2 ? `20${range[5]}` : range[5]);
    return `${endYear}-${range[4].padStart(2, "0")}-${range[3].padStart(2, "0")}`;
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

function extractLikelyTotalTargets(text: string, score?: number | null) {
  const normalized = normalizeText(text);
  const explicit = normalized.match(/\b(50|75|100|125|150|175|200)\s*(?:sk|skudd|duer|targets|mal|mål)\b/);
  if (explicit) return Number(explicit[1]);
  const standalone = Array.from(normalized.matchAll(/\b(50|75|100|125|150|175|200)\b/g)).map((match) => Number(match[1]));
  const plausible = standalone.filter((total) => !score || total >= score);
  if (plausible.length > 0) return plausible[0];
  if (!score) return null;
  if (score <= 50) return 50;
  if (score <= 75) return 75;
  if (score <= 100) return 100;
  if (score <= 150) return 150;
  if (score <= 200) return 200;
  return null;
}

function extractTitle(lines: string[], html: string, year: number) {
  const htmlTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const titleLine = lines.find((line) => line.includes(String(year)) && !/^(oppdatert|copyright|jury|meny|start\s+stevner)/i.test(line) && line.length > 12);
  if (titleLine) return titleLine;
  return htmlTitle && !/^leirdue\.net$/i.test(htmlTitle) ? htmlTitle : "Leirdue result";
}

function extractShootingGround(title: string, text: string) {
  const beforeDate = title.split(/\b\d{1,2}\./)[0]?.trim() || title;
  const titleParts = beforeDate.split(" - ").map((part) => part.trim()).filter(Boolean);
  const maybeGround = titleParts.at(-1);
  if (maybeGround && !/^(\d+\s*(sk|skudd|duer)|lørdag|søndag|saturday|sunday)$/i.test(maybeGround)) return maybeGround;

  const patterns = [
    /(?:arrangør|arrangor|klubb|skytebane|bane|sted)\s*:?\s*([^|·\n\r]{3,60})/i,
    /\b([A-ZÆØÅ][\wÆØÅæøå.&\-/ ]{2,40}\s(?:J\.F\.L\.|J\.F\.F\.|J\.F\.N\.F\.|L\.K\.|JFF|JFL|LK))\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractScoreNumbers(line: string) {
  const normalized = line.replace(/,/g, ".");
  if (/%/.test(normalized)) return [];
  return Array.from(normalized.matchAll(/\b\d{1,3}\b/g)).map((match) => Number(match[0]));
}

function isScoreLine(line: string) {
  const numbers = extractScoreNumbers(line);
  return numbers.length >= 1 && numbers.some((value) => value <= 200) && !/[A-Za-zÆØÅæøå]{4,}/.test(line.replace(/Sum/gi, ""));
}

function likelyFinalScoreFromRow(line: string, year: number) {
  if (/%/.test(line) || line.includes(String(year))) return null;
  const numbers = extractScoreNumbers(line).filter((value) => value <= 200);
  if (numbers.length === 0) return null;
  if (isScoreLine(line) || (/[A-Za-zÆØÅæøå]{3,}/.test(line) && numbers.length >= 2)) return numbers.at(-1) ?? null;
  return null;
}

function findShooterSnippet(lines: string[], shooterName: string) {
  const shooter = normalizeText(shooterName);
  const index = lines.findIndex((line) => normalizeText(line).includes(shooter));
  if (index < 0) return null;
  return lines.slice(Math.max(0, index - 3), index + 7).join(" | ");
}

function parseScoresFromLines(lines: string[], shooterName: string, pageText: string, year: number): ParsedScore {
  const shooter = normalizeText(shooterName);
  const notes: string[] = [];
  let ownScore: number | null = null;
  let scoreLine: string | null = null;
  const allFinalScores: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const rowFinalScore = likelyFinalScoreFromRow(line, year);
    if (rowFinalScore !== null) allFinalScores.push(rowFinalScore);
    if (!normalizeText(line).includes(shooter)) continue;
    const ownLineScore = likelyFinalScoreFromRow(line, year);
    if (ownLineScore !== null) {
      ownScore = ownLineScore;
      scoreLine = line;
      break;
    }
    const nearby = lines.slice(index, index + 7);
    const numeric = nearby.find((candidateLine) => likelyFinalScoreFromRow(candidateLine, year) !== null);
    if (numeric) {
      ownScore = likelyFinalScoreFromRow(numeric, year);
      scoreLine = numeric;
      break;
    }
  }

  if (ownScore === null) {
    const escapedName = shooterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const compactMatch = pageText.match(new RegExp(`${escapedName}[\\s\\S]{0,220}?(\\d{1,3})\\s*/\\s*(\\d{1,3})`, "i"));
    if (compactMatch?.[1]) ownScore = Number(compactMatch[1]);
  }

  if (ownScore === null) notes.push("Shooter name was found, but the parser could not identify a score row.");
  if (allFinalScores.length === 0) notes.push("Could not parse a winning score from this list.");

  return { ownScore, winningScore: allFinalScores.length > 0 ? Math.max(...allFinalScores) : null, scoreLine, notes };
}

function buildCandidate(raw: RawCandidate, selectedDisciplines: string[]): LeirdueCandidate {
  const notes = raw.notes.slice();
  const selectedDiscipline = selectedDisciplines.includes(raw.discipline);
  const context = `${raw.listTitle} ${raw.sourceText}`;
  const control = isControlList(context);
  const direct = looksLikeDirectResult(context);
  const complete = raw.ownScore !== null && raw.totalTargets !== null && raw.winningScore !== null;
  let confidence: LeirdueConfidence = "medium";
  let category: LeirdueCategory = "review";

  if (control) {
    category = "control";
    confidence = "low";
    notes.push("Cup, percentage, selection, team, final/shoot-off, or combined control list; not selected by default.");
  } else if (selectedDiscipline && direct && complete) {
    category = "recommended";
    confidence = notes.length > 0 ? "medium" : "high";
  } else {
    category = "review";
    confidence = complete && selectedDiscipline ? "medium" : "low";
    if (!complete) notes.push("Some score fields could not be parsed; review and edit before importing.");
    if (!direct) notes.push("List type is not clearly a direct competition result.");
  }

  return {
    date: raw.date,
    name: raw.name,
    shootingGround: raw.shootingGround,
    discipline: raw.discipline,
    ownScore: raw.ownScore,
    totalTargets: raw.totalTargets,
    winningScore: raw.winningScore,
    leirdueUrl: raw.leirdueUrl,
    listType: raw.listType,
    confidence,
    notes: Array.from(new Set(notes.filter(Boolean))).join(" "),
    category,
    importRecommended: category === "recommended" && confidence !== "low",
  };
}

function extractCandidatesFromPage(page: Page, input: LeirdueSearchInput, debug: LeirdueSearchDebug) {
  debug.pagesInspected += 1;
  const lines = htmlToLines(page.html);
  const pageText = lines.join("\n");
  const shooterPresent = normalizeText(pageText).includes(normalizeText(input.shooterName));
  if (!shooterPresent) {
    if (debug.candidateReasons.length < 30) debug.candidateReasons.push(`${page.url}: shooter name not found on liste_id page`);
    return [];
  }

  debug.shooterPagesFound += 1;
  debug.listeIdShooterPagesFound += 1;
  if (debug.firstShooterMatchUrls.length < 10) debug.firstShooterMatchUrls.push(page.url);
  debug.firstUsefulSnippet ||= usefulSnippet(pageText, input.shooterName);
  const title = extractTitle(lines, page.html, input.year);
  const context = `${title}\n${page.label}\n${pageText}`;
  const parsed = parseScoresFromLines(lines, input.shooterName, pageText, input.year);
  const discipline = classifyDiscipline(context, input.disciplines);
  const totalTargets = parsed.ownScore !== null ? extractLikelyTotalTargets(context, parsed.ownScore) : extractLikelyTotalTargets(context);
  const snippet = findShooterSnippet(lines, input.shooterName);
  const notes = [...discipline.notes, ...parsed.notes];
  if (snippet) notes.push(`Raw snippet: ${snippet}`);
  if (parsed.scoreLine && totalTargets === null) notes.push(`Score row parsed, but total targets could not be inferred from title/list text: ${parsed.scoreLine}`);

  const raw: RawCandidate = {
    date: parseDate(context, input.year),
    name: title,
    shootingGround: extractShootingGround(title, pageText),
    discipline: discipline.discipline,
    ownScore: parsed.ownScore,
    totalTargets,
    winningScore: parsed.winningScore,
    leirdueUrl: page.url,
    listType: classifyListType(context),
    sourceText: pageText,
    listTitle: title,
    notes,
  };
  const candidate = buildCandidate(raw, input.disciplines);
  debug.candidateRowsCreated += 1;
  debug.candidateReasons.push(`${page.url}: candidate created as ${candidate.category}/${candidate.confidence}`);
  return [candidate];
}

const EVENT_PAGE_LIMIT = 240;
const RESULT_LIST_PAGE_LIMIT = 650;

function rankLink(link: Link, input: LeirdueSearchInput) {
  const haystack = normalizeText(`${link.text} ${link.href}`);
  let score = 0;
  if (haystack.includes(String(input.year))) score += 5;
  if (haystack.includes("sammenlagt etter bane") || haystack.includes("resultatliste sammenlagt") || haystack.includes("resultater sammenlagt")) score += 18;
  if (haystack.includes("sammenlagt") || haystack.includes("etter bane") || haystack.includes("resultater")) score += 12;
  if (haystack.includes("liste_id")) score += 10;
  if (haystack.includes("meny=resultater")) score += 4;
  if (haystack.includes("stevne=")) score += 3;
  if (input.disciplines.some((discipline) => haystack.includes(normalizeText(discipline).split(" ")[0]))) score += 3;
  if (isControlList(haystack)) score -= 4;
  return score;
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

function addListeIdLinksFromHtml(html: string, links: Map<string, Link>) {
  for (const link of extractLinks(html)) {
    if (isListeIdLink(link)) links.set(link.href, link);
  }
}

async function discoverPages(input: LeirdueSearchInput, debug: LeirdueSearchDebug) {
  const startUrls = [
    `${LEIRDUE_BASE_URL}?meny=resultater&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=resultater&year=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&year=${input.year}`,
  ];
  const eventLinks = new Map<string, Link>();
  const listeIdLinks = new Map<string, Link>();
  const listPages = new Map<string, Page>();

  for (const url of startUrls) {
    const html = await fetchLeirdue(url, debug);
    if (!html) continue;
    addListeIdLinksFromHtml(html, listeIdLinks);
    for (const link of extractLinks(html)) {
      if (isEventish(link, input)) eventLinks.set(link.href, link);
    }
  }

  debug.eventLinksFound = eventLinks.size;
  const rankedEventLinks = Array.from(eventLinks.values()).sort((a, b) => rankLink(b, input) - rankLink(a, input)).slice(0, EVENT_PAGE_LIMIT);
  if (eventLinks.size > rankedEventLinks.length) debug.rejectedReasons.push(`Event page inspection limit reached at ${EVENT_PAGE_LIMIT} of ${eventLinks.size} event links.`);

  for (const link of rankedEventLinks) {
    const html = await fetchLeirdue(link.href, debug);
    if (!html) continue;
    debug.eventPagesFetched += 1;
    addListeIdLinksFromHtml(html, listeIdLinks);
  }

  debug.listeIdLinksExtracted = listeIdLinks.size;
  debug.resultLinksFound = listeIdLinks.size;
  const rankedListeIdLinks = Array.from(listeIdLinks.values()).sort((a, b) => rankLink(b, input) - rankLink(a, input));
  if (rankedListeIdLinks.length > RESULT_LIST_PAGE_LIMIT) {
    debug.listInspectionLimitReached = true;
    debug.rejectedReasons.push("Result list inspection limit reached.");
  }

  for (const link of rankedListeIdLinks.slice(0, RESULT_LIST_PAGE_LIMIT)) {
    if (debug.firstListeIdUrlsInspected.length < 10) debug.firstListeIdUrlsInspected.push(link.href);
    const html = await fetchLeirdue(link.href, debug);
    if (!html) continue;
    debug.listeIdPagesFetched += 1;
    listPages.set(link.href, { url: link.href, html, label: link.text, kind: "list" });
  }

  return Array.from(listPages.values());
}

function dedupeCandidates(candidates: LeirdueCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [candidate.date, candidate.name, candidate.ownScore, candidate.totalTargets, candidate.leirdueUrl].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchLeirdueCandidates(input: LeirdueSearchInput): Promise<LeirdueSearchResult> {
  const debug = emptyDebug();
  const pages = await discoverPages(input, debug);
  const candidates = pages.flatMap((page) => extractCandidatesFromPage(page, input, debug));
  const sorted = dedupeCandidates(candidates).sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
  debug.candidateRowsCreated = sorted.length;
  if (sorted.length === 0 && debug.fetchedUrls.length === 0) debug.rejectedReasons.push("No Leirdue pages could be fetched.");
  return { candidates: sorted, debug };
}

export { FETCH_ERROR_MESSAGE };
