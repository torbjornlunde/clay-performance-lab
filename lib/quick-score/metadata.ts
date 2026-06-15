export type QuickScoreCourse = {
  course: number;
  targets: number;
  hits: number;
  misses: number;
};

export type QuickScoreMetadata = {
  marker: "quick_competition_score";
  version: 1;
  resultOnly: true;
  totalTargets: number;
  totalHits: number;
  totalMisses: number;
  startCourse: number;
  courseOrder: number[];
  breakdown: QuickScoreCourse[];
  userNotes?: string;
};

export const QUICK_SCORE_MARKER = "quick_competition_score";

export function generateCourseOrder(count: number, startCourse: number) {
  if (!Number.isFinite(count) || count < 1) return [];
  const safeCount = Math.max(1, Math.floor(count));
  const safeStart = Math.min(Math.max(1, Math.floor(startCourse) || 1), safeCount);
  return Array.from({ length: safeCount }, (_, index) => ((safeStart - 1 + index) % safeCount) + 1);
}

export function isQuickScoreNotes(notes?: string | null) {
  return Boolean(notes?.includes(`"marker":"${QUICK_SCORE_MARKER}"`) || notes?.includes(QUICK_SCORE_MARKER));
}

export function serializeQuickScoreNotes(metadata: QuickScoreMetadata) {
  const { userNotes, ...stored } = metadata;
  const lines = [`Quick score metadata: ${JSON.stringify(stored)}`];
  if (userNotes?.trim()) lines.push("Notes:", userNotes.trim());
  lines.push("TODO: Detailed misses and target definitions can be added later.");
  return lines.join("\n");
}

export function parseQuickScoreMetadata(notes?: string | null): QuickScoreMetadata | null {
  if (!notes) return null;
  const match = notes.match(/Quick score metadata:\s*(\{.*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as QuickScoreMetadata;
    if (parsed?.marker !== QUICK_SCORE_MARKER || !Array.isArray(parsed.breakdown)) return null;
    return parsed;
  } catch {
    return null;
  }
}
