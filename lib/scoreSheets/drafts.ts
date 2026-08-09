import { isScoreSheetKind, isTrainingScoreSheetKind, type ScoreSheetKind } from "./kind";

export const LEGACY_TRAINING_DRAFT_PREFIX = "training_score_sheet_draft:";
export const OLDEST_TRAINING_DRAFT_PREFIX = "training-score-sheet:";
const SHARED_DRAFT_PREFIX = "score_sheet_draft:";

export function scoreSheetDraftKey(kind: ScoreSheetKind, sheetId: string) {
  // Preserve the canonical Training key so existing drafts and list views keep working.
  if (kind === "training" || kind === "shared_training") return `${LEGACY_TRAINING_DRAFT_PREFIX}${sheetId}`;
  return `${SHARED_DRAFT_PREFIX}${kind}:${sheetId}`;
}

export function legacyTrainingDraftKey(sheetId: string) {
  return `${OLDEST_TRAINING_DRAFT_PREFIX}${sheetId}:autosave`;
}

export function scoreSheetDraftLookupKeys(kind: ScoreSheetKind, sheetId: string) {
  const canonical = scoreSheetDraftKey(kind, sheetId);
  return kind === "training" || kind === "shared_training"
    ? [canonical, legacyTrainingDraftKey(sheetId)]
    : [canonical];
}

export function scoreSheetKindFromDraft(value: unknown): ScoreSheetKind | null {
  if (value === undefined) return "training";
  return isScoreSheetKind(value) ? value : null;
}

export function canRestoreDraftInTraining(value: unknown) {
  const kind = scoreSheetKindFromDraft(value);
  return kind !== null && isTrainingScoreSheetKind(kind);
}

export function migrateLegacyTrainingDraft<T>(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, sheetId: string, parse: (raw: string | null) => T | null) {
  const canonical = scoreSheetDraftKey("training", sheetId);
  const current = parse(storage.getItem(canonical));
  if (current) return current;
  const legacyKey = legacyTrainingDraftKey(sheetId);
  const legacy = parse(storage.getItem(legacyKey));
  if (legacy) {
    storage.setItem(canonical, JSON.stringify(legacy));
    storage.removeItem(legacyKey);
  }
  return legacy;
}
