export type FitascPresentation =
  | "Single"
  | "Pair"
  | "Report pair"
  | "Simo pair"
  | "Unknown";

export type FitascRawSchemeRow = Record<string, unknown>;

export type FitascCell = {
  scheme: number;
  plate: number;
  rowNumber: number;
  presentation: FitascPresentation;
  machine: string;
};

export function getSchemeType(scheme: number) {
  if (scheme <= 8) return "5 singles";
  if (scheme <= 16) return "3 singles + report pair";
  if (scheme <= 24) return "3 singles + simo pair";
  if (scheme <= 32) return "1 single + 2 report pairs";
  return "1 single + 2 simo pairs";
}

export function getSchemeOptions() {
  return Array.from({ length: 40 }, (_, i) => {
    const scheme = i + 1;
    return { scheme, label: `Scheme ${scheme} — ${getSchemeType(scheme)}` };
  });
}

export function presentationForSchemeRow(
  scheme: number,
  rowNumber: number,
): FitascPresentation {
  if (scheme <= 8) return "Single";
  if (scheme <= 16) return rowNumber <= 3 ? "Single" : "Report pair";
  if (scheme <= 24) return rowNumber <= 3 ? "Single" : "Simo pair";
  if (scheme <= 32) return rowNumber === 1 ? "Single" : "Report pair";
  return rowNumber === 1 ? "Single" : "Simo pair";
}

export function rowCountForScheme(scheme: number) {
  if (scheme <= 8) return 5;
  if (scheme <= 24) return 4;
  return 3;
}

export function getTargetTypeForScheme(scheme: number, targetNumber: number) {
  return presentationForSchemeRow(scheme, targetNumber);
}

export function defaultStartPlateForShooter(n: number) {
  return n >= 1 && n <= 5 ? n : 1;
}

export function plateRotation(start: number) {
  return Array.from({ length: 5 }, (_, i) => ((start - 1 + i) % 5) + 1);
}

function readNumber(row: FitascRawSchemeRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    )
      return Number(value);
  }
  return null;
}

function readText(row: FitascRawSchemeRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return "";
}

function cleanMachineLabel(value: string) {
  const cleaned = value
    .trim()
    .replace(/^target\s*\d+\s*[:\-–—]?\s*/i, "")
    .replace(/^event\s*\d+\s*[:\-–—]?\s*/i, "")
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (!cleaned || cleaned === "UNKNOWN") return "Unknown";
  return cleaned.replace(/\s*\+\s*/g, "+");
}

function normalizePresentation(value: string): FitascPresentation | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (key.includes("single")) return "Single";
  if (key.includes("report")) return "Report pair";
  if (key.includes("simo") || key.includes("simultaneous")) return "Simo pair";
  if (key.includes("pair") || key.includes("double")) return "Pair";
  return null;
}

function machineCandidates(row: FitascRawSchemeRow) {
  const direct = readText(row, [
    "target_label",
    "machine_label",
    "machine",
    "machine_name",
    "target",
    "target_machine",
    "trap",
    "trap_label",
    "value",
  ]);
  if (direct) return [direct];

  const splitTargets = [
    readText(row, [
      "target_1",
      "target1",
      "first_target",
      "first_machine",
      "machine_1",
      "machine1",
      "trap_1",
      "trap1",
    ]),
    readText(row, [
      "target_2",
      "target2",
      "second_target",
      "second_machine",
      "machine_2",
      "machine2",
      "trap_2",
      "trap2",
    ]),
    readText(row, [
      "target_3",
      "target3",
      "third_target",
      "third_machine",
      "machine_3",
      "machine3",
      "trap_3",
      "trap3",
    ]),
  ].filter(Boolean);
  if (splitTargets.length) return splitTargets;

  return Object.entries(row)
    .filter(([key]) => /machine|trap|target/i.test(key))
    .filter(
      ([key]) =>
        !/number|order|type|presentation|event|scheme|plate/i.test(key),
    )
    .map(([, value]) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

export function normalizeFitascRows(rows: FitascRawSchemeRow[]) {
  const grouped = new Map<
    string,
    {
      scheme: number;
      plate: number;
      rowNumber: number;
      presentation: FitascPresentation | null;
      machines: { order: number; label: string }[];
    }
  >();

  for (const row of rows) {
    const scheme = readNumber(row, [
      "scheme_number",
      "scheme",
      "fitasc_scheme",
      "scheme_id",
    ]);
    const plate = readNumber(row, [
      "plate_number",
      "plate",
      "peg",
      "station",
      "stand",
    ]);
    const rowNumber = readNumber(row, [
      "event_number",
      "row_number",
      "sequence",
      "presentation_number",
      "target_number",
      "target_order",
    ]);
    if (!scheme || !plate || !rowNumber) continue;

    const key = `${scheme}:${plate}:${rowNumber}`;
    const existing = grouped.get(key) ?? {
      scheme,
      plate,
      rowNumber,
      presentation: null,
      machines: [],
    };
    const presentationText = readText(row, [
      "presentation",
      "target_type",
      "type",
      "pair_type",
    ]);
    existing.presentation =
      existing.presentation ?? normalizePresentation(presentationText);
    const targetOrder =
      readNumber(row, [
        "target_number",
        "target_order",
        "shot_number",
        "sequence_in_event",
      ]) ?? existing.machines.length + 1;
    for (const label of machineCandidates(row)) {
      existing.machines.push({
        order: targetOrder,
        label: cleanMachineLabel(label),
      });
    }
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map<FitascCell>((entry) => {
    const labels = entry.machines
      .sort((a, b) => a.order - b.order)
      .map((machine) => machine.label)
      .filter(
        (label, index, all) =>
          label !== "Unknown" && all.indexOf(label) === index,
      );

    return {
      scheme: entry.scheme,
      plate: entry.plate,
      rowNumber: entry.rowNumber,
      presentation:
        entry.presentation ??
        presentationForSchemeRow(entry.scheme, entry.rowNumber),
      machine: labels.length ? labels.join("+") : "Unknown",
    };
  });
}

export function fitascCellKey(
  scheme: number,
  plate: number,
  rowNumber: number,
) {
  return `${scheme}:${plate}:${rowNumber}`;
}

export function fitascCellMap(cells: FitascCell[]) {
  return new Map(
    cells.map((cell) => [
      fitascCellKey(cell.scheme, cell.plate, cell.rowNumber),
      cell,
    ]),
  );
}

export function fitascSelectionLabel(cell: FitascCell | null | undefined) {
  if (!cell) return "Unknown";
  return `${cell.presentation} ${cell.machine}`;
}
