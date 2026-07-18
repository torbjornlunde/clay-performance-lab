export type TargetResultValue = "hit" | "miss";

export type TargetResultMap = Record<
  string,
  Record<number, Record<number, TargetResultValue>>
>;

export type ShooterScores = {
  localId: string;
  scores: number[];
};

export type ExpectedTargetSetup = {
  postCount: number;
  targetsPerPost: number;
  expectedTargetsByPost?: number[] | null;
};

export function normalizeExpectedTargetsByPost(setup: ExpectedTargetSetup) {
  const postCount = Math.max(0, Math.trunc(Number(setup.postCount) || 0));
  const fallback = Math.max(1, Math.trunc(Number(setup.targetsPerPost) || 10));
  const counts = Array.isArray(setup.expectedTargetsByPost) && setup.expectedTargetsByPost.length === postCount
    ? setup.expectedTargetsByPost.map((count) => Math.max(1, Math.trunc(Number(count) || fallback)))
    : Array.from({ length: postCount }, () => fallback);
  return counts;
}

export function getExpectedTargetsForPost(setup: ExpectedTargetSetup, postNumber: number) {
  const counts = normalizeExpectedTargetsByPost(setup);
  return counts[Math.max(1, Math.trunc(postNumber)) - 1] || Math.max(1, Math.trunc(Number(setup.targetsPerPost) || 10));
}

export function getPostScoreDenominator(setup: ExpectedTargetSetup, postNumber: number) {
  return getExpectedTargetsForPost(setup, postNumber);
}

export function getTotalExpectedTargets(setup: ExpectedTargetSetup) {
  return normalizeExpectedTargetsByPost(setup).reduce((sum, count) => sum + count, 0);
}

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

export function nextTargetResultValue(current: TargetResultValue | null | undefined): TargetResultValue | null {
  if (!current) return "hit";
  if (current === "hit") return "miss";
  return null;
}

export function setTargetResult(
  current: TargetResultMap,
  shooterId: string,
  postNumber: number,
  targetNumber: number,
  result: TargetResultValue | null,
) {
  const next: TargetResultMap = {
    ...current,
    [shooterId]: { ...(current[shooterId] || {}) },
  };
  next[shooterId][postNumber] = {
    ...(next[shooterId][postNumber] || {}),
  };
  if (result) next[shooterId][postNumber][targetNumber] = result;
  else delete next[shooterId][postNumber][targetNumber];
  if (Object.keys(next[shooterId][postNumber]).length === 0) delete next[shooterId][postNumber];
  if (Object.keys(next[shooterId]).length === 0) delete next[shooterId];
  return next;
}

export function toggleTargetResult(
  current: TargetResultMap,
  shooterId: string,
  postNumber: number,
  targetNumber: number,
) {
  return setTargetResult(
    current,
    shooterId,
    postNumber,
    targetNumber,
    nextTargetResultValue(current[shooterId]?.[postNumber]?.[targetNumber]),
  );
}

export function targetStatsForPost(
  targetResults: TargetResultMap,
  shooterId: string,
  postNumber: number,
) {
  const results = Object.values(targetResults[shooterId]?.[postNumber] || {});
  const hits = results.filter((result) => result === "hit").length;
  const misses = results.filter((result) => result === "miss").length;
  return { scored: results.length, hits, misses };
}

export function postCompletionStatus(
  targetResults: TargetResultMap,
  shooterIds: string[],
  postNumber: number,
  expectedTargets: number,
) {
  const expectedEntries = Math.max(0, shooterIds.length * expectedTargets);
  const scoredEntries = shooterIds.reduce(
    (sum, shooterId) => sum + targetStatsForPost(targetResults, shooterId, postNumber).scored,
    0,
  );
  return { expectedEntries, scoredEntries, remainingEntries: Math.max(expectedEntries - scoredEntries, 0), complete: expectedEntries > 0 && scoredEntries >= expectedEntries };
}

export function targetResultUpsertKey(
  scoreSheetId: string,
  shooterId: string,
  postNumber: number,
  targetNumber: number,
) {
  return `${scoreSheetId}:${shooterId}:${postNumber}:${targetNumber}`;
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
  maxTargets: number | number[],
) {
  const next: TargetResultMap = {};
  Object.entries(current).forEach(([shooterId, posts]) => {
    Object.entries(posts).forEach(([postKey, targets]) => {
      const postNumber = Number(postKey);
      if (postNumber < 1 || postNumber > maxPosts) return;
      Object.entries(targets).forEach(([targetKey, result]) => {
        const targetNumber = Number(targetKey);
        const postMaxTargets = Array.isArray(maxTargets) ? maxTargets[postNumber - 1] : maxTargets;
        if (targetNumber < 1 || targetNumber > postMaxTargets) return;
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
  maxTargets: number | number[],
) {
  return Object.values(current).some((posts) =>
    Object.entries(posts).some(([postKey, targets]) => {
      const postNumber = Number(postKey);
      if (postNumber < 1 || postNumber > maxPosts) return true;
      return Object.keys(targets).some((targetKey) => {
        const targetNumber = Number(targetKey);
        const postMaxTargets = Array.isArray(maxTargets) ? maxTargets[postNumber - 1] : maxTargets;
        return targetNumber < 1 || targetNumber > postMaxTargets;
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
  targetMax: number | number[],
) {
  return shooters.some((shooter) =>
    shooter.scores.some((score, index) =>
      score > (Array.isArray(targetMax) ? targetMax[index] : targetMax),
    ),
  );
}

export function setupReductionWouldTrimData(options: {
  shooters: ShooterScores[];
  targetResults: TargetResultMap;
  nextPostCount: number;
  nextTargetsPerPost: number | number[];
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
  targetsPerPost: number | number[],
): T[] {
  return shooters.map((shooter) => ({
    ...shooter,
    scores: makeScores(postCount, shooter.scores).map((score, index) =>
      clampScore(score, Array.isArray(targetsPerPost) ? targetsPerPost[index] : targetsPerPost),
    ),
  }));
}
