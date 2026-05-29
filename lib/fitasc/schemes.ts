import { getCompakSchemeType } from "./compakSchemes";

export function getSchemeType(scheme: number) {
  return getCompakSchemeType(scheme);
}

export function getSchemeOptions() {
  return Array.from({ length: 40 }, (_, i) => {
    const scheme = i + 1;
    return { scheme, label: `Scheme ${scheme} — ${getSchemeType(scheme)}` };
  });
}

export function getTargetTypeForScheme(scheme: number, targetNumber: number) {
  const t = getSchemeType(scheme);
  if (t === "5 singles") return "Single";
  if (t.startsWith("3 singles")) return targetNumber <= 3 ? "Single" : t.includes("report") ? "Report pair" : "Simo pair";
  if (t.startsWith("1 single")) return targetNumber === 1 ? "Single" : t.includes("report") ? "Report pair" : "Simo pair";
  return "Unknown";
}

export function defaultStartPlateForShooter(n: number) {
  return n >= 1 && n <= 5 ? n : 1;
}

export function plateRotation(start: number) {
  return Array.from({ length: 5 }, (_, i) => ((start - 1 + i) % 5) + 1);
}
