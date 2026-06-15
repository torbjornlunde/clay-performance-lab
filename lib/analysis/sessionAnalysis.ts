import { normalizePresentation } from "@/lib/misses/presentation";

export type MissForAnalysis = {
  course_number: number | null;
  plate: number | null;
  target_number: number | null;
  target_type: string | null;
  target_label?: string | null;
  base_presentation?: string | null;
  actual_presentation?: string | null;
  presented_pair_label?: string | null;
  shooting_order_label?: string | null;
  is_reversed_order?: boolean | null;
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
  target_label?: string | null;
  base_presentation?: string | null;
  actual_presentation?: string | null;
  presented_pair_label?: string | null;
  shooting_order_label?: string | null;
  is_reversed_order?: boolean | null;
  targetPosition: string;
  where_miss: string | null;
  main_reason: string | null;
};

function normalizeLabel(value: string | null | undefined) {
  if (!value) return value;
  return value
    .replace(/equal pair/gi, "Report pair")
    .replace(/repeated pair/gi, "Report pair");
}

function normalizeMissedTarget(value: string | null | undefined) {
  if (value === "First target in pair") return "First";
  if (value === "Second target in pair") return "Second";
  if (value === "Both targets in pair") return "Both";
  if (value === "Single target") return "Single";
  return normalizeLabel(value) || "Unknown";
}

export function analysisPresentation(miss: {
  actual_presentation?: string | null;
  target_type?: string | null;
  base_presentation?: string | null;
}) {
  return normalizePresentation(
    miss.actual_presentation ||
      miss.target_type ||
      miss.base_presentation ||
      "Unknown",
  );
}

function isPresentationOverride(miss: MissForAnalysis) {
  if (!miss.actual_presentation || !miss.base_presentation) return false;
  return (
    normalizePresentation(miss.actual_presentation) !==
    normalizePresentation(miss.base_presentation)
  );
}

function countBy(values: (string | number | null | undefined)[]) {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key =
      value === null || value === undefined || value === ""
        ? "Unknown"
        : String(normalizeLabel(String(value)));
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function topEntry(counts: Record<string, number>) {
  return (
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ??
    (["", 0] as [string, number])
  );
}

function topKey(counts: Record<string, number>) {
  return topEntry(counts)[0];
}

function fmt(counts: Record<string, number>) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(", ")
    : "No data";
}

function hasAny(...values: (string | null | undefined)[]) {
  return values.some(
    (value) => value !== null && value !== undefined && value !== "",
  );
}

function expandMisses(misses: MissForAnalysis[]) {
  const detailed: DetailedMiss[] = [];

  for (const miss of misses) {
    const hasFirst = hasAny(
      miss.first_where_miss,
      miss.first_main_reason,
      miss.first_target_read,
      miss.first_comment,
    );
    const hasSecond = hasAny(
      miss.second_where_miss,
      miss.second_main_reason,
      miss.second_target_read,
      miss.second_comment,
    );
    const base = {
      course_number: miss.course_number,
      plate: miss.plate,
      target_number: miss.target_number,
      target_type: analysisPresentation(miss),
      target_label:
        normalizeLabel(
          miss.shooting_order_label ||
            miss.presented_pair_label ||
            miss.target_label,
        ) || miss.target_label,
    };

    if (miss.missed_target === "Both targets in pair") {
      detailed.push({
        ...base,
        targetPosition: "First",
        where_miss: miss.first_where_miss || miss.where_miss,
        main_reason: miss.first_main_reason || miss.main_reason,
      });
      detailed.push({
        ...base,
        targetPosition: "Second",
        where_miss: miss.second_where_miss || miss.where_miss,
        main_reason: miss.second_main_reason || miss.main_reason,
      });
      continue;
    }

    if (hasFirst) {
      detailed.push({
        ...base,
        targetPosition: "First",
        where_miss: miss.first_where_miss || miss.where_miss,
        main_reason: miss.first_main_reason || miss.main_reason,
      });
      continue;
    }

    if (hasSecond) {
      detailed.push({
        ...base,
        targetPosition: "Second",
        where_miss: miss.second_where_miss || miss.where_miss,
        main_reason: miss.second_main_reason || miss.main_reason,
      });
      continue;
    }

    detailed.push({
      ...base,
      targetPosition: normalizeMissedTarget(miss.missed_target),
      where_miss: miss.where_miss,
      main_reason: miss.main_reason,
    });
  }

  return detailed;
}

function dominantMessage(
  counts: Record<string, number>,
  total: number,
  messageFor: (key: string) => string,
) {
  const [key, count] = topEntry(counts);
  if (!key || !total || count / total < 0.4 || key === "Unknown") return null;
  return messageFor(key);
}

