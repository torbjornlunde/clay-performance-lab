import { createHash } from "node:crypto";
import { COMPAK_SPORTING, ENGLISH_SPORTING, FITASC_SPORTING, SKEET, SPORTING, TRAP } from "../disciplines";
import { leirdueNameMatchReason } from "../leirdue/normalize";
import type { ClayArenaCandidate, ClayArenaMatchStatus } from "./types";

const decode = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();

export function validateClayArenaUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["clayarena.com", "www.clayarena.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?competitions\/([^/]+)\/results\/?$/i);
    if (!match || !/^[a-z0-9-]+$/i.test(match[1])) return null;
    url.hash = "";
    return { url: url.toString(), competitionId: match[1] };
  } catch { return null; }
}

function disciplineFrom(text: string) {
  const value = text.toLowerCase();
  if (/english\s+sporting/.test(value)) return ENGLISH_SPORTING;
  if (/fitasc\s+sporting/.test(value)) return FITASC_SPORTING;
  if (/compak/.test(value)) return COMPAK_SPORTING;
  if (/sporting/.test(value)) return SPORTING;
  if (/skeet/.test(value)) return SKEET;
  if (/trap/.test(value)) return TRAP;
  return "Other";
}

function meta(html: string, names: string[]) {
  for (const name of names) {
    const patterns = [new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"), new RegExp(`<[^>]+data-${name}=["']([^"']+)["']`, "i")];
    for (const pattern of patterns) { const match = html.match(pattern); if (match) return decode(match[1]); }
  }
  return null;
}

function parseScore(value: string) {
  const match = value.match(/(?:^|\s)(\d{1,4})(?:\s*\+\s*(\d{1,4}))?(?:\s*\/\s*(\d{1,4}))?(?:\s|$)/);
  return match ? { base: Number(match[1]), shootOff: match[2] ? Number(match[2]) : null, targets: match[3] ? Number(match[3]) : null } : null;
}

function matchStatus(name: string, profileName: string): ClayArenaMatchStatus {
  const reason = leirdueNameMatchReason(name, profileName);
  if (reason === "exact normalized match" || reason === "diacritic-insensitive match") return "matched_to_you";
  if (reason === "partial/initial match" || reason === "fuzzy/possible match") return "possible_match";
  const tokens = (value: string) => decode(value).toLocaleLowerCase("en").split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join("|");
  if (tokens(name) && tokens(name) === tokens(profileName)) return "matched_to_you";
  return "no_match";
}

function labeledValue(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<dt[^>]*>\\s*${escaped}\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, "i"),
    new RegExp(`<[^>]+>\\s*${escaped}\\s*<\\/[^>]+>\\s*<[^>]+>([\\s\\S]*?)<\\/[^>]+>`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return decode(value);
  }
  return null;
}

function isoDate(value: string | null) {
  if (!value) return null;
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const european = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  return european ? `${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}` : null;
}

function competitionTitle(resultsHtml: string, detailHtml: string) {
  const detailTitle = decode(detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  if (detailTitle && !/^results$/i.test(detailTitle)) return detailTitle;
  const explicit = meta(resultsHtml, ["competition-title"]);
  if (explicit) return explicit;
  const headings = [...resultsHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => decode(match[1])).filter((value) => value && !/^results$/i.test(value));
  if (headings[0]) return headings[0];
  const socialTitle = meta(resultsHtml, ["og:title"]);
  return socialTitle?.replace(/^results\s*[-–—|:]\s*/i, "").replace(/\s*[-–—|]\s*clayarena\s*$/i, "").trim() || "ClayArena competition";
}

export function parseClayArenaResults(html: string, sourceUrl: string, profileName: string, detailHtml = ""): ClayArenaCandidate[] {
  const validated = validateClayArenaUrl(sourceUrl);
  if (!validated) throw new Error("Unsupported ClayArena results URL.");
  const title = competitionTitle(html, detailHtml);
  const date = isoDate(meta(detailHtml, ["competition-date", "event-date"]) || labeledValue(detailHtml, "Start date") || meta(html, ["competition-date", "event-date"]) || html.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null);
  const venue = meta(detailHtml, ["competition-venue", "location"]) || labeledValue(detailHtml, "Location") || meta(html, ["competition-venue", "location"]);
  const detailDiscipline = meta(detailHtml, ["competition-discipline", "discipline"]) || labeledValue(detailHtml, "Discipline") || "";
  const discipline = disciplineFrom(`${detailDiscipline} ${meta(html, ["competition-discipline", "discipline"]) || ""} ${title}`);
  const detailTargetsText = labeledValue(detailHtml, "Targets") || decode(detailHtml).match(/\b(\d{1,4})\s+targets?\b/i)?.[1] || null;
  const detailTargets = detailTargetsText ? Number.parseInt(detailTargetsText, 10) : null;
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  const candidates: ClayArenaCandidate[] = [];
  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => decode(cell[1])));
    if (rows.length < 2) continue;
    const headers = rows[0].map((header) => header.toLowerCase());
    const index = (...labels: string[]) => headers.findIndex((header) => labels.some((label) => header === label || header.includes(label)));
    const nameAt = index("shooter", "name", "competitor");
    const scoreAt = index("total", "score");
    if (nameAt < 0 || scoreAt < 0) continue;
    const roundIndexes = headers.map((header, i) => /^(?:(?:round|series|r|s)\s*)?\d+$/i.test(header) ? i : -1).filter((i) => i >= 0 && i !== nameAt && i !== scoreAt);
    for (const cells of rows.slice(1)) {
      const shooterName = cells[nameAt]?.trim();
      const score = parseScore(cells[scoreAt] || "");
      if (!shooterName || !score) continue;
      const seriesScores = roundIndexes.map((i) => Number(cells[i])).filter((value) => Number.isFinite(value) && value > 0);
      const placementValue = Number.parseInt(cells[index("place", "rank", "position")] || "", 10);
      const totalTargetsHeader = index("targets", "max");
      const explicitTargets = totalTargetsHeader >= 0 ? Number.parseInt(cells[totalTargetsHeader] || "", 10) : null;
      const totalTargets = score.targets || (explicitTargets && explicitTargets >= score.base ? explicitTargets : null) || (detailTargets && detailTargets >= score.base ? detailTargets : null);
      const warnings: string[] = [];
      if (!date) warnings.push("Check the competition date.");
      if (discipline === "Other") warnings.push("Choose the correct discipline.");
      if (!totalTargets) warnings.push("Enter total targets before saving.");
      if (score.shootOff !== null) warnings.push(`Shoot-off +${score.shootOff} is supplemental and is not included in the base score.`);
      const competitorNumber = cells[index("number", "bib", "competitor no")] || null;
      const stableCompetitor = competitorNumber || shooterName.toLocaleLowerCase("en").split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join("|");
      const resultIdentity = createHash("sha256").update([validated.competitionId.toLowerCase(), stableCompetitor].join("|")).digest("hex");
      candidates.push({ provider: "ClayArena", sourceUrl: validated.url, competitionId: validated.competitionId, resultIdentity, competition: title, date, discipline, venue, shooterName, country: cells[index("country", "nation")] || null, competitorNumber, category: cells[index("category", "class")] || null, placement: Number.isFinite(placementValue) ? placementValue : null, ownScore: score.base, totalTargets, winningScore: null, seriesScores, shootOff: score.shootOff, matchStatus: matchStatus(shooterName, profileName), warnings });
    }
  }
  const winningScore = Math.max(...candidates.map((candidate) => candidate.ownScore), 0) || null;
  return candidates.map((candidate) => ({ ...candidate, winningScore }));
}
