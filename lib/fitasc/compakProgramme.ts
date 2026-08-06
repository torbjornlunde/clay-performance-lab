export const COMPAK_PROGRAMME_TYPES = [
  { code: "five_singles", label: "5 singles", singles: 5, reportPairs: 0, simultaneousPairs: 0, physicalTargets: 5 },
  { code: "three_singles_one_report_pair", label: "3 singles + 1 report pair", singles: 3, reportPairs: 1, simultaneousPairs: 0, physicalTargets: 5 },
  { code: "three_singles_one_simultaneous_pair", label: "3 singles + 1 simultaneous pair", singles: 3, reportPairs: 0, simultaneousPairs: 1, physicalTargets: 5 },
  { code: "one_single_two_report_pairs", label: "1 single + 2 report pairs", singles: 1, reportPairs: 2, simultaneousPairs: 0, physicalTargets: 5 },
  { code: "one_single_two_simultaneous_pairs", label: "1 single + 2 simultaneous pairs", singles: 1, reportPairs: 0, simultaneousPairs: 2, physicalTargets: 5 },
] as const;

export type CompakProgrammeType = (typeof COMPAK_PROGRAMME_TYPES)[number]["code"];
export type CompakConflictResolution = "exact_authoritative" | "remembered_discrepancy";
export type CompakCourseCompleteness = "Exact" | "Partial" | "Unknown";
export type CompakDetailMode = "exact" | "programme" | "unknown";
export type CompakComparisonState = "not_applicable" | "match" | "conflict" | "unclassifiable";

export type CompakCourseSetup = {
  detailMode: CompakDetailMode;
  scheme: number | null;
  rememberedProgramme: CompakProgrammeType | null;
  conflictResolution: CompakConflictResolution | null;
};

export function deriveCompakDetailMode(scheme: number | null | undefined, remembered: CompakProgrammeType | null | undefined): CompakDetailMode {
  return scheme != null ? "exact" : remembered ? "programme" : "unknown";
}

export function transitionCompakDetailMode(course: CompakCourseSetup, nextMode: CompakDetailMode, confirmed = false) {
  const requiresConfirmation = course.scheme != null && course.detailMode === "exact" && nextMode !== "exact";
  if (requiresConfirmation && !confirmed) return { course, changed: false, requiresConfirmation: true } as const;
  if (nextMode === "unknown") return { course: { ...course, detailMode: nextMode, scheme: null, rememberedProgramme: null, conflictResolution: null }, changed: true, requiresConfirmation: false } as const;
  if (nextMode === "programme") return { course: { ...course, detailMode: nextMode, scheme: null, conflictResolution: null }, changed: true, requiresConfirmation: false } as const;
  return { course: { ...course, detailMode: nextMode, conflictResolution: null }, changed: true, requiresConfirmation: false } as const;
}

export function selectCompakScheme(course: CompakCourseSetup, value: string): CompakCourseSetup {
  const scheme = value === "" ? null : Number(value);
  return { ...course, scheme: Number.isInteger(scheme) && Number(scheme) > 0 ? scheme : null, conflictResolution: null };
}

export function selectCompakProgramme(course: CompakCourseSetup, value: string): CompakCourseSetup {
  return { ...course, rememberedProgramme: isCompakProgrammeType(value) ? value : null, conflictResolution: null };
}

export function normalizeCompakSetupForDiscipline(course: CompakCourseSetup, isCompak: boolean): CompakCourseSetup {
  return isCompak ? course : { ...course, detailMode: "unknown", scheme: null, rememberedProgramme: null, conflictResolution: null };
}

export function isCompakProgrammeType(value: unknown): value is CompakProgrammeType {
  return COMPAK_PROGRAMME_TYPES.some((programme) => programme.code === value);
}

export function getCompakProgrammeLabel(value: CompakProgrammeType | null | undefined) {
  return COMPAK_PROGRAMME_TYPES.find((programme) => programme.code === value)?.label ?? "Unknown";
}

export function classifyCompakPresentations(rows: readonly unknown[]): CompakProgrammeType | null {
  if (!Array.isArray(rows) || rows.length < 3 || rows.length > 5) return null;
  let singles = 0;
  let reportPairs = 0;
  let simultaneousPairs = 0;
  for (const raw of rows) {
    const value = typeof raw === "string" ? raw.toLowerCase() : "";
    if (value === "single") singles += 1;
    else if (value === "report_pair") reportPairs += 1;
    else if (value === "simo_pair" || value === "simultaneous_pair") simultaneousPairs += 1;
    else return null;
  }
  const match = COMPAK_PROGRAMME_TYPES.find((programme) =>
    programme.singles === singles && programme.reportPairs === reportPairs && programme.simultaneousPairs === simultaneousPairs,
  );
  return match?.code ?? null;
}

export function getCompakCourseCompleteness(scheme: number | null | undefined, remembered: CompakProgrammeType | null | undefined): CompakCourseCompleteness {
  if (scheme != null) return "Exact";
  return remembered ? "Partial" : "Unknown";
}

export function getCompakConflict(
  schemePresentations: readonly unknown[] | null,
  remembered: CompakProgrammeType | null | undefined,
) {
  if (!schemePresentations || !remembered) return { exactProgramme: null, state: "not_applicable" as CompakComparisonState };
  const exactProgramme = classifyCompakPresentations(schemePresentations);
  if (!exactProgramme) return { exactProgramme: null, state: "unclassifiable" as CompakComparisonState };
  return { exactProgramme, state: (exactProgramme === remembered ? "match" : "conflict") as CompakComparisonState };
}

export function validateCompakCourse(input: {
  isCompak: boolean;
  detailMode?: CompakDetailMode;
  scheme: number | null;
  rememberedProgramme: CompakProgrammeType | null;
  conflictResolution: CompakConflictResolution | null;
  schemePresentations?: readonly unknown[] | null;
}) {
  if (!input.isCompak && (input.scheme || input.rememberedProgramme || input.conflictResolution)) return "Programme types are only available for Compak courses.";
  if (input.detailMode === "exact" && input.scheme == null) return "Choose a FITASC scheme before saving.";
  if (input.detailMode === "programme" && input.rememberedProgramme == null) return "Choose a programme type before saving.";
  if (input.rememberedProgramme && !isCompakProgrammeType(input.rememberedProgramme)) return "Choose a valid Compak programme type.";
  if (input.conflictResolution && (!input.scheme || !input.rememberedProgramme)) return "A discrepancy choice requires both an exact scheme and a remembered programme.";
  const conflict = getCompakConflict(input.schemePresentations ?? null, input.rememberedProgramme);
  if (conflict.state === "unclassifiable") return "The selected FITASC scheme programme cannot be classified. Review the scheme before saving.";
  if (conflict.state === "conflict" && !input.conflictResolution) return "Choose how to resolve the programme discrepancy before saving.";
  if (conflict.state !== "conflict" && input.conflictResolution) return "The saved discrepancy choice is stale. Review the course again.";
  return null;
}

export function compakCourseSummary(courseNumber: number, scheme: number | null, remembered: CompakProgrammeType | null, resolution: CompakConflictResolution | null = null) {
  const completeness = getCompakCourseCompleteness(scheme, remembered);
  if (scheme != null) return `Course ${courseNumber} · Exact · Scheme ${scheme}${resolution === "remembered_discrepancy" ? " · Discrepancy" : ""}`;
  if (remembered) return `Course ${courseNumber} · Partial · ${getCompakProgrammeLabel(remembered)}`;
  return `Course ${courseNumber} · ${completeness}`;
}
