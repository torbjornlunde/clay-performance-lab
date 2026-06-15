export type MissScoringRow = {
  missed_target?: string | null;
};

export function missValue(miss: MissScoringRow | null | undefined) {
  return miss?.missed_target === "Both targets in pair" ? 2 : 1;
}

export function totalMisses(misses: Array<MissScoringRow | null | undefined>) {
  return misses.reduce((count, miss) => count + missValue(miss), 0);
}

export function countMissesBySession<T extends MissScoringRow & { session_id: string }>(misses: T[]) {
  return misses.reduce<Record<string, number>>((acc, miss) => {
    acc[miss.session_id] = (acc[miss.session_id] || 0) + missValue(miss);
    return acc;
  }, {});
}

export function scoreFromMisses(totalTargets: number, misses: number) {
  return Math.max(totalTargets - misses, 0);
}
