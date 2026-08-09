export const COMPAK_SPORTING = "Compak Sporting";
export const KOMPAKT_LEIRDUESTI = "Kompakt leirduesti";
export const SPORTTRAP = "Sporttrap";
export const LEIRDUESTI = "Leirduesti";
export const FITASC_SPORTING = "FITASC Sporting";
export const SPORTING = "Sporting";
export const ENGLISH_SPORTING = "English Sporting";
export const JEGERTRAP_NORDISK_TRAP = "Jegertrap / Nordisk trap";
export const TRAP = "Trap";
export const SKEET = "Skeet";
export const OTHER_DISCIPLINE = "Other";

export type DisciplineScoreSheetEngine = "compak" | "generic";
export type DisciplineQuickStartKey = "compak" | "leirduesti";

export type DisciplineDefinition = {
  value: string;
  label: string;
  aliases: readonly string[];
  scoreSheetEngine: DisciplineScoreSheetEngine;
  areaSingular: string;
  areaPlural: string;
  supportsVariableTargets: boolean;
  quickStartKey?: DisciplineQuickStartKey;
  quickStartLabel?: string;
};

const genericStand = (value: string, aliases: readonly string[] = []): DisciplineDefinition => ({
  value,
  label: value,
  aliases,
  scoreSheetEngine: "generic",
  areaSingular: "Stand",
  areaPlural: "Stands",
  supportsVariableTargets: true,
});

/** Canonical selectable disciplines, in the established product order. */
export const DISCIPLINE_DEFINITIONS: readonly DisciplineDefinition[] = [
  { ...genericStand(COMPAK_SPORTING), scoreSheetEngine: "compak", areaSingular: "Plate", areaPlural: "Plates", supportsVariableTargets: false, quickStartKey: "compak", quickStartLabel: "Compak Sporting training" },
  genericStand(KOMPAKT_LEIRDUESTI),
  genericStand(SPORTTRAP),
  { ...genericStand(LEIRDUESTI), areaSingular: "Post", areaPlural: "Posts", quickStartKey: "leirduesti", quickStartLabel: "Leirduesti training" },
  genericStand(FITASC_SPORTING),
  genericStand(SPORTING),
  genericStand(ENGLISH_SPORTING, ["Engelsk sporting"]),
  genericStand(JEGERTRAP_NORDISK_TRAP),
  genericStand(TRAP),
  genericStand(SKEET),
  genericStand(OTHER_DISCIPLINE),
];

export const DISCIPLINE_OPTIONS = DISCIPLINE_DEFINITIONS.map((definition) => definition.value);

const disciplineLookup = new Map(
  DISCIPLINE_DEFINITIONS.flatMap((definition) =>
    [definition.value, ...definition.aliases].map((value) => [value.toLowerCase(), definition] as const),
  ),
);

export function canonicalizeDiscipline(discipline?: string | null) {
  const trimmed = discipline?.trim() ?? "";
  return disciplineLookup.get(trimmed.toLowerCase())?.value ?? trimmed;
}

export function getDisciplineDefinition(discipline?: string | null): DisciplineDefinition {
  const trimmed = discipline?.trim() ?? "";
  const known = disciplineLookup.get(trimmed.toLowerCase());
  if (known) return known;
  return genericStand(trimmed);
}

export function disciplineScoreSheetEngine(discipline?: string | null) {
  return getDisciplineDefinition(discipline).scoreSheetEngine;
}

export function usesCompakScoreSheetEngine(discipline?: string | null) {
  return disciplineScoreSheetEngine(discipline) === "compak";
}

// Legacy/import classification: both names intentionally remain compact-style here.
export function isCompactDiscipline(discipline?: string | null) {
  const normalized = canonicalizeDiscipline(discipline);
  return normalized === COMPAK_SPORTING || normalized === KOMPAKT_LEIRDUESTI;
}

export function isOrdinaryLeirduesti(discipline?: string | null) {
  return canonicalizeDiscipline(discipline) === LEIRDUESTI;
}

export function isPostBasedSportingDiscipline(discipline?: string | null) {
  const normalized = canonicalizeDiscipline(discipline);
  return normalized === LEIRDUESTI || normalized === SPORTING || normalized === ENGLISH_SPORTING;
}

export function postTargetUnitLabel(discipline?: string | null) {
  return getDisciplineDefinition(discipline).areaSingular;
}

// This title-only import heuristic must not be used to select a score-sheet engine.
export function leirdueTitleDisciplineHints(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("kompakt leirduesti") || normalized.includes("compact leirduesti") || normalized.includes("kompaktsti")) return KOMPAKT_LEIRDUESTI;
  if (normalized.includes("compak sporting")) return COMPAK_SPORTING;
  return null;
}
