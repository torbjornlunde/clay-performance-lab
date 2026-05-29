export type MissForAnalysis = {
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_type: string | null;
  target_label?: string | null;
  missed_target: string;
  where_miss: string | null;
  main_reason: string | null;
  target_read: string | null;
  first_where_miss?: string | null;
  first_main_reason?: string | null;
  first_target_read?: string | null;
  first_comment?: string | null;
  second_where_miss?: string | null;
  second_main_reason?: string | null;
  second_target_read?: string | null;
  second_comment?: string | null;
};

type DetailedMiss = {
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_type: string | null;
  target_label: string | null | undefined;
  targetPosition: string;
  where_miss: string | null;
  main_reason: string | null;
};

function countBy(values: (string | number | null | undefined)[]) {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = value === null || value === undefined || value === "" ? "Unknown" : String(value);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function topKey(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function fmt(counts: Record<string, number>) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(", ") : "No data";
}

function hasAny(...values: (string | null | undefined)[]) {
  return values.some((value) => value !== null && value !== undefined && value !== "");
}

function expandMisses(misses: MissForAnalysis[]) {
  const detailed: DetailedMiss[] = [];

  for (const miss of misses) {
    const hasFirst = hasAny(miss.first_where_miss, miss.first_main_reason, miss.first_target_read, miss.first_comment);
    const hasSecond = hasAny(miss.second_where_miss, miss.second_main_reason, miss.second_target_read, miss.second_comment);
    const base = {
      course_number: miss.course_number,
      plate: miss.plate,
      target_number: miss.target_number,
      target_type: miss.target_type,
      target_label: miss.target_label,
    };

    if (miss.missed_target === "Both targets in pair" && hasFirst && hasSecond) {
      detailed.push({
        ...base,
        targetPosition: "First target in pair",
        where_miss: miss.first_where_miss || miss.where_miss,
        main_reason: miss.first_main_reason || miss.main_reason,
      });
      detailed.push({
        ...base,
        targetPosition: "Second target in pair",
        where_miss: miss.second_where_miss || miss.where_miss,
        main_reason: miss.second_main_reason || miss.main_reason,
      });
      continue;
    }

    if (hasFirst) {
      detailed.push({
        ...base,
        targetPosition: "First target in pair",
        where_miss: miss.first_where_miss || miss.where_miss,
        main_reason: miss.first_main_reason || miss.main_reason,
      });
      continue;
    }

    if (hasSecond) {
      detailed.push({
        ...base,
        targetPosition: "Second target in pair",
        where_miss: miss.second_where_miss || miss.where_miss,
        main_reason: miss.second_main_reason || miss.main_reason,
      });
      continue;
    }

    detailed.push({
      ...base,
      targetPosition: miss.missed_target,
      where_miss: miss.where_miss,
      main_reason: miss.main_reason,
    });
  }

  return detailed;
}

export function analyzeMisses(misses: MissForAnalysis[]) {
  const detailedMisses = expandMisses(misses);
  const byCourse = countBy(detailedMisses.map((miss) => miss.course_number));
  const byPlate = countBy(detailedMisses.map((miss) => miss.plate));
  const byTargetType = countBy(detailedMisses.map((miss) => miss.target_type));
  const byTargetLabel = countBy(detailedMisses.map((miss) => miss.target_label));
  const byMissedTarget = countBy(misses.map((miss) => miss.missed_target));
  const byTargetPosition = countBy(detailedMisses.map((miss) => miss.targetPosition));
  const byWhere = countBy(detailedMisses.map((miss) => miss.where_miss));
  const byReason = countBy(detailedMisses.map((miss) => miss.main_reason));
  const total = detailedMisses.length;
  const rowTotal = misses.length;
  const pair = detailedMisses.filter((miss) => `${miss.target_type ?? ""} ${miss.targetPosition ?? ""}`.toLowerCase().match(/double|pair/)).length;
  const first = detailedMisses.filter((miss) => miss.targetPosition === "First target in pair").length;
  const second = detailedMisses.filter((miss) => miss.targetPosition === "Second target in pair").length;
  const interpretation: string[] = [];

  if (!total) {
    interpretation.push("No misses registered yet.");
  } else {
    if (pair >= Math.ceil(total * 0.5)) interpretation.push("Most misses are connected to pairs/doubles. Focus on plan, rhythm and transition.");
    if (second >= Math.ceil(total * 0.35)) {
      interpretation.push("Several misses are on the second target in pairs. This suggests pickup point, transition timing, or late first shot.");
    }
    if (first >= Math.ceil(total * 0.35)) {
      interpretation.push("Several misses are on the first target in pairs. This suggests setup, hold point, visual pickup, or target reading before the first shot.");
    }
    if (topKey(byWhere) === "Behind") {
      interpretation.push("Behind is the dominant miss direction. Check late movement, stopped gun, or shooting after the target has won the line.");
    }
    if (topKey(byReason) === "Tactical") interpretation.push("Tactical misses dominate. Commit to hold point, break point and transition before calling.");
    if (["Mental", "Fatigue"].includes(topKey(byReason))) {
      interpretation.push("Mental/fatigue factors dominate. Use a reset routine and reduce cognitive load between stands.");
    }
  }

  const recommendation: string[] = [];
  if (topKey(byTargetPosition) === "Second target in pair") recommendation.push("Run pair drills with fixed first break point and pre-decided second pickup point.");
  if (topKey(byTargetPosition) === "First target in pair") recommendation.push("Rehearse the setup, hold point, visual pickup and first break point before calling.");
  if (topKey(byReason) === "Technical") recommendation.push("Repeat the most common scenario slowly and confirm sight picture before adding speed.");
  if (topKey(byReason) === "Tactical") recommendation.push("Before calling, state the plan silently: hold point, break point, transition route.");
  if (topKey(byWhere) === "Behind") recommendation.push("Check if you are arriving late, stopping the gun, or trying to shoot after the target has already won the line.");
  if (!recommendation.length) recommendation.push("Register more misses before drawing strong conclusions.");

  return {
    total,
    rowTotal,
    formatted: {
      byCourse: fmt(byCourse),
      byPlate: fmt(byPlate),
      byTargetType: fmt(byTargetType),
      byTargetLabel: fmt(byTargetLabel),
      byMissedTarget: fmt(byMissedTarget),
      byTargetPosition: fmt(byTargetPosition),
      byWhere: fmt(byWhere),
      byReason: fmt(byReason),
    },
    interpretation,
    recommendation,
  };
}
