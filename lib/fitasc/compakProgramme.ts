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
  if (!schemePresentations || !remembered) return { exactProgramme: null, conflicts: false } as const;
  const exactProgramme = classifyCompakPresentations(schemePresentations);
  return { exactProgramme, conflicts: exactProgramme !== null && exactProgramme !== remembered };
}

export function validateCompakCourse(input: {
  isCompak: boolean;
  scheme: number | null;
  rememberedProgramme: CompakProgrammeType | null;
  conflictResolution: CompakConflictResolution | null;
  schemePresentations?: readonly unknown[] | null;
}) {
  if (!input.isCompak && (input.rememberedProgramme || input.conflictResolution)) return "Programme types are only available for Compak courses.";
  if (input.rememberedProgramme && !isCompakProgrammeType(input.rememberedProgramme)) return "Choose a valid Compak programme type.";
  if (input.conflictResolution && (!input.scheme || !input.rememberedProgramme)) return "A discrepancy choice requires both an exact scheme and a remembered programme.";
  const conflict = getCompakConflict(input.schemePresentations ?? null, input.rememberedProgramme);
  if (conflict.conflicts && !input.conflictResolution) return "Choose how to resolve the programme discrepancy before saving.";
  if (!conflict.conflicts && input.conflictResolution) return "The saved discrepancy choice is stale. Review the course again.";
  return null;
}

export function compakCourseSummary(courseNumber: number, scheme: number | null, remembered: CompakProgrammeType | null, resolution: CompakConflictResolution | null = null) {
  const completeness = getCompakCourseCompleteness(scheme, remembered);
  if (scheme != null) return `Course ${courseNumber} · Exact · Scheme ${scheme}${resolution === "remembered_discrepancy" ? " · Discrepancy" : ""}`;
  if (remembered) return `Course ${courseNumber} · Partial · ${getCompakProgrammeLabel(remembered)}`;
  return `Course ${courseNumber} · ${completeness}`;
}
