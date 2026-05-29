export type FitascSchemeRow = {
  scheme_number: number;
  plate_number: number;
  event_number: number;
  presentation: string;
  first_machine: string | null;
  second_machine: string | null;
  is_verified?: boolean;
  source?: string | null;
};

export type SchemeCell = {
  schemeNumber: number;
  plateNumber: number;
  eventNumber: number;
  presentation: string;
  firstMachine: string | null;
  secondMachine: string | null;
  isVerified: boolean;
};

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
  const type = getSchemeType(scheme);
  if (type === "5 singles") return "Single";
  if (type.startsWith("3 singles")) return targetNumber <= 3 ? "Single" : type.includes("report") ? "Report double" : "Simo double";
  if (type.startsWith("1 single")) return targetNumber === 1 ? "Single" : type.includes("report") ? "Report double" : "Simo double";
  return "Unknown";
}

export function defaultStartPlateForShooter(n: number) {
  return n >= 1 && n <= 5 ? n : 1;
}

export function plateRotation(start: number) {
  return Array.from({ length: 5 }, (_, i) => ((start - 1 + i) % 5) + 1);
}

export function machineText(firstMachine?: string | null, secondMachine?: string | null) {
  const first = firstMachine?.trim();
  const second = secondMachine?.trim();
  if (first && second) return `${first} + ${second}`;
  if (first) return first;
  if (second) return second;
  return "Unknown";
}

export function normalizeSchemeRow(row: Partial<FitascSchemeRow>, schemeNumber: number, plateNumber: number, eventNumber: number): SchemeCell {
  return {
    schemeNumber,
    plateNumber,
    eventNumber,
    presentation: row.presentation || getTargetTypeForScheme(schemeNumber, eventNumber),
    firstMachine: row.first_machine || null,
    secondMachine: row.second_machine || null,
    isVerified: Boolean(row.is_verified),
  };
}

export function makeSchemeOverview(schemeNumber: number, rows: FitascSchemeRow[] = []) {
  return Array.from({ length: 5 }, (_, eventIndex) => {
    const eventNumber = eventIndex + 1;
    return Array.from({ length: 5 }, (_, plateIndex) => {
      const plateNumber = plateIndex + 1;
      const row = rows.find((candidate) => candidate.plate_number === plateNumber && candidate.event_number === eventNumber);
      return normalizeSchemeRow(row || {}, schemeNumber, plateNumber, eventNumber);
    });
  });
}
