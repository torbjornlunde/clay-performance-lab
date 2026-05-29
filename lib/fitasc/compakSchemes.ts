export type CompakSchemeRow = {
  scheme_number: number;
  plate_number: number;
  event_number: number;
  presentation: string | null;
  first_machine: string | null;
  second_machine: string | null;
  is_verified?: boolean | null;
};

export function getCompakSchemeType(schemeNumber: number | null): string {
  if (!schemeNumber) return "Unknown";
  if (schemeNumber >= 1 && schemeNumber <= 8) return "5 singles per shooting position";
  if (schemeNumber <= 16) return "3 singles and 1 report pair";
  if (schemeNumber <= 24) return "3 singles and 1 simo pair";
  if (schemeNumber <= 32) return "1 single and 2 report pairs";
  if (schemeNumber <= 40) return "1 single and 2 simo pairs";
  return "Unknown";
}

export function getPresentationLabel(presentation: string | null | undefined): string {
  switch ((presentation || "").toLowerCase()) {
    case "single":
      return "Single";
    case "report_pair":
    case "report double":
    case "report pair":
      return "Report pair";
    case "simo_pair":
    case "simo double":
    case "simo pair":
      return "Simo pair";
    default:
      return "Unknown";
  }
}

export function getMachineLabelFromRow(row: Pick<CompakSchemeRow, "first_machine" | "second_machine"> | null | undefined): string {
  if (!row?.first_machine) return "Unknown";
  return row.second_machine ? `${row.first_machine}+${row.second_machine}` : row.first_machine;
}

export function getAllSchemeNumbers(): number[] {
  return Array.from({ length: 40 }, (_, index) => index + 1);
}

export function getExpectedPresentationRows(schemeNumber: number | null): string[] {
  if (!schemeNumber) return ["unknown"];
  if (schemeNumber <= 8) return ["single", "single", "single", "single", "single"];
  if (schemeNumber <= 16) return ["single", "single", "single", "report_pair"];
  if (schemeNumber <= 24) return ["single", "single", "single", "simo_pair"];
  if (schemeNumber <= 32) return ["single", "report_pair", "report_pair"];
  if (schemeNumber <= 40) return ["single", "simo_pair", "simo_pair"];
  return ["unknown"];
}

export function pairPresentationForScheme(schemeNumber: number): "report_pair" | "simo_pair" | "unknown" {
  if ((schemeNumber >= 9 && schemeNumber <= 16) || (schemeNumber >= 25 && schemeNumber <= 32)) return "report_pair";
  if ((schemeNumber >= 17 && schemeNumber <= 24) || (schemeNumber >= 33 && schemeNumber <= 40)) return "simo_pair";
  return "unknown";
}
