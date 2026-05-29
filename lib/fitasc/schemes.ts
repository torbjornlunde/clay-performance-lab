export type FitascPresentation = "single" | "report_pair" | "simo_pair" | "unknown";

export type FitascSchemeCell = {
  id?: string;
  scheme_number: number;
  plate_number: number;
  event_number: number;
  presentation: FitascPresentation;
  first_machine: string | null;
  second_machine: string | null;
  is_verified: boolean;
  source: string | null;
};

export const MACHINE_OPTIONS = ["A", "B", "C", "D", "E", "F", "Unknown"];
export const PRESENTATION_OPTIONS: FitascPresentation[] = ["single", "report_pair", "simo_pair", "unknown"];

export function getSchemeType(scheme: number) {
  if (scheme <= 8) return "5 singles";
  if (scheme <= 16) return "3 singles + report double";
  if (scheme <= 24) return "3 singles + simo double";
  if (scheme <= 32) return "1 single + 2 report doubles";
  return "1 single + 2 simo doubles";
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
  if (t.startsWith("3 singles")) return targetNumber <= 3 ? "Single" : t.includes("report") ? "Report double" : "Simo double";
  if (t.startsWith("1 single")) return targetNumber === 1 ? "Single" : t.includes("report") ? "Report double" : "Simo double";
  return "Unknown";
}

export function presentationToTargetType(presentation: FitascPresentation | string | null | undefined) {
  if (presentation === "single") return "Single";
  if (presentation === "report_pair") return "Report double";
  if (presentation === "simo_pair") return "Simo double";
  return "Unknown";
}

export function targetTypeToPresentation(targetType: string | null | undefined): FitascPresentation {
  if (targetType === "Single") return "single";
  if (targetType === "Report double") return "report_pair";
  if (targetType === "Simo double") return "simo_pair";
  return "unknown";
}

export function formatPresentation(presentation: FitascPresentation | string | null | undefined) {
  if (presentation === "single") return "Single";
  if (presentation === "report_pair") return "Report pair";
  if (presentation === "simo_pair") return "Simo pair";
  return "Unknown";
}

export function normalizeMachine(value: string | null | undefined) {
  const machine = value?.trim().toUpperCase();
  return machine && machine !== "UNKNOWN" ? machine : null;
}

export function formatMachineLabel(cell: Pick<FitascSchemeCell, "first_machine" | "second_machine" | "presentation"> | null | undefined) {
  if (!cell) return "Unknown";
  const first = normalizeMachine(cell.first_machine);
  const second = normalizeMachine(cell.second_machine);
  if (!first) return "Unknown";
  if ((cell.presentation === "report_pair" || cell.presentation === "simo_pair") && second) return `${first}+${second}`;
  return first;
}

export function emptySchemeCell(schemeNumber: number, plateNumber: number, eventNumber: number): FitascSchemeCell {
  return {
    scheme_number: schemeNumber,
    plate_number: plateNumber,
    event_number: eventNumber,
    presentation: targetTypeToPresentation(getTargetTypeForScheme(schemeNumber, eventNumber)),
    first_machine: "Unknown",
    second_machine: null,
    is_verified: false,
    source: null,
  };
}

export function defaultStartPlateForShooter(n: number) {
  return n >= 1 && n <= 5 ? n : 1;
}

export function plateRotation(start: number) {
  return Array.from({ length: 5 }, (_, i) => ((start - 1 + i) % 5) + 1);
}
