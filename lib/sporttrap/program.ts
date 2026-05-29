export type SporttrapMachine = "A" | "B" | "C" | "D" | "E";
export type SporttrapPresentation = "single" | "report_pair" | "simo_pair";

export type SporttrapEvent = {
  roundNumber: number;
  standNumber: number;
  presentation: SporttrapPresentation;
  machines: SporttrapMachine[];
  firstMachine: SporttrapMachine;
  secondMachine?: SporttrapMachine;
};

const singles: SporttrapMachine[] = ["A", "B", "C", "D", "E"];
const reportPairs: [SporttrapMachine, SporttrapMachine][] = [
  ["B", "C"],
  ["C", "D"],
  ["D", "E"],
  ["E", "A"],
  ["A", "B"],
];
const simoPairs: [SporttrapMachine, SporttrapMachine][] = [
  ["D", "E"],
  ["E", "A"],
  ["A", "B"],
  ["B", "C"],
  ["C", "D"],
];

function normalizeStandNumber(standNumber: number) {
  if (!Number.isFinite(standNumber)) return 1;
  return ((((Math.trunc(standNumber) - 1) % 5) + 5) % 5) + 1;
}

function normalizeRoundNumber(roundNumber: number) {
  if (!Number.isFinite(roundNumber)) return 1;
  const normalized = Math.trunc(roundNumber);
  return normalized >= 1 && normalized <= 3 ? normalized : 1;
}

export function getSporttrapEvent(standNumber: number, roundNumber: number): SporttrapEvent {
  const safeStandNumber = normalizeStandNumber(standNumber);
  const safeRoundNumber = normalizeRoundNumber(roundNumber);
  const index = safeStandNumber - 1;

  if (safeRoundNumber === 2) {
    const machines = reportPairs[index] || reportPairs[0];
    return {
      roundNumber: safeRoundNumber,
      standNumber: safeStandNumber,
      presentation: "report_pair",
      machines,
      firstMachine: machines[0],
      secondMachine: machines[1],
    };
  }

  if (safeRoundNumber === 3) {
    const machines = simoPairs[index] || simoPairs[0];
    return {
      roundNumber: safeRoundNumber,
      standNumber: safeStandNumber,
      presentation: "simo_pair",
      machines,
      firstMachine: machines[0],
      secondMachine: machines[1],
    };
  }

  const firstMachine = singles[index] || "A";
  return {
    roundNumber: safeRoundNumber,
    standNumber: safeStandNumber,
    presentation: "single",
    machines: [firstMachine],
    firstMachine,
  };
}

export function getSporttrapMachineLabel(event: SporttrapEvent): string {
  return event.machines.length > 0 ? event.machines.join("+") : "A";
}

export function getSporttrapPresentationLabel(presentation: SporttrapPresentation): string {
  if (presentation === "report_pair") return "Report pair";
  if (presentation === "simo_pair") return "Simo pair";
  return "Single";
}

export function getSporttrapProgram(): SporttrapEvent[] {
  return [1, 2, 3].flatMap((roundNumber) => [1, 2, 3, 4, 5].map((standNumber) => getSporttrapEvent(standNumber, roundNumber)));
}
