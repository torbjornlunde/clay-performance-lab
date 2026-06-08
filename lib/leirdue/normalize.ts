import { COMPAK_SPORTING, KOMPAKT_LEIRDUESTI, LEIRDUESTI } from "@/lib/disciplines";

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

export function normalizeLeirdueName(value: string) {
  return normalizeLeirdueText(value)
    .replace(/[’'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nordicSafeNameKey(value: string) {
  return normalizeLeirdueName(value)
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a");
}

export function namesLikelyMatch(first: string | null | undefined, second: string | null | undefined) {
  const normalizedFirst = normalizeLeirdueName(first || "");
  const normalizedSecond = normalizeLeirdueName(second || "");
  if (!normalizedFirst || !normalizedSecond) return false;
  if (normalizedFirst === normalizedSecond) return true;
  return nordicSafeNameKey(normalizedFirst) === nordicSafeNameKey(normalizedSecond);
}

export function normalizeLeirdueDisciplineLabel(label: string | null | undefined) {
  const normalized = normalizeLeirdueText(label || "");
  if (!normalized) return { discipline: "Other", warning: "Could not detect discipline." };

  if (/\bfitasc\b/.test(normalized) && /\bsporting\b/.test(normalized)) return { discipline: "FITASC Sporting", warning: null };
  if (/\b(compak sporting|compak|kompak)\b/.test(normalized) && !/\bleirduesti\b/.test(normalized)) return { discipline: COMPAK_SPORTING, warning: null };
  if (/\b(kompakt leirduesti|compact leirduesti|kompaktsti|compaksti|kompak leirduesti|kompakt sporting)\b/.test(normalized)) return { discipline: KOMPAKT_LEIRDUESTI, warning: null };
  if (/\bleirduesti\b/.test(normalized)) return { discipline: LEIRDUESTI, warning: null };
  if (/\bjegertrap\b/.test(normalized) || /\bnordisk\s+trap\b/.test(normalized)) return { discipline: "Jegertrap / Nordisk trap", warning: null };
  if (/\btrap\b/.test(normalized)) return { discipline: "Trap", warning: null };
  if (/\bskeet\b/.test(normalized)) return { discipline: "Skeet", warning: null };
  if (/\b(engelsk sporting|sporting)\b/.test(normalized)) return { discipline: "Sporting", warning: null };

  // TODO: Add more Leirdue.net aliases as real result lists expose them.
  return { discipline: "Other", warning: "Could not detect discipline." };
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
