import type { Confidence, ObservedMarkCategory, ScorecardCell } from "./scorecardAnalysis";

export type CourseReviewResult = "hit" | "miss" | "unknown";
export type CourseScorecardReviewCell = {
  targetNumber: number;
  result: CourseReviewResult;
  confidence?: Confidence;
  observedMarkCategory?: ObservedMarkCategory | null;
  warning?: string | null;
};

const results = new Set<CourseReviewResult>(["hit", "miss", "unknown"]);
const confidences = new Set<Confidence>(["high", "medium", "low"]);
const marks = new Set<ObservedMarkCategory>(["diagonal_stroke", "vertical_stroke", "check_mark", "circle", "zero", "horizontal_dash", "cross", "blank", "other", "unreadable"]);

export function validateCourseScorecardReviewGrid(input: unknown, reviewedScore: number | null) {
  const errors: string[] = [];
  if (!Array.isArray(input) || input.length !== 25) return { ok: false as const, errors: ["A course review must contain exactly 25 targets."] };
  const seen = new Set<number>();
  const grid: CourseScorecardReviewCell[] = input.map((raw: any) => {
    const targetNumber = Number(raw?.targetNumber);
    const result = raw?.result as CourseReviewResult;
    if (!Number.isInteger(targetNumber) || targetNumber < 1 || targetNumber > 25) errors.push("Target numbers must be 1–25.");
    if (seen.has(targetNumber)) errors.push(`Target ${targetNumber} appears more than once.`);
    seen.add(targetNumber);
    if (!results.has(result)) errors.push(`Target ${targetNumber} has an invalid result.`);
    return {
      targetNumber,
      result,
      ...(confidences.has(raw?.confidence) ? { confidence: raw.confidence } : {}),
      ...(raw?.observedMarkCategory === null || marks.has(raw?.observedMarkCategory) ? { observedMarkCategory: raw.observedMarkCategory } : {}),
      ...(typeof raw?.warning === "string" && raw.warning.trim() ? { warning: raw.warning.trim().slice(0, 160) } : {}),
    };
  }).sort((a, b) => a.targetNumber - b.targetNumber);
  for (let n = 1; n <= 25; n++) if (!seen.has(n)) errors.push(`Target ${n} is missing.`);
  const hits = grid.filter((c) => c.result === "hit").length;
  const misses = grid.filter((c) => c.result === "miss").length;
  const unknowns = grid.filter((c) => c.result === "unknown").length;
  if (reviewedScore !== null && (!Number.isInteger(reviewedScore) || reviewedScore < 0 || reviewedScore > 25)) errors.push("Course score must be blank or 0–25.");
  if (reviewedScore !== null && (reviewedScore < hits || reviewedScore > hits + unknowns)) errors.push("Course score is not possible for the reviewed targets.");
  if (reviewedScore === null && unknowns === 25) errors.push("Review at least one target or confirm the course score before saving.");
  return errors.length ? { ok: false as const, errors } : { ok: true as const, grid, hits, misses, unknowns, reviewedScore };
}

export function courseGridFromAnalysis(grid: ScorecardCell[]): CourseScorecardReviewCell[] {
  const byTarget = new Map(grid.filter((c) => c.postNumber === 1).map((c) => [c.targetNumber, c]));
  return Array.from({ length: 25 }, (_, index) => {
    const cell = byTarget.get(index + 1);
    return { targetNumber: index + 1, result: cell?.result || "unknown", confidence: cell?.confidence || "low", observedMarkCategory: cell?.observedMarkCategory || null, ...(cell?.warning ? { warning: cell.warning } : {}) };
  });
}

export async function fingerprintScorecardEvidenceBlob(blob: Blob) {
  return Buffer.from(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())).toString("hex");
}
