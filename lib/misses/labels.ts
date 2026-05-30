export const leirduestiSituationOptions = ["Single", "Report pair", "Simo pair", "Reversed report pair", "Unknown"];

export function normalizeLeirduestiLabel(value?: string | null) {
  if (!value) return value || "";
  return value.replace(/equal pair/gi, "Report pair").replace(/repeated pair/gi, "Report pair");
}

export function cleanPairLabel(value?: string | null) {
  if (!value) return value || "";
  return normalizeLeirduestiLabel(value);
}

export function defaultLeirduestiSituation(defaultPostFormat?: string | null) {
  const normalizedFormat = normalizeLeirduestiLabel(defaultPostFormat).toLowerCase();
  if (normalizedFormat.includes("single")) return "Single";
  if (normalizedFormat.includes("simo")) return "Simo pair";
  if (normalizedFormat.includes("unknown") || normalizedFormat.includes("custom")) return "Unknown";
  return "Report pair";
}

export function shortMissedTarget(value?: string | null) {
  if (value === "First target in pair") return "First";
  if (value === "Second target in pair") return "Second";
  if (value === "Both targets in pair") return "Both";
  if (value === "Single target") return "Single";
  return cleanPairLabel(value) || "Unknown";
}
