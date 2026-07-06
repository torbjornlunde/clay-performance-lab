import { isSimpleTargetLabel, type PostSignAnalysisResult, type PostSignPresentation, type NotationKind } from "./postSignAnalysis";
import type { PresentationType } from "./postTargets";

export type PairConventionChoice = "report_pair" | "simultaneous_pair" | "manual";
export type PairConventionChoices = Partial<Record<"plus" | "joined" | "arrow" | "other", PairConventionChoice>>;
export const unresolvedNotationKinds = ["plus", "joined", "arrow", "other"] as const;

export function unresolvedKinds(review: PostSignAnalysisResult) {
  return Array.from(new Set(review.presentations.filter((p) => p.structuralKind === "pair" && p.typeEvidence === "user_convention_required").map((p) => p.notationKind).filter((k): k is "plus"|"joined"|"arrow"|"other" => unresolvedNotationKinds.includes(k as any))));
}
export function conventionQuestionNeeded(review: PostSignAnalysisResult) { return unresolvedKinds(review).length > 0; }
export function applyPairConventions(review: PostSignAnalysisResult, choices: PairConventionChoices): PostSignAnalysisResult {
  const merged = { ...(review.notationConventions || {}), ...choices };
  return { ...review, notationConventions: merged, presentations: review.presentations.map((p) => {
    const choice = choices[p.notationKind as keyof PairConventionChoices];
    if (p.structuralKind !== "pair" || p.typeEvidence !== "user_convention_required" || p.presentationType !== "unknown" || !choice || choice === "manual") return p;
    return { ...p, presentationType: choice, warnings: p.warnings.filter((w) => !/notation convention/i.test(w)) };
  }) };
}
export function unresolvedPairCount(review: PostSignAnalysisResult) { return review.presentations.filter((p) => p.structuralKind === "pair" && p.presentationType === "unknown").length; }
export function summarizePresentations(rows: PostSignPresentation[]) { return rows.reduce((a,p)=>{ a.presentations++; a.targets += p.targetLabels.length; if(p.presentationType==="single") a.singles++; else if(p.presentationType==="report_pair") a.reportPairs++; else if(p.presentationType==="simultaneous_pair") a.simultaneousPairs++; else a.needsReview++; return a; }, {presentations:0, targets:0, singles:0, reportPairs:0, simultaneousPairs:0, needsReview:0}); }
export function moveReviewRow(rows: PostSignPresentation[], index: number, delta: number) { const next=[...rows]; const to=index+delta; if(to<0||to>=next.length) return rows; [next[index],next[to]]=[next[to],next[index]]; return next.map((p,i)=>({...p,presentationNumber:i+1})); }
export function removeReviewRow(rows: PostSignPresentation[], index: number) { return rows.filter((_,i)=>i!==index).map((p,i)=>({...p,presentationNumber:i+1})); }
export function notationLabel(kind: NotationKind) { return kind === "plus" ? "A+B" : kind === "joined" ? "AB" : kind === "arrow" ? "A → B" : "this style"; }
export function displayNotation(p: PostSignPresentation) { return p.sourceNotation || p.targetLabels.join(p.presentationType === "simultaneous_pair" ? "+" : p.presentationType === "single" ? "" : "→"); }
export function hasBlockingUnresolvedPairs(review: PostSignAnalysisResult | null) { return !!review && unresolvedPairCount(review) > 0; }
export function resolvedTypeLabel(type: PresentationType) { return type === "unknown" ? "Needs review" : type === "report_pair" ? "Report pair" : type === "simultaneous_pair" ? "Simultaneous pair" : type === "single" ? "Single" : "Other pair"; }

export function normalizeReviewTargetLabel(label: string) { return label.trim().toUpperCase(); }
export function detectedTargetLabels(review: PostSignAnalysisResult) { return Array.from(new Set(review.presentations.flatMap((p) => p.targetLabels.map(normalizeReviewTargetLabel).filter(Boolean)))); }
export function validateReviewTargetLabels(review: PostSignAnalysisResult) {
  const labels = review.presentations.flatMap((p) => p.targetLabels);
  const invalid = labels.find((label) => !normalizeReviewTargetLabel(label) || !isSimpleTargetLabel(label));
  if (invalid !== undefined) return { ok: false as const, message: `Target label "${invalid}" is not a simple individual label. Use labels such as A, B or C before applying.` };
  const unique = detectedTargetLabels(review);
  if (unique.length !== new Set(unique).size) return { ok: false as const, message: "Detected target labels must be unique before applying." };
  return { ok: true as const };
}
export function renameDetectedTargetLabel(review: PostSignAnalysisResult, oldLabel: string, nextLabel: string) {
  const oldNormalized = normalizeReviewTargetLabel(oldLabel);
  const nextNormalized = normalizeReviewTargetLabel(nextLabel);
  if (!nextNormalized || !isSimpleTargetLabel(nextNormalized)) return { ok: false as const, review, message: "Use a simple target label such as A, B or C." };
  const labels = detectedTargetLabels(review);
  if (labels.some((label) => label !== oldNormalized && label === nextNormalized)) return { ok: false as const, review, message: `Target ${nextNormalized} already exists. Choose a unique label before applying.` };
  return { ok: true as const, review: { ...review, presentations: review.presentations.map((p) => ({ ...p, targetLabels: p.targetLabels.map((label) => normalizeReviewTargetLabel(label) === oldNormalized ? nextNormalized : label) })) } };
}
