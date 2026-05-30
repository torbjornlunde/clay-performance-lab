import { COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI } from "@/lib/disciplines";
import type { LeirdueCandidate, LeirdueCategory, LeirdueConfidence, LeirdueSearchDebug, LeirdueSearchResult } from "@/lib/leirdue/types";

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
};

type Link = { href: string; text: string; source?: "anchor" | "raw" | "validation" };
type Page = { url: string; html: string; label: string; kind: "overview" | "event" | "list" };
type ParsedScore = { ownScore: number | null; winningScore: number | null; scoreLine: string | null; notes: string[]; parsedNumbers: number[]; seriesScores: number[] };
type ParsedRow = { text: string; cells: string[]; numbers: number[]; total: number | null; seriesScores: number[] };
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

function isLikelyControlText(text: string) {
  const normalized = ` ${normalizeText(text)} `;
  return CONTROL_TERMS.some((term) => normalized.includes(term)) || /\b(cup|xxl cup|blaser cup)\s+sammenlagt\b/.test(normalized);
}

function directListScore(text: string) {
  const normalized = normalizeText(text);
  if (normalized.includes("sammenlagt resultatliste etter bane")) return 90;
  if (normalized.includes("resultater sammenlagt") || normalized.includes("resultatliste sammenlagt")) return 85;
  if (normalized.includes("sammenlagt") && normalized.includes("resultat")) return 75;
  if (normalized.includes("resultater") || normalized.includes("resultatliste")) return 55;
  if (/\b\d{1,3}\s+\d{1,3}\s+\d{1,3}\b/.test(normalized)) return 25;
  return 0;
}

function isDirectResultList(text: string) {
  return directListScore(text) > 0 && !isLikelyControlText(text);
}

function penaltyForControlText(text: string) {
  const normalized = normalizeText(text);
  let penalty = 0;
  if (isLikelyControlText(text)) penalty += 180;
  if (normalized.includes("prosent")) penalty += 80;
  if (normalized.includes("uttak")) penalty += 80;
  if (normalized.includes("ranking") || normalized.includes("rank")) penalty += 80;
  if (normalized.includes("lag") || normalized.includes("team list")) penalty += 50;
  if (normalized.includes("påmelding") || normalized.includes("pamelding") || normalized.includes("deltaker")) penalty += 120;
  if ((normalized.includes("lørdag") && normalized.includes("søndag")) || normalized.includes("lordag sondag") || normalized.includes("combined")) penalty += 30;
  return penalty;
}

