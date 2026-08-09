export const SCORE_SHEET_KINDS = ["training", "shared_training", "competition"] as const;

export type ScoreSheetKind = (typeof SCORE_SHEET_KINDS)[number];

export function isScoreSheetKind(value: unknown): value is ScoreSheetKind {
  return typeof value === "string" && SCORE_SHEET_KINDS.includes(value as ScoreSheetKind);
}

export function parseScoreSheetKind(value: unknown): ScoreSheetKind {
  if (!isScoreSheetKind(value)) throw new Error(`Invalid score-sheet kind: ${String(value)}`);
  return value;
}

export function isTrainingScoreSheetKind(kind: ScoreSheetKind): kind is "training" | "shared_training" {
  return kind === "training" || kind === "shared_training";
}