function buildMainPattern(args: {
  total: number;
  reversedCount: number;
  byMissedTarget: Record<string, number>;
  byTargetType: Record<string, number>;
  byTargetLabel: Record<string, number>;
  byReason: Record<string, number>;
  byWhere: Record<string, number>;
  byCourse: Record<string, number>;
  byPlate: Record<string, number>;
}) {
  if (!args.total) return ["No misses registered yet."];

  const messages = [
    args.reversedCount >= 3
      ? "Several misses were logged with reversed shooting order."
      : null,
    dominantMessage(args.byMissedTarget, args.total, (key) => {
      if (key === "Second") return "Most misses are on second target in pairs.";
      if (key === "First") return "Most misses are on first target in pairs.";
      if (key === "Both") return "Most misses are on both targets in pairs.";
      if (key === "Single") return "Most misses are on single targets.";
      return `Most misses are logged as ${key}.`;
    }),
    dominantMessage(
      args.byTargetType,
      args.total,
      (key) => `Most misses are connected to ${key.toLowerCase()}.`,
    ),
    dominantMessage(
      args.byTargetLabel,
      args.total,
      (key) => `Most misses are on machine/target ${key}.`,
    ),
    dominantMessage(
      args.byCourse,
      args.total,
      (key) => `Most misses are on course/post ${key}.`,
    ),
    dominantMessage(
      args.byPlate,
      args.total,
      (key) => `Most misses are on plate/stand ${key}.`,
    ),
    dominantMessage(
      args.byReason,
      args.total,
      (key) => `Most misses are caused by ${key}.`,
    ),
    dominantMessage(
      args.byWhere,
      args.total,
      (key) => `Most misses are ${key.toLowerCase()}.`,
    ),
  ].filter((message): message is string => Boolean(message));

  return messages.length
    ? messages
    : ["Misses are spread across several situations."];
}

function buildRecommendation(
  byTargetPosition: Record<string, number>,
  byTargetType: Record<string, number>,
  byReason: Record<string, number>,
) {
  const position = topKey(byTargetPosition);
  const targetType = topKey(byTargetType);
  const reason = topKey(byReason);

  if (position === "Second")
    return [
      "Train transition and second-target pickup. Commit to the first break point and the second pickup point before calling.",
    ];
  if (position === "First")
    return [
      "Work on setup, hold point and visual pickup before the first shot.",
    ];
  if (targetType === "Single" || position === "Single")
    return ["Review hold point, line and timing on single targets."];
  if (reason === "Technical")
    return ["Focus on movement, line and follow-through."];
  if (reason === "Tactical")
    return ["Plan hold point, break point and transition before calling."];
  if (reason === "Mental")
    return ["Use a reset routine and simplify decisions before calling."];
  if (reason === "Fatigue")
    return ["Watch energy management and concentration late in the session."];
  if (reason === "Wind/weather")
    return ["Note wind direction and adjust hold/break point earlier."];
  return ["Log more misses before drawing strong conclusions."];
}

export function analyzeMisses(misses: MissForAnalysis[]) {
  const normalizedMisses = misses.map((miss) => ({
    ...miss,
    target_type: analysisPresentation(miss),
    target_label:
      normalizeLabel(
        miss.shooting_order_label ||
          miss.presented_pair_label ||
          miss.target_label,
      ) || miss.target_label,
    missed_target: normalizeMissedTarget(miss.missed_target),
  }));
  const detailedMisses = expandMisses(misses);
  const byCourse = countBy(detailedMisses.map((miss) => miss.course_number));
  const byPlate = countBy(detailedMisses.map((miss) => miss.plate));
  const byTargetNumber = countBy(
    detailedMisses.map((miss) => miss.target_number),
  );
  const byTargetLabel = countBy(
    detailedMisses.map((miss) => miss.target_label),
  );
  const byTargetType = countBy(detailedMisses.map((miss) => miss.target_type));
  const byMissedTarget = countBy(
    normalizedMisses.map((miss) => miss.missed_target),
  );
  const byTargetPosition = countBy(
    detailedMisses.map((miss) => miss.targetPosition),
  );
  const byWhere = countBy(detailedMisses.map((miss) => miss.where_miss));
  const byReason = countBy(detailedMisses.map((miss) => miss.main_reason));
  const byReversedOrder = countBy(
    misses.map((miss) =>
      miss.is_reversed_order ? "Reversed order" : "Scheme order",
    ),
  );
  const reversedCount = misses.filter((miss) => miss.is_reversed_order).length;
  const overrideCount = misses.filter(isPresentationOverride).length;
  const total = detailedMisses.length;
  const rowTotal = misses.length;
  const mainPattern = buildMainPattern({
    total,
    reversedCount,
    byMissedTarget,
    byTargetType,
    byTargetLabel,
    byReason,
    byWhere,
    byCourse,
    byPlate,
  });
  const recommendation = buildRecommendation(
    byTargetPosition,
    byTargetType,
    byReason,
  );

  return {
    total,
    rowTotal,
    overrideCount,
    formatted: {
      byCourse: fmt(byCourse),
      byPlate: fmt(byPlate),
      byTargetNumber: fmt(byTargetNumber),
      byTargetLabel: fmt(byTargetLabel),
      byTargetType: fmt(byTargetType),
      byMissedTarget: fmt(byMissedTarget),
      byTargetPosition: fmt(byTargetPosition),
      byWhere: fmt(byWhere),
      byReason: fmt(byReason),
      byReversedOrder: fmt(byReversedOrder),
    },
    mainPattern,
    interpretation: mainPattern,
    recommendation,
  };
}
