export type TargetMachine = "A" | "B" | "C" | "D" | "E" | "F" | "Unknown";
export type CompakPresentation = "single" | "report_pair" | "simo_pair" | "unknown";

export type CompakTargetEvent = {
  schemeNumber: number | null;
  schemeType: string;
  plate: number;
  eventNumber: number;
  presentation: CompakPresentation;
  machines: TargetMachine[];
  firstMachine: TargetMachine;
  secondMachine?: TargetMachine;
};

export type CompakScheme = {
  schemeNumber: number;
  schemeType: string;
  events: CompakTargetEvent[];
};

const MACHINE_OPTIONS: ["A", "B", "C", "D", "E", "F", "Unknown"] = ["A", "B", "C", "D", "E", "F", "Unknown"];
const PLATES = [1, 2, 3, 4, 5] as const;
const EVENT_NUMBERS = [1, 2, 3, 4, 5] as const;

export function getCompakSchemeType(schemeNumber: number | null) {
  if (!schemeNumber || schemeNumber < 1 || schemeNumber > 40) return "Unknown";
  if (schemeNumber <= 8) return "5 singles";
  if (schemeNumber <= 16) return "3 singles + report pair";
  if (schemeNumber <= 24) return "3 singles + simo pair";
  if (schemeNumber <= 32) return "1 single + 2 report pairs";
  return "1 single + 2 simo pairs";
}

function getPresentationForEvent(schemeNumber: number | null, eventNumber: number): CompakPresentation {
  if (!schemeNumber || eventNumber < 1 || eventNumber > 5) return "unknown";
  if (schemeNumber <= 8) return "single";
  if (schemeNumber <= 16) return eventNumber <= 3 ? "single" : "report_pair";
  if (schemeNumber <= 24) return eventNumber <= 3 ? "single" : "simo_pair";
  if (schemeNumber <= 32) return eventNumber === 1 ? "single" : "report_pair";
  if (schemeNumber <= 40) return eventNumber === 1 ? "single" : "simo_pair";
  return "unknown";
}

function makePlaceholderEvent(schemeNumber: number | null, plate: number, eventNumber: number): CompakTargetEvent {
  const presentation = getPresentationForEvent(schemeNumber, eventNumber);

  return {
    schemeNumber,
    schemeType: getCompakSchemeType(schemeNumber),
    plate,
    eventNumber,
    presentation,
    // TODO: Import exact FITASC scheme A-F data after verification.
    machines: ["Unknown"],
    firstMachine: "Unknown",
    secondMachine: presentation === "report_pair" || presentation === "simo_pair" ? "Unknown" : undefined,
  };
}

const COMPAK_SCHEMES: CompakScheme[] = Array.from({ length: 40 }, (_, index) => {
  const schemeNumber = index + 1;
  return {
    schemeNumber,
    schemeType: getCompakSchemeType(schemeNumber),
    events: PLATES.flatMap((plate) => EVENT_NUMBERS.map((eventNumber) => makePlaceholderEvent(schemeNumber, plate, eventNumber))),
  };
});

export function getCompakScheme(schemeNumber: number) {
  return COMPAK_SCHEMES.find((scheme) => scheme.schemeNumber === schemeNumber) ?? null;
}

export function getCompakEvent(schemeNumber: number | null, plate: number, eventNumber: number) {
  if (!schemeNumber) return makePlaceholderEvent(null, plate, eventNumber);
  const scheme = getCompakScheme(schemeNumber);
  return scheme?.events.find((event) => event.plate === plate && event.eventNumber === eventNumber) ?? makePlaceholderEvent(schemeNumber, plate, eventNumber);
}

export function getMachineOptions() {
  return MACHINE_OPTIONS;
}
