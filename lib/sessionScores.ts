export type MissForScore = {
  missed_target?: string | null;
  first_where_miss?: string | null;
  first_main_reason?: string | null;
  first_target_read?: string | null;
  first_comment?: string | null;
  second_where_miss?: string | null;
  second_main_reason?: string | null;
  second_target_read?: string | null;
  second_comment?: string | null;
};

export type ScoreInput = {
  total_targets?: number | null;
  own_score?: number | null;
  misses?: MissForScore[] | null;
};

function hasAny(...values: (string | null | undefined)[]) {
  return values.some((value) => value !== null && value !== undefined && value !== "");
}

export function countRegisteredMisses(misses: MissForScore[] | null | undefined) {
  if (!misses?.length) return 0;

  return misses.reduce((total, miss) => {
    const hasFirst = hasAny(miss.first_where_miss, miss.first_main_reason, miss.first_target_read, miss.first_comment);
    const hasSecond = hasAny(miss.second_where_miss, miss.second_main_reason, miss.second_target_read, miss.second_comment);

    if (miss.missed_target === "Both targets in pair") return total + 2;
    if (hasFirst && hasSecond) return total + 2;
    return total + 1;
  }, 0);
}

export function calculateScore(totalTargets: number | null | undefined, registeredMisses: number) {
  if (typeof totalTargets !== "number") return null;
  return Math.max(totalTargets - registeredMisses, 0);
}

export function getScoreSummary({ total_targets, own_score, misses }: ScoreInput) {
  const registeredMisses = countRegisteredMisses(misses);
  const calculatedScore = calculateScore(total_targets, registeredMisses);
  const scoreUsed = typeof own_score === "number" ? own_score : calculatedScore;

  return {
    totalTargets: typeof total_targets === "number" ? total_targets : null,
    registeredMisses,
    calculatedScore,
    scoreUsed,
    usesManualScore: typeof own_score === "number",
    manualDiffers: typeof own_score === "number" && calculatedScore !== null && registeredMisses > 0 && own_score !== calculatedScore,
  };
}

export function formatScore(score: number | null, totalTargets: number | null) {
  if (score === null) return "Not available";
  return totalTargets === null ? String(score) : `${score} / ${totalTargets}`;
}
