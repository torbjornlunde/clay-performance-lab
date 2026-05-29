import { verifiedCompakSchemes, type CompakCellValue } from "./compakSchemeData";

export type CompakTargetType = "Single" | "Report pair" | "Simo pair" | "Unknown";

export type CompakEvent = {
  schemeNumber: number | null;
  plateNumber: number;
  eventNumber: number;
  machine: CompakCellValue | "Unknown";
  isVerified: boolean;
  isPair: boolean;
  targetType: CompakTargetType;
};

const SCHEME_NUMBERS = Array.from({ length: 40 }, (_, index) => index + 1);

function isValidSchemeNumber(schemeNumber: number | null): schemeNumber is number {
  return typeof schemeNumber === "number" && Number.isInteger(schemeNumber) && schemeNumber >= 1 && schemeNumber <= 40;
}

function isPairCell(value: CompakCellValue | "Unknown") {
  return value.includes("+");
}

export function getCompakSchemeType(schemeNumber: number | null): string {
  if (!isValidSchemeNumber(schemeNumber)) return "Unknown";
  if (schemeNumber <= 8) return "5 singles";
  if (schemeNumber <= 16) return "3 singles + report pair";
  if (schemeNumber <= 24) return "3 singles + simo pair";
  if (schemeNumber <= 32) return "1 single + 2 report pairs";
  return "1 single + 2 simo pairs";
}

export function getCompakEvent(schemeNumber: number | null, plateNumber: number, eventNumber: number): CompakEvent {
  const normalizedPlate = Number.isInteger(plateNumber) && plateNumber >= 1 && plateNumber <= 5 ? plateNumber : 1;
  const normalizedEvent = Number.isInteger(eventNumber) && eventNumber >= 1 && eventNumber <= 5 ? eventNumber : 1;
  const scheme = isValidSchemeNumber(schemeNumber) ? schemeNumber : null;
  const verifiedScheme = scheme ? verifiedCompakSchemes[scheme] : undefined;
  const machine = verifiedScheme?.plates[normalizedPlate - 1]?.[normalizedEvent - 1] ?? "Unknown";
  const type = getCompakSchemeType(scheme);
  const isKnownReportPair = type.includes("report") && (type.startsWith("3 singles") ? normalizedEvent > 3 : normalizedEvent > 1);
  const isKnownSimoPair = type.includes("simo") && (type.startsWith("3 singles") ? normalizedEvent > 3 : normalizedEvent > 1);
  const targetType: CompakTargetType =
    isPairCell(machine) || isKnownReportPair || isKnownSimoPair
      ? isKnownSimoPair
        ? "Simo pair"
        : "Report pair"
      : type === "Unknown"
        ? "Unknown"
        : "Single";

  return {
    schemeNumber: scheme,
    plateNumber: normalizedPlate,
    eventNumber: normalizedEvent,
    machine,
    isVerified: Boolean(verifiedScheme && machine !== "Unknown"),
    isPair: targetType === "Report pair" || targetType === "Simo pair",
    targetType,
  };
}

export function getMachineLabel(event: CompakEvent | null | undefined) {
  return event?.machine ?? "Unknown";
}

export function getAllSchemeNumbers() {
  return SCHEME_NUMBERS;
}

export function hasVerifiedSchemeData(schemeNumber: number) {
  return Boolean(isValidSchemeNumber(schemeNumber) && verifiedCompakSchemes[schemeNumber]);
}

export function getCompakSchemeOptions() {
  return SCHEME_NUMBERS.map((scheme) => ({ scheme, label: `Scheme ${scheme} — ${getCompakSchemeType(scheme)}` }));
}
