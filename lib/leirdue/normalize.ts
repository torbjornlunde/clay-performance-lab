import { COMPAK_SPORTING, JEGERTRAP_NORDISK_TRAP, KOMPAKT_LEIRDUESTI, LEIRDUESTI, SKEET, TRAP } from "../disciplines";

export type LeirdueSourceIdentifiers = {
  stevneId: string | null;
  listeId: string | null;
};

export function normalizeLeirdueText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type LeirdueNameMatchReason = "exact normalized match" | "diacritic-insensitive match" | "partial/initial match" | "fuzzy/possible match" | "no match";

export function normalizeLeirdueName(value: string) {
  return normalizeLeirdueText(value)
    .replace(/[’'`´]/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nordicSafeNameKey(value: string) {
  return normalizeLeirdueName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th");
}

const CLUB_TRAILING_WORDS = new Set([
  "l",
  "lk",
  "l.k",
  "jff",
  "j.f.f",
  "jfnf",
  "j.f.n.f",
  "jfl",
  "j.f.l",
  "skytterlag",
  "sportskyttere",
  "jeger",
  "fiskerforening",
  "klubb",
]);

function compactNameKey(value: string) {
  return nordicSafeNameKey(value)
    .replace(/\b(l\s*k|l\s*k\.|j\s*f\s*f|j\s*f\s*n\s*f|j\s*f\s*l)\b/g, (match) => match.replace(/\s+/g, "."))
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLikelyClubSuffix(value: string) {
  const parts = compactNameKey(value).split(/\s+/).filter(Boolean);
  while (parts.length > 2 && CLUB_TRAILING_WORDS.has((parts.at(-1) || "").replace(/\.+$/g, ""))) parts.pop();
  return parts.join(" ");
}

function nameParts(value: string) {
  return normalizeLeirdueName(value).split(/\s+/).filter(Boolean);
}

function initialsMatch(shortName: string, fullName: string) {
  const shortParts = nameParts(shortName);
  const fullParts = nameParts(fullName);
  if (shortParts.length < 2 || fullParts.length < 2) return false;
  const shortLast = nordicSafeNameKey(shortParts.at(-1) || "");
  const fullLast = nordicSafeNameKey(fullParts.at(-1) || "");
  if (!shortLast || shortLast !== fullLast) return false;
  const shortFirst = nordicSafeNameKey(shortParts[0] || "");
  const fullFirst = nordicSafeNameKey(fullParts[0] || "");
  return shortFirst.length === 1 ? fullFirst.startsWith(shortFirst) : fullFirst.length === 1 ? shortFirst.startsWith(fullFirst) : false;
}

export function leirdueNameMatchReason(first: string | null | undefined, second: string | null | undefined): LeirdueNameMatchReason {
  const normalizedFirst = normalizeLeirdueName(first || "");
  const normalizedSecond = normalizeLeirdueName(second || "");
  if (!normalizedFirst || !normalizedSecond) return "no match";
  if (normalizedFirst === normalizedSecond) return "exact normalized match";

  const foldedFirst = nordicSafeNameKey(normalizedFirst);
  const foldedSecond = nordicSafeNameKey(normalizedSecond);
  if (foldedFirst === foldedSecond) return "diacritic-insensitive match";
  const firstWithoutClub = stripLikelyClubSuffix(normalizedFirst);
  const secondWithoutClub = stripLikelyClubSuffix(normalizedSecond);
  if (firstWithoutClub && secondWithoutClub && firstWithoutClub === secondWithoutClub) return "diacritic-insensitive match";
  if (profileNameContainedInShooterText(first, second) || profileNameContainedInShooterText(second, first)) return "partial/initial match";
  if (foldedFirst.length >= 5 && foldedSecond.length >= 5 && (foldedFirst.includes(foldedSecond) || foldedSecond.includes(foldedFirst))) return "partial/initial match";
  if (initialsMatch(normalizedFirst, normalizedSecond) || initialsMatch(normalizedSecond, normalizedFirst)) return "partial/initial match";

  const firstParts = nameParts(normalizedFirst);
  const secondParts = nameParts(normalizedSecond);
  const firstLast = nordicSafeNameKey(firstParts.at(-1) || "");
  const secondLast = nordicSafeNameKey(secondParts.at(-1) || "");
  if (firstLast && secondLast && firstLast === secondLast) return "fuzzy/possible match";

  return "no match";
}

export function profileNameContainedInShooterText(shooterText: string | null | undefined, profileName: string | null | undefined) {
  const shooterKey = stripLikelyClubSuffix(shooterText || "");
  const profileKey = stripLikelyClubSuffix(profileName || "");
  if (!shooterKey || !profileKey || profileKey.length < 5) return false;
  const profileParts = profileKey.split(/\s+/).filter(Boolean);
  if (profileParts.length < 2) return false;
  return new RegExp(`(^|\\s)${profileParts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}(\\s|$)`).test(shooterKey);
}

export function namesLikelyMatch(first: string | null | undefined, second: string | null | undefined) {
  const reason = leirdueNameMatchReason(first, second);
  return reason === "exact normalized match" || reason === "diacritic-insensitive match" || reason === "partial/initial match";
}

export function normalizeLeirdueDisciplineLabel(label: string | null | undefined) {
  const normalized = normalizeLeirdueText(label || "");
  if (!normalized) return { discipline: "Other", warning: "Could not detect discipline." };

  if (/\bfitasc\b/.test(normalized) && /\bsporting\b/.test(normalized)) return { discipline: "FITASC Sporting", warning: null };
  if (/\b(compak sporting|compak|kompak)\b/.test(normalized) && !/\bleirduesti\b/.test(normalized)) return { discipline: COMPAK_SPORTING, warning: null };
  if (/\b(kompakt leirduesti|compact leirduesti|kompaktsti|compaksti|kompak leirduesti|kompakt sporting)\b/.test(normalized)) return { discipline: KOMPAKT_LEIRDUESTI, warning: null };
  if (/\bleirduesti\b/.test(normalized)) return { discipline: LEIRDUESTI, warning: null };
  if (/\bjegertrap\b/.test(normalized)) return { discipline: JEGERTRAP_NORDISK_TRAP, warning: null };
  if (/\bnordisk\s+trap\b/.test(normalized)) return { discipline: JEGERTRAP_NORDISK_TRAP, warning: null };
  if (/\btrap\b/.test(normalized)) return { discipline: TRAP, warning: null };
  if (/\bskeet\b/.test(normalized)) return { discipline: SKEET, warning: null };
  if (/\b(engelsk sporting|sporting)\b/.test(normalized)) return { discipline: "Sporting", warning: null };

  return { discipline: "Other", warning: "Unknown discipline." };
}

export function extractLeirdueSourceIdentifiers(sourceUrl: string | null | undefined): LeirdueSourceIdentifiers {
  if (!sourceUrl) return { stevneId: null, listeId: null };
  try {
    const url = new URL(sourceUrl);
    return {
      stevneId: url.searchParams.get("stevne") || null,
      listeId: url.searchParams.get("liste_id") || null,
    };
  } catch {
    return { stevneId: null, listeId: null };
  }
}
