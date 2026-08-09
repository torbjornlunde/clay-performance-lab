import { isTrainingScoreSheetKind, type ScoreSheetKind } from "./kind";

export function scoreSheetCountsAsTraining(kind: ScoreSheetKind) {
  return isTrainingScoreSheetKind(kind);
}

export function canWriteOwnedScoreSheet(actorUserId: string, ownerUserId: string) {
  return Boolean(actorUserId) && actorUserId === ownerUserId;
}

export function canSaveCompetitionScoreSheet(kind: ScoreSheetKind) {
  return kind === "competition";
}

export function canSaveTrainingScoreSheet(kind: ScoreSheetKind) {
  return isTrainingScoreSheetKind(kind);
}

// Score sheets remain independent records; future competition sheets must not
// silently create or convert a personal session.
export function shouldCreatePersonalSessionForScoreSheet(_kind: ScoreSheetKind) {
  return false;
}
