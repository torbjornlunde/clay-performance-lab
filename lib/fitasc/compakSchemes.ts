export type Machine = "A" | "B" | "C" | "D" | "E" | "F" | "Unknown";
export type Presentation = "single" | "report_pair" | "simo_pair" | "unknown";

export type CompakEvent = {
  eventNumber: number;
  presentation: Presentation;
  machines: Machine[];
  firstMachine: Machine;
  secondMachine?: Machine;
};

export type CompakPlate = {
  plateNumber: number;
  events: CompakEvent[];
};

export type CompakScheme = {
  schemeNumber: number;
  schemeType: string;
  plates: CompakPlate[];
};

const UNKNOWN_MACHINE: Machine = "Unknown";

function presentationForScheme(schemeNumber: number, eventNumber: number): Presentation {
  if (schemeNumber >= 1 && schemeNumber <= 8) return "single";
  if (schemeNumber >= 9 && schemeNumber <= 16) return eventNumber <= 3 ? "single" : "report_pair";
  if (schemeNumber >= 17 && schemeNumber <= 24) return eventNumber <= 3 ? "single" : "simo_pair";
  if (schemeNumber >= 25 && schemeNumber <= 32) return eventNumber === 1 ? "single" : "report_pair";
  if (schemeNumber >= 33 && schemeNumber <= 40) return eventNumber === 1 ? "single" : "simo_pair";
  return "unknown";
}

function presentationMachineCount(presentation: Presentation) {
  return presentation === "report_pair" || presentation === "simo_pair" ? 2 : 1;
}

function makeUnknownEvent(schemeNumber: number, eventNumber: number): CompakEvent {
  const presentation = presentationForScheme(schemeNumber, eventNumber);
  const machines = Array.from({ length: presentationMachineCount(presentation) }, () => UNKNOWN_MACHINE);
  return {
    eventNumber,
    presentation,
    machines,
    firstMachine: UNKNOWN_MACHINE,
    secondMachine: machines.length > 1 ? UNKNOWN_MACHINE : undefined,
  };
}

function makePlaceholderScheme(schemeNumber: number): CompakScheme {
  return {
    schemeNumber,
    schemeType: getCompakSchemeType(schemeNumber),
    plates: Array.from({ length: 5 }, (_, plateIndex) => ({
      plateNumber: plateIndex + 1,
      // TODO: Import verified official FITASC A-F scheme data.
      events: Array.from({ length: 5 }, (_, eventIndex) => makeUnknownEvent(schemeNumber, eventIndex + 1)),
    })),
  };
}

// Safe placeholder data only. Exact A-F machine sequences are intentionally Unknown
// until they are verified against official FITASC Compak schemes.
// TODO: Import verified official FITASC A-F scheme data.
const COMPAK_SCHEMES: CompakScheme[] = Array.from({ length: 40 }, (_, index) => makePlaceholderScheme(index + 1));

export function getCompakScheme(schemeNumber: number | null): CompakScheme | null {
  if (!schemeNumber) return null;
  return COMPAK_SCHEMES.find((scheme) => scheme.schemeNumber === schemeNumber) ?? null;
}

export function getCompakEvent(schemeNumber: number | null, plateNumber: number, eventNumber: number): CompakEvent {
  const safeEventNumber = eventNumber >= 1 && eventNumber <= 5 ? eventNumber : 0;
  if (!schemeNumber || safeEventNumber === 0) {
    return {
      eventNumber,
      presentation: "unknown",
      machines: [UNKNOWN_MACHINE],
      firstMachine: UNKNOWN_MACHINE,
    };
  }

  const scheme = getCompakScheme(schemeNumber);
  const plate = scheme?.plates.find((item) => item.plateNumber === plateNumber);
  return plate?.events.find((event) => event.eventNumber === eventNumber) ?? makeUnknownEvent(schemeNumber, eventNumber);
}

export function getCompakSchemeType(schemeNumber: number | null): string {
  if (!schemeNumber) return "Unknown scheme type";
  if (schemeNumber <= 8) return "5 singles";
  if (schemeNumber <= 16) return "3 singles + report double";
  if (schemeNumber <= 24) return "3 singles + simo double";
  if (schemeNumber <= 32) return "1 single + 2 report doubles";
  if (schemeNumber <= 40) return "1 single + 2 simo doubles";
  return "Unknown scheme type";
}

export function getMachineLabel(event: CompakEvent): string {
  if (!event.machines.length || event.machines.every((machine) => machine === UNKNOWN_MACHINE)) return UNKNOWN_MACHINE;
  return event.machines.join("+");
}

export function getAllSchemeNumbers(): number[] {
  return COMPAK_SCHEMES.map((scheme) => scheme.schemeNumber);
}

export function getPresentationLabel(presentation: Presentation): string {
  if (presentation === "single") return "Single";
  if (presentation === "report_pair") return "Report pair";
  if (presentation === "simo_pair") return "Simo pair";
  return "Unknown";
}
