import { COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI } from "@/lib/disciplines";
import type { LeirdueCandidate, LeirdueCategory, LeirdueConfidence } from "@/lib/leirdue/types";

const LEIRDUE_BASE_URL = "https://www.leirdue.net/";
const FETCH_ERROR_MESSAGE = "Could not fetch Leirdue results right now.";
const DIRECT_RESULT_TERMS = ["sammenlagt", "sammenlagt etter bane", "resultatliste sammenlagt", "resultater sammenlagt"];
const CONTROL_TERMS = ["cup sammenlagt", "uttak", "uttaksliste", "prosent", "prosentliste", "lag", "team", "final", "finale", "shoot-off", "shootoff"];

export type LeirdueSearchInput = {
  shooterName: string;
  year: number;
  disciplines: string[];
};

type RawCandidate = Omit<LeirdueCandidate, "category" | "confidence" | "importRecommended" | "notes"> & {
  sourceText: string;
  listTitle: string;
  notes: string[];
};

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
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
    .replace(/\s+/g, " ")
    .trim();
}

function absolutizeUrl(href: string) {
  try {
    return new URL(href.replace(/&amp;/g, "&"), LEIRDUE_BASE_URL).toString();
  } catch {
    return LEIRDUE_BASE_URL;
  }
}

function extractLinks(html: string) {
  const links: { href: string; text: string }[] = [];
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html))) {
    const href = match[1];
    const text = stripTags(match[2]);
    if (href && text) links.push({ href: absolutizeUrl(href), text });
  }
  return links;
}

