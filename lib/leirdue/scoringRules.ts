/** Shared parser/import rule for short winner shoot-offs after the base course. */
export function maximumLeirdueWinningScore(totalTargets: number) {
  return Math.ceil(totalTargets * 1.05);
}

export function leirdueWinningScoreWithinShootOffTolerance(winningScore: number, totalTargets: number) {
  return winningScore <= maximumLeirdueWinningScore(totalTargets);
}
