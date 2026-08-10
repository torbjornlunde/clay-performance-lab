import {
  COMPAK_SPORTING,
  DISCIPLINE_DEFINITIONS,
  getDisciplineDefinition,
  type DisciplineQuickStartKey,
  type DisciplineScoreSheetEngine,
} from "../disciplines";
import { COMPAK_DEFAULT_STANDS, COMPAK_TARGETS_PER_STAND } from "./compak";

export type ScoreSheetQuickStart = {
  key: DisciplineQuickStartKey;
  label: string;
  discipline: string;
  engine: DisciplineScoreSheetEngine;
  postCount: number;
  targetsPerPost: number;
};

export const SCORE_SHEET_QUICK_START_KEYS = DISCIPLINE_DEFINITIONS
  .flatMap((definition) => definition.quickStartKey ? [definition.quickStartKey] : []);

export function normalizeScoreSheetQuickStartKey(value: string | null | undefined): DisciplineQuickStartKey | null {
  return SCORE_SHEET_QUICK_START_KEYS.find((key) => key === value) ?? null;
}

export function getScoreSheetQuickStart(value: string | null | undefined): ScoreSheetQuickStart | null {
  const key = normalizeScoreSheetQuickStartKey(value);
  if (!key) return null;
  const definition = DISCIPLINE_DEFINITIONS.find((item) => item.quickStartKey === key);
  if (!definition?.quickStartLabel) return null;
  const setup = definition.value === COMPAK_SPORTING
    ? { postCount: COMPAK_DEFAULT_STANDS, targetsPerPost: COMPAK_TARGETS_PER_STAND }
    : definition.quickStartSetup;
  if (!setup) return null;
  return {
    key,
    label: definition.quickStartLabel,
    discipline: definition.value,
    engine: getDisciplineDefinition(definition.value).scoreSheetEngine,
    ...setup,
  };
}

export function getDisciplineQuickStart(discipline: string | null | undefined) {
  return getScoreSheetQuickStart(getDisciplineDefinition(discipline).quickStartKey);
}
