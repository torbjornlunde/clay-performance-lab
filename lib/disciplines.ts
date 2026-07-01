export const COMPAK_SPORTING = "Compak Sporting";
export const KOMPAKT_LEIRDUESTI = "Kompakt leirduesti";
export const SPORTTRAP = "Sporttrap";
export const LEIRDUESTI = "Leirduesti";

export const DISCIPLINE_OPTIONS = [
  COMPAK_SPORTING,
  KOMPAKT_LEIRDUESTI,
  SPORTTRAP,
  LEIRDUESTI,
  "FITASC Sporting",
  "Sporting",
  "English Sporting",
  "Jegertrap / Nordisk trap",
  "Trap",
  "Skeet",
  "Other",
];

export function isCompactDiscipline(discipline?: string | null) {
  const normalized = discipline?.trim().toLowerCase();
  return (
    normalized === COMPAK_SPORTING.toLowerCase() ||
    normalized === KOMPAKT_LEIRDUESTI.toLowerCase()
  );
}

export function isOrdinaryLeirduesti(discipline?: string | null) {
  return discipline === LEIRDUESTI;
}

export function isPostBasedSportingDiscipline(discipline?: string | null) {
  const normalized = discipline?.trim().toLowerCase();
  return (
    normalized === LEIRDUESTI.toLowerCase() ||
    normalized === "sporting" ||
    normalized === "english sporting" ||
    normalized === "engelsk sporting"
  );
}

export function postTargetUnitLabel(discipline?: string | null) {
  const normalized = discipline?.trim().toLowerCase();
  return normalized === LEIRDUESTI.toLowerCase() ? "Post" : "Stand";
}

// Future Leirdue.net import readiness: titles containing "kompakt leirduesti",
// "compact leirduesti", or "kompaktsti" should map to Kompakt leirduesti,
// while titles containing "Compak Sporting" should remain Compak Sporting.
export function leirdueTitleDisciplineHints(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("kompakt leirduesti") || normalized.includes("compact leirduesti") || normalized.includes("kompaktsti")) {
    return KOMPAKT_LEIRDUESTI;
  }
  if (normalized.includes("compak sporting")) return COMPAK_SPORTING;
  return null;
}