function classifyListType(text: string) {
  const normalized = ` ${normalizeText(text)} `;
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

function extractLikelyTotalTargets(text: string, score?: number | null, seriesScores: number[] = []) {
  const normalized = normalizeText(text);
  const explicit = normalized.match(/\b(50|75|100|125|150|175|200)\s*(?:sk|skudd|duer|duers|targets|mal|mål|compak|compact|kompakt)\b/);
  if (explicit) return Number(explicit[1]);
  const named = normalized.match(/\b(50|75|100|125|150|175|200)\b(?=\s*(?:compak|compact|kompakt|sporting|leirduesti|sti))/);
  if (named) return Number(named[1]);

  const likelySeries = seriesScores.filter((value) => value >= 15 && value <= 25);
  if (likelySeries.length >= 2) {
    const inferred = likelySeries.length * 25;
    if ([50, 75, 100, 150, 200].includes(inferred)) return inferred;
  }

  const standalone = Array.from(normalized.matchAll(/\b(50|75|100|125|150|175|200)\b/g)).map((match) => Number(match[1]));
  const plausible = standalone.filter((total) => !score || total >= score);
  if (plausible.length > 0) return plausible[0];
  return null;
}

function extractTitle(lines: string[], html: string, year: number) {
  const htmlTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const titleLine = lines.find((line) => line.includes(String(year)) && !/^(oppdatert|copyright|jury|meny|start\s+stevner)/i.test(line) && line.length > 12);
  if (titleLine) return titleLine;
  return htmlTitle && !/^leirdue\.net$/i.test(htmlTitle) ? htmlTitle : "Leirdue result";
}

function cleanShootingGround(value: string) {
  return value
    .replace(/\b(?:resultater|påmelding|deltakerliste|sammenlagt|klassedelt|skyting|stevne)\b.*$/i, "")
    .replace(/^[\s:–-]+|[\s:–-]+$/g, "")
    .trim();
}

function invalidShootingGround(value: string) {
  const normalized = normalizeText(value);
  return (
    !normalized ||
    normalized.length < 3 ||
    ["vestlandet", "ostlandet", "østlandet", "sorlandet", "sørlandet", "nord norge", "leirdue.net", "norges skytterforbund", "njff"].includes(normalized) ||
    normalized.includes("logg inn") ||
    normalized.includes("terminliste") ||
    normalized.includes("resultater") ||
    normalized.includes("påmelding") ||
    normalized.includes("pamelding") ||
    (normalized.includes("cup") && !/\b(j\.f|l\.k|jff|jfl|lk|team)\b/.test(normalized))
  );
}

function extractShootingGround(title: string, text: string) {
  const combined = `${title}\n${text}`;
  const organizerPatterns = [
    /(?:stevnearrangør|arrangør|arrangor|arranger(?:t av)?|arrangørklubb|klubb|forening|skytebane|bane|sted)\s*:?\s*([^|·\n\r]{3,80})/i,
    /\b(Bergens?\s+J\.F\.\s*\/\s*Kismul)\b/i,
    /\b(Team\s+Sørvest)\b/i,
    /\b(Stavanger\s+og\s+Rogaland\s+J\.F\.F\.)\b/i,
    /\b([A-ZÆØÅ][\wÆØÅæøå.&\-/ ]{1,45}\s(?:J\.F\.L\.|J\.F\.F\.|J\.F\.N\.F\.|L\.K\.|JFF|JFL|LK))\b/,
  ];
  for (const pattern of organizerPatterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      const ground = cleanShootingGround(match[1]);
      if (!invalidShootingGround(ground)) return { value: ground, source: "organizer field" };
    }
  }

  const beforeDate = title.split(/\b\d{1,2}\./)[0]?.trim() || title;
  const titleParts = beforeDate.split(/\s+-\s+|\s+–\s+/).map((part) => cleanShootingGround(part)).filter(Boolean);
  const maybeGround = titleParts.reverse().find((part) => !invalidShootingGround(part) && !/^(\d+\s*(sk|skudd|duer)|lørdag|søndag|saturday|sunday)$/i.test(part));
  if (maybeGround) return { value: maybeGround, source: "event title" };

  return { value: null, source: "unknown" };
}

function extractScoreNumbers(line: string) {
  const normalized = line.replace(/,/g, ".");
  if (/%/.test(normalized)) return [];
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
  const shooter = normalizeText(shooterName);
  const index = lines.findIndex((line) => normalizeText(line).includes(shooter));
  if (index < 0) return null;
  return lines.slice(Math.max(0, index - 3), index + 7).join(" | ");
}

