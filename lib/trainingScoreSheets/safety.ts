export type TargetResultValue = "hit" | "miss";

export type TargetResultMap = Record<
  string,
  Record<number, Record<number, TargetResultValue>>
>;

export type ShooterScores = {
  localId: string;
  scores: number[];
};

export function clampScore(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}

export function makeScores(postCount: number, existing: number[] = []) {
  return Array.from({ length: postCount }, (_, index) => existing[index] ?? 0);
}

export function hasTargetResults(
  targetResults: TargetResultMap,
  shooterId: string,
  postNumber: number,
) {
  return Object.keys(targetResults[shooterId]?.[postNumber] || {}).length > 0;
}

export function scoreFromTargetResults(
  targetResults: TargetResultMap,
  shooterId: string,
  postNumber: number,
) {
  return Object.values(targetResults[shooterId]?.[postNumber] || {}).filter(
    (result) => result === "hit",
  ).length;
}

export function displayedPostScore(
  shooter: ShooterScores,
  postIndex: number,
  targetResults: TargetResultMap,
) {
  const postNumber = postIndex + 1;
  return hasTargetResults(targetResults, shooter.localId, postNumber)
    ? scoreFromTargetResults(targetResults, shooter.localId, postNumber)
    : shooter.scores[postIndex] || 0;
}

export function totalFor(shooter: ShooterScores, targetResults: TargetResultMap) {
  return shooter.scores.reduce(
    (sum, _score, postIndex) =>
      sum + displayedPostScore(shooter, postIndex, targetResults),
    0,
  );
}

export function trimTargetResults(
  current: TargetResultMap,
  maxPosts: number,
  maxTargets: number,
) {
  const next: TargetResultMap = {};
  Object.entries(current).forEach(([shooterId, posts]) => {
    Object.entries(posts).forEach(([postKey, targets]) => {
      const postNumber = Number(postKey);
      if (postNumber < 1 || postNumber > maxPosts) return;
      Object.entries(targets).forEach(([targetKey, result]) => {
        const targetNumber = Number(targetKey);
        if (targetNumber < 1 || targetNumber > maxTargets) return;
        next[shooterId] = next[shooterId] || {};
        next[shooterId][postNumber] = next[shooterId][postNumber] || {};
        next[shooterId][postNumber][targetNumber] = result;
      });
    });
  });
  return next;
}

export function targetResultsOutsideSetup(
  current: TargetResultMap,
  maxPosts: number,
  maxTargets: number,
) {
  return Object.values(current).some((posts) =>
    Object.entries(posts).some(([postKey, targets]) => {
      const postNumber = Number(postKey);
      if (postNumber < 1 || postNumber > maxPosts) return true;
      return Object.keys(targets).some((targetKey) => {
        const targetNumber = Number(targetKey);
        return targetNumber < 1 || targetNumber > maxTargets;
      });
    }),
  );
}

export function manualScoresOutsidePostCount(
  shooters: ShooterScores[],
  postCount: number,
) {
  return shooters.some((shooter) =>
    shooter.scores.slice(postCount).some((score) => score > 0),
  );
}

export function manualScoresAboveTargetMax(
  shooters: ShooterScores[],
  targetMax: number,
) {
  return shooters.some((shooter) => shooter.scores.some((score) => score > targetMax));
}

export function setupReductionWouldTrimData(options: {
  shooters: ShooterScores[];
  targetResults: TargetResultMap;
  nextPostCount: number;
  nextTargetsPerPost: number;
}) {
  return (
    manualScoresOutsidePostCount(options.shooters, options.nextPostCount) ||
    manualScoresAboveTargetMax(options.shooters, options.nextTargetsPerPost) ||
    targetResultsOutsideSetup(
      options.targetResults,
      options.nextPostCount,
      options.nextTargetsPerPost,
    )
  );
}

export function resizeShootersForSetup<T extends ShooterScores>(
  shooters: T[],
  postCount: number,
  targetsPerPost: number,
): T[] {
  return shooters.map((shooter) => ({
    ...shooter,
    scores: makeScores(postCount, shooter.scores).map((score) =>
      clampScore(score, targetsPerPost),
    ),
  }));
}
