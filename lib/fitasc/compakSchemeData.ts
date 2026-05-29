export type Machine = "A" | "B" | "C" | "D" | "E" | "F" | "Unknown";
export type Presentation = "single" | "report_pair" | "simo_pair" | "unknown";

export type CompakEvent = {
  schemeNumber: number;
  plateNumber: number;
  eventNumber: number;
  presentation: Presentation;
  firstMachine: Machine;
  secondMachine?: Machine;
  isVerified: boolean;
  source?: string;
};

const fitasc2025Source = "FITASC Compak Sporting Rules 2025, Annex 3 trajectory settings";

type VerifiedInput = {
  schemeNumber: number;
  presentation: Presentation;
  rows: string[][];
};

function machine(value: string): Machine {
  return ["A", "B", "C", "D", "E", "F"].includes(value) ? (value as Machine) : "Unknown";
}

function eventFromCell(schemeNumber: number, eventNumber: number, plateNumber: number, presentation: Presentation, cell: string): CompakEvent {
  const [first, second] = cell.split("-");
  return {
    schemeNumber,
    plateNumber,
    eventNumber,
    presentation,
    firstMachine: machine(first),
    ...(second ? { secondMachine: machine(second) } : {}),
    isVerified: true,
    source: fitasc2025Source,
  };
}

function singles(input: Omit<VerifiedInput, "presentation">) {
  return input.rows.flatMap((row, rowIndex) =>
    row.map((cell, cellIndex) => eventFromCell(input.schemeNumber, rowIndex + 1, cellIndex + 1, "single", cell)),
  );
}

function mixed(input: VerifiedInput) {
  return input.rows.flatMap((row, rowIndex) =>
    row.map((cell, cellIndex) => eventFromCell(input.schemeNumber, rowIndex + 1, cellIndex + 1, input.presentation, cell)),
  );
}

export const VERIFIED_COMPAK_EVENTS: CompakEvent[] = [
  ...singles({
    schemeNumber: 1,
    rows: [
      ["A", "B", "C", "D", "E"],
      ["E", "F", "A", "B", "C"],
      ["C", "D", "E", "F", "A"],
      ["F", "A", "B", "C", "D"],
      ["D", "E", "F", "A", "B"],
    ],
  }),
  ...mixed({
    schemeNumber: 10,
    presentation: "single",
    rows: [
      ["B", "D", "A", "F", "C"],
      ["E", "B", "D", "A", "F"],
      ["C", "E", "B", "D", "A"],
    ],
  }),
  ...mixed({
    schemeNumber: 10,
    presentation: "report_pair",
    rows: [["A-F", "F-C", "C-E", "E-B", "B-D"]],
  }).map((event) => ({ ...event, eventNumber: 4 })),
  ...mixed({
    schemeNumber: 33,
    presentation: "single",
    rows: [["D", "C", "F", "A", "B"]],
  }),
  ...mixed({
    schemeNumber: 33,
    presentation: "simo_pair",
    rows: [
      ["B-F", "F-A", "A-B", "B-E", "E-C"],
      ["C-E", "E-D", "D-C", "C-F", "F-D"],
    ],
  }).map((event) => ({ ...event, eventNumber: event.eventNumber + 1 })),
];