function parseScoresFromLines(lines: string[], html: string, shooterName: string, pageText: string, year: number, totalTargets: number | null): ParsedScore {
  const shooter = normalizeText(shooterName);
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

  const shooterRowText = rowTexts.find((rowText) => normalizeText(rowText).includes(shooter));
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
    const shooterIndex = lines.findIndex((line) => normalizeText(line).includes(shooter));
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

function computeCandidatePriority(raw: RawCandidate, category: LeirdueCategory, confidence: LeirdueConfidence) {
  const context = `${raw.listTitle} ${raw.listType || ""} ${raw.sourceText}`;
  let priority = directListScore(context);
  if (raw.ownScore !== null) priority += 35;
  if (raw.winningScore !== null) priority += 30;
  if (raw.totalTargets !== null) priority += 25;
  if (raw.discipline !== "Other") priority += 20;
  if (raw.date) priority += 15;
  if (raw.shootingGround) priority += 10;
  if (category === "recommended") priority += 100;
  if (category === "review") priority += 30;
  if (confidence === "high") priority += 40;
  if (confidence === "medium") priority += 15;
  priority -= penaltyForControlText(context);
  return priority;
}

function buildCandidate(raw: RawCandidate, selectedDisciplines: string[]): LeirdueCandidate {
  const notes = raw.notes.slice();
  const selectedDiscipline = selectedDisciplines.includes(raw.discipline);
  const context = `${raw.listTitle} ${raw.sourceText}`;
  const control = isControlList(context);
  const directScore = directListScore(context);
  const direct = directScore > 0 && !control;
  const hasOwnScore = raw.ownScore !== null;
  const hasTotalTargets = raw.totalTargets !== null;
  const hasWinningScore = raw.winningScore !== null;
  const parsedDiscipline = raw.discipline !== "Other";
  let confidence: LeirdueConfidence = "low";
  let category: LeirdueCategory = "review";

  if (control) {
    category = "control";
    confidence = "low";
    notes.push("Category reason: control/non-result terms such as cup summary, ranking, registration, team, final/shoot-off, or percentage list were detected.");
  } else if (direct && hasOwnScore && hasTotalTargets && hasWinningScore && parsedDiscipline && selectedDiscipline) {
    confidence = "high";
    category = "recommended";
    notes.push("Category reason: high-confidence direct result with row score, total targets, winning score, selected discipline, and no control terms.");
  } else if (hasOwnScore && (hasTotalTargets || hasWinningScore) && parsedDiscipline && direct) {
    confidence = "medium";
    category = "review";
    notes.push("Category reason: likely direct result with score parsed, but one or more fields still need review.");
  } else {
    confidence = "low";
    category = "review";
    if (!hasOwnScore) notes.push("Category reason: shooter found but score is missing.");
    if (!direct) notes.push("Category reason: list type is unclear or not a direct result list.");
    if (!parsedDiscipline) notes.push("Category reason: discipline is unclear.");
    if (!selectedDiscipline) notes.push("Category reason: parsed discipline is not selected.");
  }

  const candidatePriority = computeCandidatePriority(raw, category, confidence);
  notes.push(`Candidate quality: category=${category}, confidence=${confidence}, candidatePriority=${candidatePriority}.`);
  notes.push(category === "recommended" ? "Import recommendation: checked by default." : "Import recommendation: not checked by default.");

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
    importRecommended: category === "recommended",
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
  const discipline = classifyDiscipline(context, input.disciplines);
  const initialTotalTargets = extractLikelyTotalTargets(context);
  const parsed = parseScoresFromLines(lines, page.html, input.shooterName, pageText, input.year, initialTotalTargets);
  const totalTargets = initialTotalTargets || extractLikelyTotalTargets(context, parsed.ownScore, parsed.seriesScores);
  const snippet = findShooterSnippet(lines, input.shooterName);
  const notes = [...discipline.notes, ...parsed.notes, `Source liste_id URL: ${page.url}.`, `List title/type: ${title} / ${classifyListType(context)}.`];
  const shootingGroundResult = extractShootingGround(title, pageText);
  const shootingGround = shootingGroundResult.value;
  if (shootingGround) notes.push(`Shooting ground inferred from ${shootingGroundResult.source}: ${shootingGround}.`);
  if (page.label.includes("Debug validation URL")) notes.push("Found through validation URL.");
  if (snippet) notes.push(`Raw snippet: ${snippet}`);
  if (parsed.scoreLine && totalTargets === null) notes.push(`Score row parsed, but total targets could not be inferred from title/list text: ${parsed.scoreLine}`);

  const raw: RawCandidate = {
    date: parseDate(context, input.year),
    name: title,
    shootingGround,
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

function rankLink(link: Link, input: LeirdueSearchInput) {
  const haystack = normalizeText(`${link.text} ${link.href}`);
  let score = directListScore(`${link.text} ${link.href}`);
  if (haystack.includes(String(input.year))) score += 5;
  if (haystack.includes("liste_id")) score += 10;
  if (haystack.includes("meny=resultater")) score += 4;
  if (haystack.includes("stevne=")) score += 3;
  if (link.source === "validation") score += 2;
  if (input.disciplines.some((discipline) => haystack.includes(normalizeText(discipline).split(" ")[0]))) score += 3;
  score -= Math.min(120, penaltyForControlText(haystack));
  return score;
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

function addListeIdLink(links: Map<string, Link>, href: string, text: string, source: Link["source"]) {
  const absolute = absolutizeUrl(href);
  if (!links.has(absolute)) links.set(absolute, { href: absolute, text, source });
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
  return input.year === 2026 && shooter.includes("torbjørn lunde".normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
}

function addValidationListeIdLinks(input: LeirdueSearchInput, links: Map<string, Link>, debug: LeirdueSearchDebug) {
  if (!isTorbjornLunde2026Validation(input)) return;
  for (const url of TORBJORN_LUNDE_2026_VALIDATION_URLS) {
    addListeIdLink(links, url, "Debug validation URL for Torbjørn Lunde 2026", "validation");
  }
  debug.validationUrlsInspected = TORBJORN_LUNDE_2026_VALIDATION_URLS.length;
  debug.candidateReasons.push("Added Torbjørn Lunde 2026 debug validation liste_id URLs.");
}

async function discoverPages(input: LeirdueSearchInput, debug: LeirdueSearchDebug) {
  const startUrls = [
    `${LEIRDUE_BASE_URL}?meny=resultater&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=resultater&year=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&year=${input.year}`,
  ];
  const eventIds = new Map<string, string>();
  const listeIdLinks = new Map<string, Link>();
  const listPages = new Map<string, Page>();

  for (const url of startUrls) {
    const html = await fetchLeirdue(url, debug);
    if (!html) continue;
    addListeIdLinksFromAnchors(html, listeIdLinks);
    addListeIdLinksFromRawHtml(html, url, listeIdLinks);
    for (const link of extractLinks(html)) {
      if (!isEventish(link, input)) continue;
      const stevneId = extractStevneId(link.href);
      if (stevneId) eventIds.set(stevneId, link.text);
    }
    for (const match of html.matchAll(/stevne\s*=\s*(\d+)/gi)) {
      eventIds.set(match[1], `Raw event ${match[1]}`);
    }
  }

  debug.eventLinksFound = eventIds.size;
  const rankedEventIds = Array.from(eventIds.entries())
    .map(([stevneId, text]) => ({ stevneId, text, href: eventInfoUrl(stevneId) }))
    .sort((a, b) => rankLink({ href: b.href, text: b.text }, input) - rankLink({ href: a.href, text: a.text }, input))
    .slice(0, EVENT_PAGE_LIMIT);
  if (eventIds.size > rankedEventIds.length) debug.rejectedReasons.push(`Event page inspection limit reached at ${EVENT_PAGE_LIMIT} of ${eventIds.size} event links.`);

  for (const event of rankedEventIds) {
    const infoUrl = eventInfoUrl(event.stevneId);
    const infoHtml = await fetchLeirdue(infoUrl, debug);
    if (infoHtml) {
      debug.eventPagesFetched += 1;
      debug.eventInfoPagesFetched += 1;
      addListeIdLinksFromAnchors(infoHtml, listeIdLinks);
      addListeIdLinksFromRawHtml(infoHtml, infoUrl, listeIdLinks);
    }

    const resultMenuUrl = eventResultMenuUrl(event.stevneId);
    const before = listeIdLinks.size;
    const resultHtml = await fetchLeirdue(resultMenuUrl, debug);
    if (!resultHtml) continue;
    debug.eventPagesFetched += 1;
    debug.eventResultMenuPagesFetched += 1;
    addListeIdLinksFromAnchors(resultHtml, listeIdLinks);
    const rawMatches = addListeIdLinksFromRawHtml(resultHtml, resultMenuUrl, listeIdLinks);
    const extracted = listeIdLinks.size - before;
    debug.listeIdLinksFromResultMenus += Math.max(extracted, rawMatches);
    if (rawMatches === 0 && extracted === 0) addResultMenuDiagnostic(debug, resultMenuUrl, resultHtml);
  }

  addValidationListeIdLinks(input, listeIdLinks, debug);

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
    if (link.source === "validation" && normalizeText(stripTags(html)).includes(normalizeText(input.shooterName))) debug.validationShooterMatches += 1;
    listPages.set(link.href, { url: link.href, html, label: link.text, kind: "list" });
  }

  return Array.from(listPages.values());
}

function candidatePriorityFromNotes(candidate: LeirdueCandidate) {
  const match = candidate.notes.match(/candidatePriority=(-?\d+)/);
  return match ? Number(match[1]) : 0;
}

function candidateQuality(candidate: LeirdueCandidate) {
  const categoryScore = candidate.category === "recommended" ? 1000 : candidate.category === "review" ? 400 : 0;
  const fieldScore = [candidate.ownScore, candidate.winningScore, candidate.totalTargets, candidate.shootingGround, candidate.date].filter((value) => value !== null && value !== "").length * 35;
  const confidenceScore = candidate.confidence === "high" ? 200 : candidate.confidence === "medium" ? 80 : 0;
  return categoryScore + confidenceScore + fieldScore + candidatePriorityFromNotes(candidate) - penaltyForControlText(`${candidate.name} ${candidate.listType} ${candidate.notes}`);
}

function dedupeCandidates(candidates: LeirdueCandidate[], debug: LeirdueSearchDebug) {
  const best = new Map<string, LeirdueCandidate>();
  for (const candidate of candidates) {
    const key = [candidate.date, normalizeText(candidate.name), candidate.discipline, candidate.ownScore, candidate.totalTargets].join("|");
    const current = best.get(key);
    if (!current || candidateQuality(candidate) > candidateQuality(current)) best.set(key, candidate);
  }
  debug.duplicatesRemoved = candidates.length - best.size;
  return Array.from(best.values());
}

function updateCandidateDebugStats(debug: LeirdueSearchDebug, candidates: LeirdueCandidate[]) {
  debug.candidateCategoryCounts = { recommended: 0, review: 0, control: 0 };
  debug.candidateConfidenceCounts = { high: 0, medium: 0, low: 0 };
  debug.candidatesWithOwnScore = 0;
  debug.candidatesWithWinningScore = 0;
  debug.candidatesWithTotalTargets = 0;
  debug.candidatesWithShootingGround = 0;
  for (const candidate of candidates) {
    debug.candidateCategoryCounts[candidate.category] += 1;
    debug.candidateConfidenceCounts[candidate.confidence] += 1;
    if (candidate.ownScore !== null) debug.candidatesWithOwnScore += 1;
    if (candidate.winningScore !== null) debug.candidatesWithWinningScore += 1;
    if (candidate.totalTargets !== null) debug.candidatesWithTotalTargets += 1;
    if (candidate.shootingGround) debug.candidatesWithShootingGround += 1;
  }
}

export async function searchLeirdueCandidates(input: LeirdueSearchInput): Promise<LeirdueSearchResult> {
  const debug = emptyDebug();
  const pages = await discoverPages(input, debug);
  const candidates = pages.flatMap((page) => extractCandidatesFromPage(page, input, debug));
  const sorted = dedupeCandidates(candidates, debug).sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
  debug.candidateRowsCreated = sorted.length;
  updateCandidateDebugStats(debug, sorted);
  if (sorted.length === 0 && debug.fetchedUrls.length === 0) debug.rejectedReasons.push("No Leirdue pages could be fetched.");
  return { candidates: sorted, debug };
}

export { FETCH_ERROR_MESSAGE };
