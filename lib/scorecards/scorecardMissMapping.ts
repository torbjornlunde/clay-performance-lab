import type { ScorecardCell } from "./scorecardAnalysis";
export type PostTargetRow = {
  post_number: number;
  target_position: number;
  presentation_number: number | null;
  presentation_type: string | null;
  position_in_presentation: number | null;
  target_label: string | null;
  target_type: string | null;
};
export type ExistingMiss = {
  course_number: number | null;
  target_position?: number | null;
  target_number: number | null;
  missed_target: string | null;
  source_type?: string | null;
};
export type ImportMissRow = {
  course_number: number;
  target_position: number;
  target_number: number;
  target_label: string;
  target_type: string;
  base_presentation: string;
  actual_presentation: string;
  missed_target: string;
  where_miss: string;
  main_reason: string;
  target_read: string;
  comment: null;
};
function atom(post: number, pos: number) {
  return `${post}:${pos}`;
}
function targetRowsForPresentation(
  targets: PostTargetRow[],
  post: number,
  presentation: number | null | undefined,
) {
  return targets
    .filter(
      (t) => t.post_number === post && t.presentation_number === presentation,
    )
    .sort((a, b) => a.target_position - b.target_position);
}
export function existingMissAtoms(
  misses: ExistingMiss[],
  targets: PostTargetRow[] = [],
) {
  const atoms = new Set<string>();
  let ambiguous = false;
  for (const m of misses) {
    const post = m.course_number;
    if (!post) {
      ambiguous = true;
      continue;
    }
    if (m.source_type === "scorecard_import" && m.target_position) {
      atoms.add(atom(post, m.target_position));
      continue;
    }
    if (m.target_position) {
      atoms.add(atom(post, m.target_position));
      continue;
    }
    const presentation = m.target_number;
    if (!presentation) {
      ambiguous = true;
      continue;
    }
    const rows = targetRowsForPresentation(targets, post, presentation);
    const missed = (m.missed_target || "").toLowerCase();
    if (missed.includes("both")) {
      const first = rows.find((r) => r.position_in_presentation === 1);
      const second = rows.find((r) => r.position_in_presentation === 2);
      if (first && second) {
        atoms.add(atom(post, first.target_position));
        atoms.add(atom(post, second.target_position));
      } else ambiguous = true;
    } else if (missed.includes("first")) {
      const row = rows.find((r) => r.position_in_presentation === 1);
      if (row) atoms.add(atom(post, row.target_position));
      else ambiguous = true;
    } else if (missed.includes("second")) {
      const row = rows.find((r) => r.position_in_presentation === 2);
      if (row) atoms.add(atom(post, row.target_position));
      else ambiguous = true;
    } else if (missed.includes("single")) {
      const row =
        rows.length === 1
          ? rows[0]
          : rows.find((r) => r.presentation_type === "single");
      if (row) atoms.add(atom(post, row.target_position));
      else ambiguous = true;
    } else ambiguous = true;
  }
  return { atoms, ambiguous };
}
export function mapReviewedMisses(
  grid: ScorecardCell[],
  targets: PostTargetRow[],
  existing: ExistingMiss[],
) {
  const targetMap = new Map(
    targets.map((t) => [atom(t.post_number, t.target_position), t]),
  );
  const existingAtoms = existingMissAtoms(existing, targets);
  const rows: ImportMissRow[] = [];
  let skippedDuplicates = 0;
  for (const cell of grid.filter((c) => c.result === "miss")) {
    const key = atom(cell.postNumber, cell.targetNumber);
    if (existingAtoms.atoms.has(key)) {
      skippedDuplicates++;
      continue;
    }
    const def = targetMap.get(key);
    const pairPos = def?.position_in_presentation || null;
    const presentation = def?.presentation_type || "Unknown";
    rows.push({
      course_number: cell.postNumber,
      target_position: cell.targetNumber,
      target_number: def?.presentation_number || cell.targetNumber,
      target_label:
        def?.target_label ||
        `Post ${cell.postNumber} · Target ${cell.targetNumber}`,
      target_type: def?.target_type || "Unknown",
      base_presentation: presentation,
      actual_presentation: presentation,
      missed_target: !def
        ? "Unknown"
        : presentation === "single"
          ? "Single target"
          : pairPos === 1
            ? "First target in pair"
            : pairPos === 2
              ? "Second target in pair"
              : "Unknown",
      where_miss: "Not sure",
      main_reason: "Unknown",
      target_read: "Unknown",
      comment: null,
    });
  }
  return {
    rows,
    skippedDuplicates,
    ambiguousExisting: existingAtoms.ambiguous,
    score: grid.filter((c) => c.result === "hit").length,
    totalTargets: grid.length,
    misses: grid.filter((c) => c.result === "miss").length,
  };
}
