import { CompakEvent, Machine, Presentation, VERIFIED_COMPAK_EVENTS } from "./compakSchemeData";

const PRESENTATION_LABELS: Record<Presentation, string> = {
  single: "Single",
  report_pair: "Report pair",
  simo_pair: "Simo pair",
  unknown: "Unknown",
};

export function getCompakSchemeType(schemeNumber: number | null) {
  if (!schemeNumber || schemeNumber < 1 || schemeNumber > 40) return "Unknown";
  if (schemeNumber <= 8) return "5 singles";
  if (schemeNumber <= 16) return "3 singles + report pair";
  if (schemeNumber <= 24) return "3 singles + simo pair";
  if (schemeNumber <= 32) return "1 single + 2 report pairs";
  return "1 single + 2 simo pairs";
}

export function getCompakSchemeEvents(schemeNumber: number) {
  return VERIFIED_COMPAK_EVENTS.filter((event) => event.schemeNumber === schemeNumber).sort((a, b) => a.eventNumber - b.eventNumber || a.plateNumber - b.plateNumber);
}

export function hasVerifiedSchemeData(schemeNumber: number) {
  return getCompakSchemeEvents(schemeNumber).length > 0;
}

function fallbackPresentation(schemeNumber: number | null, eventNumber: number): Presentation {
  if (!schemeNumber || schemeNumber < 1 || schemeNumber > 40) return "unknown";
  if (schemeNumber <= 8) return eventNumber >= 1 && eventNumber <= 5 ? "single" : "unknown";
  if (schemeNumber <= 16) return eventNumber >= 1 && eventNumber <= 3 ? "single" : eventNumber === 4 ? "report_pair" : "unknown";
  if (schemeNumber <= 24) return eventNumber >= 1 && eventNumber <= 3 ? "single" : eventNumber === 4 ? "simo_pair" : "unknown";
  if (schemeNumber <= 32) return eventNumber === 1 ? "single" : eventNumber === 2 || eventNumber === 3 ? "report_pair" : "unknown";
  return eventNumber === 1 ? "single" : eventNumber === 2 || eventNumber === 3 ? "simo_pair" : "unknown";
}

function unknownPairMachine(presentation: Presentation): { secondMachine?: Machine } {
  return presentation === "report_pair" || presentation === "simo_pair" ? { secondMachine: "Unknown" } : {};
}

export function getCompakEvent(schemeNumber: number | null, plateNumber: number, eventNumber: number): CompakEvent {
  const verified = VERIFIED_COMPAK_EVENTS.find(
    (event) => event.schemeNumber === schemeNumber && event.plateNumber === plateNumber && event.eventNumber === eventNumber,
  );
  if (verified) return verified;

  const presentation = fallbackPresentation(schemeNumber, eventNumber);
  return {
    schemeNumber: schemeNumber ?? 0,
    plateNumber,
    eventNumber,
    presentation,
    firstMachine: "Unknown",
    ...unknownPairMachine(presentation),
    isVerified: false,
  };
}

export function getMachineLabel(event: CompakEvent) {
  if (!event.isVerified || event.firstMachine === "Unknown") return "Unknown";
  if (event.presentation === "report_pair" || event.presentation === "simo_pair") {
    return event.secondMachine && event.secondMachine !== "Unknown" ? `${event.firstMachine}+${event.secondMachine}` : "Unknown";
  }
  return event.firstMachine;
}

export function getPresentationLabel(presentation: Presentation) {
  return PRESENTATION_LABELS[presentation];
}

export function getEventCountForScheme(schemeNumber: number | null) {
  const type = getCompakSchemeType(schemeNumber);
  if (type === "5 singles") return 5;
  if (type.startsWith("3 singles")) return 4;
  if (type.startsWith("1 single")) return 3;
  return 5;
}
