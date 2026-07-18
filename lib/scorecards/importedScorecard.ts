import { displayedPostScore, normalizeExpectedTargetsByPost, type TargetResultMap } from "../trainingScoreSheets/safety";
import type { Confidence, ScorecardCell, ScorecardOutcome } from "./scorecardAnalysis";

export type ImportedCellState = "active_blank" | "inactive" | "hit" | "miss" | "uncertain";
export type ImportedScorecardTarget = { targetNumber: number; cellState: ImportedCellState; result?: ScorecardOutcome | "uncertain" | null; confidence?: Confidence | null; rawMark?: string | null };
export type ImportedScorecardPost = { postNumber: number; expectedTargets?: number | null; targets?: ImportedScorecardTarget[]; detectedScore?: number | null; confidence?: Confidence | null };
export type ImportedScorecardStructure = { sessionType?: "Training" | "Competition" | string | null; discipline?: string | null; shooterName?: string | null; date?: string | null; shootingGround?: string | null; totalTargets?: number | null; totalScore?: number | null; posts: ImportedScorecardPost[]; overallConfidence?: Confidence | null; warnings?: string[] | null };
export type NormalizedImportedPost = { postNumber: number; expectedTargets: number; targets: ScorecardCell[]; detectedScore: number | null; confidence: Confidence | null; scoringMode: "detailed" | "total_only" | "blank"; warnings: string[] };
export type NormalizedImportedScorecard = Omit<ImportedScorecardStructure, "posts" | "warnings"> & { posts: NormalizedImportedPost[]; expectedTargetsByPost: number[]; totalTargets: number; totalScore: number | null; warnings: string[] };

const confidenceValues = new Set(["high", "medium", "low"]);
function cleanConfidence(value: unknown): Confidence | null { return confidenceValues.has(String(value)) ? value as Confidence : null; }
function positiveInt(value: unknown) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n > 0 ? n : null; }
function boundedScore(value: unknown, max: number) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; }
function targetToCell(postNumber: number, target: ImportedScorecardTarget): ScorecardCell | null {
  const targetNumber = positiveInt(target.targetNumber);
  if (!targetNumber || target.cellState === "inactive") return null;
  const result = target.cellState === "hit" || target.result === "hit" ? "hit" : target.cellState === "miss" || target.result === "miss" ? "miss" : "unknown";
  return { postNumber, targetNumber, result, rawMark: target.rawMark || null, observedMarkCategory: target.cellState === "active_blank" ? "blank" : target.cellState === "uncertain" ? "unreadable" : null, confidence: cleanConfidence(target.confidence) || (result === "unknown" ? "low" : "medium"), warning: target.cellState === "uncertain" || target.result === "uncertain" ? "Uncertain mark; review before saving." : null };
}

export function normalizeImportedPostStructure(input: ImportedScorecardStructure): NormalizedImportedScorecard {
  const warnings = (input.warnings || []).filter((w): w is string => typeof w === "string" && w.trim().length > 0);
  const posts = [...(Array.isArray(input.posts) ? input.posts : [])].sort((a, b) => (positiveInt(a.postNumber) || 0) - (positiveInt(b.postNumber) || 0)).map((post, idx) => {
    const postNumber = positiveInt(post.postNumber) || idx + 1;
    const activeCells = (post.targets || []).map((target) => targetToCell(postNumber, target)).filter((cell): cell is ScorecardCell => Boolean(cell)).sort((a, b) => a.targetNumber - b.targetNumber);
    const expectedTargets = positiveInt(post.expectedTargets) || activeCells.length || Math.max(1, boundedScore(post.detectedScore, 500) || 1);
    const targets = activeCells.filter((cell) => cell.targetNumber <= expectedTargets);
    const detailedCount = targets.filter((cell) => cell.result === "hit" || cell.result === "miss").length;
    const scoringMode: NormalizedImportedPost["scoringMode"] = detailedCount > 0 ? "detailed" : boundedScore(post.detectedScore, expectedTargets) !== null ? "total_only" : "blank";
    return { postNumber, expectedTargets, targets, detectedScore: boundedScore(post.detectedScore, expectedTargets), confidence: cleanConfidence(post.confidence), scoringMode, warnings: activeCells.length > expectedTargets ? [`Post ${postNumber} has interpreted cells beyond the expected target count; extra cells were kept out of scoring.`] : [] };
  });
  const expectedTargetsByPost = posts.map((post) => post.expectedTargets);
  const totalTargets = calculateImportedExpectedTotal(posts);
  return { ...input, posts, expectedTargetsByPost, totalTargets, totalScore: boundedScore(input.totalScore, totalTargets), warnings: [...warnings, ...posts.flatMap((post) => post.warnings)] };
}

