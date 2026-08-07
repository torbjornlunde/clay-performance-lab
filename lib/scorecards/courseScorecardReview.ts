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
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !["targetNumber","result","confidence","observedMarkCategory","warning"].includes(key))) errors.push(`Target ${targetNumber} contains unsupported review data.`);
    if (raw?.confidence !== undefined && !confidences.has(raw.confidence)) errors.push(`Target ${targetNumber} has invalid confidence.`);
    if (raw?.observedMarkCategory !== undefined && raw.observedMarkCategory !== null && !marks.has(raw.observedMarkCategory)) errors.push(`Target ${targetNumber} has an invalid observed mark.`);
    if (raw?.warning !== undefined && raw.warning !== null && (typeof raw.warning !== "string" || raw.warning.length > 160)) errors.push(`Target ${targetNumber} has an invalid warning.`);
    return {
      targetNumber,
      result,
      ...(confidences.has(raw?.confidence) ? { confidence: raw.confidence } : {}),
      ...(raw?.observedMarkCategory === null || marks.has(raw?.observedMarkCategory) ? { observedMarkCategory: raw.observedMarkCategory } : {}),
      ...(typeof raw?.warning === "string" && raw.warning.trim() ? { warning: raw.warning.trim() } : {}),
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

export type CourseReviewSourceState = "current" | "source_changed" | "source_reassigned" | "source_removed" | "different_source";
export function resolveCourseReviewSourceState(review: { course_number:number; evidence_id:string|null; source_evidence_updated_at:string }, evidence?: { id:string; course_number:number|null; updated_at:string } | null): CourseReviewSourceState {
  if (!review.evidence_id || !evidence) return "source_removed";
  if (review.evidence_id !== evidence.id) return "different_source";
  if (evidence.course_number !== review.course_number) return "source_reassigned";
  if (evidence.updated_at !== review.source_evidence_updated_at) return "source_changed";
  return "current";
}

export function courseReviewSourceLabel(state: CourseReviewSourceState) {
  return state === "source_changed" ? "Source photo changed" : state === "source_reassigned" ? "Source photo reassigned" : state === "source_removed" ? "Source photo removed" : state === "different_source" ? "Different source photo" : null;
}

export function courseCandidateProposal(candidate: any) {
  const post = candidate?.posts?.[0];
  const detectedScore = Number.isInteger(post?.detectedPostScore) ? Number(post.detectedPostScore) : null;
  const detectedScoreConfidence: Confidence | null = ["high", "medium", "low"].includes(post?.detectedPostScoreConfidence) ? post.detectedPostScoreConfidence : null;
  return { candidateId: String(candidate?.candidateId || ""), displayName: candidate?.displayName || candidate?.rowLabel || null, grid: courseGridFromAnalysis(candidate?.grid || []), detectedScore, detectedScoreConfidence, reviewedScore: null, warnings: [...(candidate?.warnings || []), ...(post?.reconciliationWarning ? [post.reconciliationWarning] : [])].filter(Boolean) };
}
export function selectCourseCandidate(candidates: any[]) { return candidates.length === 1 ? courseCandidateProposal(candidates[0]) : null; }

export type CourseReviewDraft = { userId:string;sessionId:string;evidenceId:string;sourceImageFingerprint:string;sourceEvidenceUpdatedAt:string;selectedCandidateId:string;reviewedScore:number|null;grid:CourseScorecardReviewCell[];warnings:string[] };
export function courseReviewDraftKey(d: Pick<CourseReviewDraft,"userId"|"sessionId"|"evidenceId"|"sourceImageFingerprint">) { return `course-scorecard-review:${d.userId}:${d.sessionId}:${d.evidenceId}:${d.sourceImageFingerprint}`; }
export function restoreCourseReviewDraft(raw:string|null, expected:Pick<CourseReviewDraft,"userId"|"sessionId"|"evidenceId"|"sourceImageFingerprint"|"sourceEvidenceUpdatedAt">) {
  try { const draft=JSON.parse(raw||"") as CourseReviewDraft; return draft.userId===expected.userId&&draft.sessionId===expected.sessionId&&draft.evidenceId===expected.evidenceId&&draft.sourceImageFingerprint===expected.sourceImageFingerprint&&draft.sourceEvidenceUpdatedAt===expected.sourceEvidenceUpdatedAt&&validateCourseScorecardReviewGrid(draft.grid,draft.reviewedScore).ok?draft:null; } catch { return null; }
}

export function nextUncertainCourseTarget(grid:CourseScorecardReviewCell[], after?:number|null) {
  const uncertain=grid.filter(c=>c.result==="unknown"||c.confidence==="low"||Boolean(c.warning)).map(c=>c.targetNumber);
  return uncertain.find(n=>n>(after||0))||uncertain[0]||null;
}
