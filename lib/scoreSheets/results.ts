import {
  clampScore,
  displayedPostScore,
  getExpectedTargetsForPost,
  getTotalExpectedTargets,
  makeScores,
  targetStatsForPost,
  totalFor,
  type TargetResultMap,
  type TargetResultValue,
} from "./core";

export type ResultShooterRow = { id: string; shooter_name: string; display_order: number | null };
export type ResultScoreRow = { shooter_id: string; post_number: number; score: number };
export type ResultTargetRow = { shooter_id: string; post_number: number; target_number: number; result: TargetResultValue };
export type ResultSetup = { postCount: number; targetsPerPost: number; expectedTargetsByPost?: number[] | null };

export type ProjectedShooterResult = {
  shooterId: string;
  displayName: string;
  displayOrder: number;
  postScores: number[];
  totalScore: number;
  expectedTargets: number;
  scoredTargets: number;
  unscoredTargets: number;
  tiedOnTotal: boolean;
};

export function projectScoreSheetResults(input: {
  setup: ResultSetup;
  shooters: ResultShooterRow[];
  scores: ResultScoreRow[];
  targetResults: ResultTargetRow[];
}): ProjectedShooterResult[] {
  const targetMap: TargetResultMap = {};
  for (const row of input.targetResults) {
    const expected = getExpectedTargetsForPost(input.setup, row.post_number);
    if (row.post_number < 1 || row.post_number > input.setup.postCount || row.target_number < 1 || row.target_number > expected) continue;
    targetMap[row.shooter_id] ||= {};
    targetMap[row.shooter_id][row.post_number] ||= {};
    targetMap[row.shooter_id][row.post_number][row.target_number] = row.result;
  }
  const expectedTargets = getTotalExpectedTargets(input.setup);
  const projected = input.shooters.map((row, index) => {
    const shooter = { localId: row.id, scores: makeScores(input.setup.postCount) };
    for (const score of input.scores) {
      if (score.shooter_id === row.id && score.post_number >= 1 && score.post_number <= input.setup.postCount) {
        shooter.scores[score.post_number - 1] = clampScore(score.score, getExpectedTargetsForPost(input.setup, score.post_number));
      }
    }
    const postScores = shooter.scores.map((_score, postIndex) => displayedPostScore(shooter, postIndex, targetMap));
    const scoredTargets = shooter.scores.reduce((sum, _score, postIndex) => sum + targetStatsForPost(targetMap, row.id, postIndex + 1).scored, 0);
    return { shooterId: row.id, displayName: row.shooter_name.trim(), displayOrder: row.display_order ?? index + 1, postScores, totalScore: totalFor(shooter, targetMap), expectedTargets, scoredTargets, unscoredTargets: Math.max(expectedTargets - scoredTargets, 0), tiedOnTotal: false };
  });
  const totals = new Map<number, number>();
  projected.forEach((row) => totals.set(row.totalScore, (totals.get(row.totalScore) || 0) + 1));
  return projected
    .map((row) => ({ ...row, tiedOnTotal: (totals.get(row.totalScore) || 0) > 1 }))
    .sort((a, b) => b.totalScore - a.totalScore || a.displayOrder - b.displayOrder);
}

export function isAuthoritativeCompetitionResult(kind: unknown, status: unknown) {
  return kind === "competition" && status === "finalized";
}

export function isCurrentAuthoritativeResultRevision(
  loadedRevision: string | null,
  current: { session_type: unknown; competition_status: unknown; updated_at: string | null } | null,
) {
  return Boolean(
    loadedRevision &&
    current &&
    isAuthoritativeCompetitionResult(current.session_type, current.competition_status) &&
    current.updated_at === loadedRevision,
  );
}