export function calculateImportedExpectedTotal(posts: Array<{ expectedTargets: number }>) { return posts.reduce((sum, post) => sum + Math.max(0, Math.trunc(Number(post.expectedTargets) || 0)), 0); }

export function validateImportedScorecardStructure(input: NormalizedImportedScorecard, expectedTotalTargets?: number | null) {
  const warnings = [...input.warnings];
  const detected = calculateImportedExpectedTotal(input.posts);
  const constraint = positiveInt(expectedTotalTargets) || positiveInt((input as any).printedTotalTargets) || null;
  if (constraint && detected !== constraint) warnings.push(`Detected post structure contains ${detected} targets, but the expected total is ${constraint}. Review the post setup before saving.`);
  return { ok: warnings.length === 0, detectedTotalTargets: detected, expectedTotalTargets: constraint, warnings };
}

export function changeImportedPostExpectedTargets(input: NormalizedImportedScorecard, postNumber: number, expectedTargets: number): NormalizedImportedScorecard {
  const count = Math.max(1, Math.trunc(expectedTargets));
  const posts = input.posts.map((post) => post.postNumber !== postNumber ? post : { ...post, expectedTargets: count, targets: post.targets.filter((cell) => cell.targetNumber <= count), warnings: post.targets.some((cell) => cell.targetNumber > count) ? [`Post ${postNumber} target count changed; interpreted cells beyond target ${count} were not saved.`] : post.warnings });
  return { ...input, posts, expectedTargetsByPost: posts.map((post) => post.expectedTargets), totalTargets: calculateImportedExpectedTotal(posts), warnings: posts.flatMap((post) => post.warnings) };
}

export function derivePostScoringModeFromImport(post: NormalizedImportedPost) { return post.scoringMode; }

export function mapReviewedImportToTrainingScoreSheet(input: NormalizedImportedScorecard, shooterLocalId = "imported-shooter") {
  const expectedTargetsByPost = normalizeExpectedTargetsByPost({ postCount: input.posts.length, targetsPerPost: Math.max(...input.expectedTargetsByPost, 1), expectedTargetsByPost: input.expectedTargetsByPost });
  const targetResults: TargetResultMap = {};
  const scores = input.posts.map((post) => {
    if (post.scoringMode === "detailed") {
      post.targets.forEach((cell) => { if (cell.result === "hit" || cell.result === "miss") { targetResults[shooterLocalId] = targetResults[shooterLocalId] || {}; targetResults[shooterLocalId][post.postNumber] = targetResults[shooterLocalId][post.postNumber] || {}; targetResults[shooterLocalId][post.postNumber][cell.targetNumber] = cell.result; } });
      return displayedPostScore({ localId: shooterLocalId, scores: [] }, post.postNumber - 1, targetResults);
    }
    return post.detectedScore || 0;
  });
  return { scoreSheet: { title: input.shootingGround ? `Imported scorecard · ${input.shootingGround}` : "Imported scorecard", session_date: input.date || null, location: input.shootingGround || null, discipline: input.discipline || null, session_type: "training", number_of_posts: input.posts.length, targets_per_post: Math.max(...expectedTargetsByPost, 1), total_targets: calculateImportedExpectedTotal(input.posts), expected_targets_by_post: expectedTargetsByPost }, shooter: { localId: shooterLocalId, name: input.shooterName || "Imported shooter", display_order: 0 }, scores, targetResults };
}