function classifyDiscipline(text: string, selectedDisciplines: string[]) {
  const normalized = normalizeText(text);
  const notes: string[] = [];
  let discipline = "Other";

  if (/\b(kompakt leirduesti|compact leirduesti|kompaktsti|compaksti)\b/.test(normalized)) {
    discipline = KOMPAKT_LEIRDUESTI;
  } else if (/\b(compak sporting|compak)\b/.test(normalized) && /\b(nsf|fitasc|compak|sporting|cup|resultat|stevne)\b/.test(normalized)) {
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

  if (!selectedDisciplines.includes(discipline)) {
    notes.push(`Discipline ${discipline} was not selected, so review is required.`);
  }

  return { discipline, notes };
}

function classifyListType(text: string) {
  const normalized = normalizeText(text);
  if (CONTROL_TERMS.some((term) => normalized.includes(term))) return "Control / not imported by default";
  if (DIRECT_RESULT_TERMS.some((term) => normalized.includes(term))) return "Sammenlagt result list";
  if (normalized.includes("resultat")) return "Result list";
  return "Unknown list";
}

function isControlList(text: string) {
  const normalized = normalizeText(text);
  return CONTROL_TERMS.some((term) => normalized.includes(term));
}

function looksLikeDirectResult(text: string) {
  const normalized = normalizeText(text);
  return DIRECT_RESULT_TERMS.some((term) => normalized.includes(term)) || normalized.includes("resultat");
}

function parseDate(text: string, year: number) {
  const range = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](?:\d{2,4})?\s*[-–]\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (range) {
    const endYear = Number(range[5].length === 2 ? `20${range[5]}` : range[5]);
    const endMonth = range[4].padStart(2, "0");
    const endDay = range[3].padStart(2, "0");
    return `${endYear}-${endMonth}-${endDay}`;
  }
  const full = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (full) {
    const parsedYear = Number(full[3].length === 2 ? `20${full[3]}` : full[3]);
    return `${parsedYear}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
  }
  const noYear = text.match(/(\d{1,2})[.\/-](\d{1,2})(?![\d.\/-])/);
  if (noYear) return `${year}-${noYear[2].padStart(2, "0")}-${noYear[1].padStart(2, "0")}`;
  return `${year}-01-01`;
}

function scorePatterns(shooterName: string) {
  const escapedName = shooterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`${escapedName}[\\s\\S]{0,180}?(\\d{1,3})\\s*[/]\\s*(\\d{1,3})`, "i"),
    new RegExp(`${escapedName}[\\s\\S]{0,180}?(\\d{1,3})\\s+(?:av|of)\\s+(\\d{1,3})`, "i"),
    new RegExp(`${escapedName}[\\s\\S]{0,180}?(\\d{1,3})\\s+(?:poeng|treff|skudd)`, "i"),
  ];
}

function extractOwnScore(text: string, shooterName: string) {
  for (const pattern of scorePatterns(shooterName)) {
    const match = text.match(pattern);
    if (match?.[1]) return { ownScore: Number(match[1]), totalTargets: match[2] ? Number(match[2]) : null };
  }
  return null;
}

function extractLikelyTotalTargets(text: string, score: number) {
  const totals = Array.from(text.matchAll(/(25|50|75|100|125|150|175|200)\s*(?:sk|skudd|duer|targets|mål)?/gi)).map((match) => Number(match[1]));
  const plausible = totals.filter((total) => total >= score);
  if (plausible.length > 0) return plausible[0];
  if (score <= 50) return 50;
  if (score <= 75) return 75;
  if (score <= 100) return 100;
  if (score <= 200) return 200;
  return score;
}

function extractWinningScore(text: string, ownScore: number, totalTargets: number, shooterName: string) {
  const scoreMatches = Array.from(text.matchAll(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g))
    .map((match) => ({ score: Number(match[1]), total: Number(match[2]) }))
    .filter((score) => score.total === totalTargets && score.score <= totalTargets);
  if (scoreMatches.length > 0) return Math.max(...scoreMatches.map((score) => score.score));

  const numberMatches = Array.from(text.matchAll(/\b(\d{1,3})\b/g)).map((match) => Number(match[1]));
  const plausibleScores = numberMatches.filter((value) => value >= ownScore && value <= totalTargets);
  if (plausibleScores.length > 0) return Math.max(...plausibleScores);

  const nameWindow = text.match(new RegExp(`${shooterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,180}`, "i"))?.[0] || "";
  return nameWindow ? ownScore : totalTargets;
}

function extractShootingGround(text: string) {
  const patterns = [
    /(?:arrangør|arrangor|klubb|skytebane|bane|sted)\s*:?\s*([^|·\n\r]{3,60})/i,
    /\b([A-ZÆØÅ][\wÆØÅæøå.&\-/ ]{2,40}\s(?:J\.F\.L\.|J\.F\.F\.|J\.F\.N\.F\.|L\.K\.|JFF|JFL|LK))\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
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

function buildCandidate(raw: RawCandidate, selectedDisciplines: string[]): LeirdueCandidate {
  const notes = raw.notes.slice();
  const selectedDiscipline = selectedDisciplines.includes(raw.discipline);
  const control = isControlList(`${raw.listTitle} ${raw.sourceText}`);
  const direct = looksLikeDirectResult(`${raw.listTitle} ${raw.sourceText}`);
  let confidence: LeirdueConfidence = "medium";
  let category: LeirdueCategory = "review";

  if (control) {
    category = "control";
    confidence = "low";
    notes.push("Cup, percentage, selection, team, final/shoot-off, or combined control list; not selected by default.");
  } else if (selectedDiscipline && direct && raw.ownScore >= 0 && raw.totalTargets > 0 && raw.winningScore > 0) {
    category = "recommended";
    confidence = notes.length > 0 ? "medium" : "high";
  } else {
    category = "review";
    confidence = selectedDiscipline ? "medium" : "low";
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
    notes: notes.join(" "),
    category,
    importRecommended: category === "recommended" && confidence !== "low",
  };
}

async function fetchLeirdue(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Clay Performance Lab Leirdue import/1.0", Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(FETCH_ERROR_MESSAGE);
  return response.text();
}

function extractCandidatesFromPage(html: string, url: string, input: LeirdueSearchInput) {
  const pageText = stripTags(html);
  const pageTitle = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const shooterPresent = normalizeText(pageText).includes(normalizeText(input.shooterName));
  if (!shooterPresent) return [];

  const score = extractOwnScore(pageText, input.shooterName);
  if (!score) return [];

  const totalTargets = score.totalTargets || extractLikelyTotalTargets(pageText, score.ownScore);
  const winningScore = extractWinningScore(pageText, score.ownScore, totalTargets, input.shooterName);
  const context = `${pageTitle} ${pageText}`;
  const discipline = classifyDiscipline(context, input.disciplines);
  const raw: RawCandidate = {
    date: parseDate(context, input.year),
    name: pageTitle || context.slice(0, 80) || "Leirdue result",
    shootingGround: extractShootingGround(context),
    discipline: discipline.discipline,
    ownScore: score.ownScore,
    totalTargets,
    winningScore,
    leirdueUrl: url,
    listType: classifyListType(context),
    sourceText: pageText,
    listTitle: pageTitle,
    notes: discipline.notes,
  };
  return [buildCandidate(raw, input.disciplines)];
}

async function discoverResultLinks(input: LeirdueSearchInput) {
  const params = new URLSearchParams({ meny: "resultater", year: String(input.year), aar: String(input.year), sok: input.shooterName, search: input.shooterName });
  const searchUrls = [
    `${LEIRDUE_BASE_URL}?${params.toString()}`,
    `${LEIRDUE_BASE_URL}?meny=resultater&aar=${input.year}`,
    `${LEIRDUE_BASE_URL}?meny=stevner&aar=${input.year}`,
  ];
  const links = new Map<string, string>();

  for (const searchUrl of searchUrls) {
    const html = await fetchLeirdue(searchUrl);
    for (const link of extractLinks(html)) {
      const haystack = normalizeText(`${link.text} ${link.href}`);
      const relevantYear = haystack.includes(String(input.year));
      const resultish = haystack.includes("result") || haystack.includes("liste") || haystack.includes("stevne") || haystack.includes("sammenlagt");
      const disciplineMatch = input.disciplines.some((discipline) => haystack.includes(normalizeText(discipline).split(" ")[0]));
      if ((resultish || disciplineMatch) && (relevantYear || links.size < 25)) links.set(link.href, link.text);
    }
  }

  return Array.from(links.entries()).slice(0, 40).map(([href]) => href);
}

export async function searchLeirdueCandidates(input: LeirdueSearchInput) {
  try {
    const links = await discoverResultLinks(input);
    const candidates: LeirdueCandidate[] = [];

    for (const link of links) {
      const html = await fetchLeirdue(link);
      candidates.push(...extractCandidatesFromPage(html, link, input));
    }

    return dedupeCandidates(candidates).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    throw new Error(FETCH_ERROR_MESSAGE);
  }
}

export { FETCH_ERROR_MESSAGE };
