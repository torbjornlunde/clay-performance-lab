export const presentationOverrideOptions = [
  "Use scheme default",
  "Single",
  "Report pair",
  "Simo pair",
  "Unknown",
] as const;
export const actualPresentationOptions = [
  "Single",
  "Report pair",
  "Simo pair",
  "Unknown",
] as const;

export function normalizePresentation(value: string | null | undefined) {
  if (!value) return "Unknown";
  const cleaned = value
    .replace(/equal pair/gi, "Report pair")
    .replace(/repeated pair/gi, "Report pair")
    .trim();
  if (/^single$/i.test(cleaned)) return "Single";
  if (/report/i.test(cleaned)) return "Report pair";
  if (/simo|simultaneous/i.test(cleaned)) return "Simo pair";
  if (/unknown/i.test(cleaned)) return "Unknown";
  return cleaned;
}

export function isPairPresentation(value: string | null | undefined) {
  return normalizePresentation(value) !== "Single";
}

export function splitPairLabel(label: string | null | undefined) {
  if (!label) return { first: null, second: null };
  const parts = label
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  return { first: parts[0] || null, second: parts[1] || null };
}

export function pairLabel(
  first: string | null | undefined,
  second: string | null | undefined,
) {
  return first && second ? `${first}+${second}` : first || second || null;
}

export function orderLabel(
  first: string | null | undefined,
  second: string | null | undefined,
  reversed: boolean,
) {
  return reversed ? pairLabel(second, first) : pairLabel(first, second);
}

export function orderedPairMachines(
  first: string | null | undefined,
  second: string | null | undefined,
  reversed: boolean,
) {
  return reversed
    ? { first: second || null, second: first || null }
    : { first: first || null, second: second || null };
}

export function missedTargetShort(value: string | null | undefined) {
  if (value === "First target in pair") return "First";
  if (value === "Second target in pair") return "Second";
  if (value === "Both targets in pair") return "Both";
  if (value === "Single target") return "Single";
  return value || "Unknown";
}
