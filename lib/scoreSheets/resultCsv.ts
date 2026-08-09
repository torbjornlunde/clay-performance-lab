import type { ProjectedShooterResult } from "./results";

export type CompetitionResultCsvMetadata = { competition: string; date: string; location: string; discipline: string; finalizedAt: string; reopenCount: number; finalizedIncomplete: boolean; postLabel: string };

export function sanitizeCsvText(value: string) {
  return /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string | number, textCell = false) {
  const raw = textCell ? sanitizeCsvText(String(value)) : String(value);
  return /[",\r\n]|^\s|\s$/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function buildCompetitionResultCsv(metadata: CompetitionResultCsvMetadata, rows: ProjectedShooterResult[]) {
  const postCount = rows[0]?.postScores.length || 0;
  const headers = ["Competition", "Date", "Location", "Discipline", "Finalized at", "Corrected", "Reopen count", "Finalized incomplete", "Shooter", ...Array.from({ length: postCount }, (_, i) => `${metadata.postLabel} ${i + 1}`), "Total", "Scored targets", "Unscored targets"];
  const lines = [headers.map((value) => escapeCsvCell(value, true)).join(",")];
  for (const row of rows) {
    const values: Array<[string | number, boolean]> = [[metadata.competition, true], [metadata.date, true], [metadata.location, true], [metadata.discipline, true], [metadata.finalizedAt, true], [metadata.reopenCount > 0 ? "Yes" : "No", true], [metadata.reopenCount, false], [metadata.finalizedIncomplete ? "Yes" : "No", true], [row.displayName, true], ...row.postScores.map((score) => [score, false] as [number, false]), [row.totalScore, false], [row.scoredTargets, false], [row.unscoredTargets, false]];
    lines.push(values.map(([value, text]) => escapeCsvCell(value, text)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function competitionResultFilename(date: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "result";
  return `competition-results-${safeDate}.csv`;
}
