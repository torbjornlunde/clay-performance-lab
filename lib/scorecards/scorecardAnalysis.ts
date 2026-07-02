export type ScorecardOutcome = "hit" | "miss" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type ScorecardCell = {
  postNumber: number;
  targetNumber: number;
  result: ScorecardOutcome;
  rawMark: string | null;
  confidence: Confidence;
  warning: string | null;
  reviewed?: boolean;
};
export type ScorecardShooter = {
  candidateId: string;
  displayName: string | null;
  rowLabel: string | null;
  confidence: Confidence;
  detectedScore: number | null;
  posts: Array<{
    postNumber: number;
    detectedPostScore: number | null;
    targets: ScorecardCell[];
  }>;
  grid: ScorecardCell[];
  hits: number;
  misses: number;
  unknowns: number;
  score: number;
  warnings: string[];
};
export type NormalizedScorecardAnalysis = {
  detectedTitle: string | null;
  detectedDate: string | null;
  scorecardConfidence: Confidence;
  shooterRows: ScorecardShooter[];
  rawText: string;
  warnings: string[];
  postCount: number;
  targetsPerPost: number;
  targetsPerPostByPost: number[];
  totalTargets: number;
};
export const SCORECARD_MAX_TOTAL_TARGETS = 500;
export const scorecardAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detectedTitle",
    "detectedDate",
    "scorecardConfidence",
    "shooterRows",
    "rawText",
    "warnings",
  ],
  properties: {
    detectedTitle: { type: ["string", "null"] },
    detectedDate: { type: ["string", "null"] },
    scorecardConfidence: { enum: ["high", "medium", "low"] },
    rawText: { type: "string" },
    warnings: { type: "array", maxItems: 20, items: { type: "string" } },
    shooterRows: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId",
          "displayName",
          "rowLabel",
          "confidence",
          "detectedScore",
          "posts",
        ],
        properties: {
          candidateId: { type: "string" },
          displayName: { type: ["string", "null"] },
          rowLabel: { type: ["string", "null"] },
          confidence: { enum: ["high", "medium", "low"] },
          detectedScore: { type: ["integer", "null"] },
          posts: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["postNumber", "detectedPostScore", "targets"],
              properties: {
                postNumber: { type: "integer" },
                detectedPostScore: { type: ["integer", "null"] },
                targets: {
                  type: "array",
                  maxItems: 100,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "targetNumber",
                      "result",
                      "rawMark",
                      "confidence",
                      "warning",
                    ],
                    properties: {
                      targetNumber: { type: "integer" },
                      result: { enum: ["hit", "miss", "unknown"] },
                      rawMark: { type: ["string", "null"] },
                      confidence: { enum: ["high", "medium", "low"] },
                      warning: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
const rank = { low: 1, medium: 2, high: 3 } as const;
function cleanString(v: any, max = 160) {
  return typeof v === "string" ? v.trim().slice(0, max) : null;
}
function cleanConfidence(v: any): Confidence {
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}
function cellKey(p: number, t: number) {
  return `${p}:${t}`;
}
export function summarizeGrid(grid: ScorecardCell[]) {
  const hits = grid.filter((c) => c.result === "hit").length;
  const misses = grid.filter((c) => c.result === "miss").length;
  const unknowns = grid.filter((c) => c.result === "unknown").length;
  return {
    hits,
    misses,
    unknowns,
    score: hits,
    totalTargets: grid.length,
    canApply: unknowns === 0,
  };
}
export function normalizeScorecardAnalysis(
  input: any,
  setup: { postCount: number; targetsPerPost: number; targetsPerPostByPost?: number[] },
): NormalizedScorecardAnalysis {
  if (!input || typeof input !== "object")
    throw new Error("Malformed scorecard analysis.");
  const postCount = setup.postCount,
    targetsPerPost = setup.targetsPerPost;
  const targetsPerPostByPost = Array.isArray(setup.targetsPerPostByPost) && setup.targetsPerPostByPost.length === postCount
    ? setup.targetsPerPostByPost.map(Number)
    : Array.from({ length: postCount }, () => targetsPerPost);
  const totalTargets = targetsPerPostByPost.reduce((sum, count) => sum + count, 0);
  if (
    !Number.isInteger(postCount) ||
    !Number.isInteger(targetsPerPost) ||
    postCount < 1 ||
    targetsPerPost < 1 ||
    targetsPerPostByPost.some((count) => !Number.isInteger(count) || count < 1) ||
    totalTargets > SCORECARD_MAX_TOTAL_TARGETS
  )
    throw new Error("Invalid scorecard setup.");
  const globalWarnings = (Array.isArray(input.warnings) ? input.warnings : [])
    .slice(0, 20)
    .map((w: any) => cleanString(w, 180))
    .filter(Boolean) as string[];
  const rows = (Array.isArray(input.shooterRows) ? input.shooterRows : [])
    .slice(0, 12)
    .map((row: any, idx: number) => {
      const warnings: string[] = [];
      const by = new Map<string, ScorecardCell>();
      for (const post of (Array.isArray(row.posts) ? row.posts : []).slice(
        0,
        postCount + 20,
      )) {
        const p = Number(post.postNumber);
        if (!Number.isInteger(p) || p < 1 || p > postCount) {
          warnings.push(`Ignored out-of-range post ${post.postNumber}.`);
          continue;
        }
        for (const target of (Array.isArray(post.targets)
          ? post.targets
          : []
        ).slice(0, (targetsPerPostByPost[p - 1] || targetsPerPost) + 20)) {
          const t = Number(target.targetNumber);
          if (!Number.isInteger(t) || t < 1 || t > targetsPerPostByPost[p - 1]) {
            warnings.push(
              `Ignored out-of-range target ${target.targetNumber} on post ${p}.`,
            );
            continue;
          }
          const next: ScorecardCell = {
            postNumber: p,
            targetNumber: t,
            result:
              target.result === "hit" || target.result === "miss"
                ? target.result
                : "unknown",
            rawMark: cleanString(target.rawMark, 24),
            confidence: cleanConfidence(target.confidence),
            warning: cleanString(target.warning, 120),
          };
          const key = cellKey(p, t);
          const prev = by.get(key);
          if (!prev || rank[next.confidence] > rank[prev.confidence])
            by.set(key, next);
          else if (
            rank[next.confidence] === rank[prev.confidence] &&
            next.result !== prev.result
          )
            by.set(key, {
              ...next,
              result: "unknown",
              warning: "Conflicting equal-confidence marks.",
            });
        }
      }
      const grid: ScorecardCell[] = [];
      for (let p = 1; p <= postCount; p++)
        for (let t = 1; t <= targetsPerPostByPost[p - 1]; t++)
          grid.push(
            by.get(cellKey(p, t)) || {
              postNumber: p,
              targetNumber: t,
              result: "unknown",
              rawMark: null,
              confidence: "low",
              warning: "No mark detected.",
            },
          );
      const s = summarizeGrid(grid);
      const detectedScore = Number.isInteger(row.detectedScore)
        ? Number(row.detectedScore)
        : null;
      if (detectedScore !== null && detectedScore !== s.score)
        warnings.push(
          `Printed score ${detectedScore} differs from cell-derived score ${s.score}. Review every target.`,
        );
      return {
        candidateId: `shooter-${idx + 1}`,
        displayName: cleanString(row.displayName, 80),
        rowLabel: cleanString(row.rowLabel, 80),
        confidence: cleanConfidence(row.confidence),
        detectedScore,
        posts: [],
        grid,
        ...s,
        warnings,
      };
    });
  if (rows.length === 0) throw new Error("No shooter rows detected.");
  return {
    detectedTitle: cleanString(input.detectedTitle, 120),
    detectedDate: cleanString(input.detectedDate, 40),
    scorecardConfidence: cleanConfidence(input.scorecardConfidence),
    shooterRows: rows,
    rawText: cleanString(input.rawText, 1200) || "",
    warnings: globalWarnings,
    postCount,
    targetsPerPost,
    targetsPerPostByPost,
    totalTargets,
  };
}
export function applyUserCorrection(
  grid: ScorecardCell[],
  postNumber: number,
  targetNumber: number,
  result: ScorecardOutcome,
) {
  return grid.map((c) =>
    c.postNumber === postNumber && c.targetNumber === targetNumber
      ? { ...c, result, reviewed: true }
      : c,
  );
}
export function bulkResolveUnknowns(
  grid: ScorecardCell[],
  result: Exclude<ScorecardOutcome, "unknown">,
  confirmed: boolean,
) {
  if (!confirmed) return { grid, changed: 0 };
  let changed = 0;
  return {
    grid: grid.map((c) =>
      c.result === "unknown"
        ? (changed++, { ...c, result, reviewed: true })
        : c,
    ),
    changed,
  };
}
export function canonicalizeReviewedGrid(
  grid: ScorecardCell[],
  setup: { postCount: number; targetsPerPost: number; targetsPerPostByPost?: number[] },
) {
  const expected = new Set<string>();
  const counts = Array.isArray(setup.targetsPerPostByPost) && setup.targetsPerPostByPost.length === setup.postCount
    ? setup.targetsPerPostByPost
    : Array.from({ length: setup.postCount }, () => setup.targetsPerPost);
  for (let p = 1; p <= setup.postCount; p++)
    for (let t = 1; t <= counts[p - 1]; t++) expected.add(cellKey(p, t));
  const seen = new Set<string>();
  const by = new Map<string, ScorecardCell>();
  const errors: string[] = [];
  if (!Array.isArray(grid))
    return {
      ok: false as const,
      errors: ["Review grid is missing."],
      grid: [] as ScorecardCell[],
    };
  for (const cell of grid) {
    const p = Number(cell?.postNumber),
      t = Number(cell?.targetNumber);
    if (
      !Number.isInteger(p) ||
      !Number.isInteger(t) ||
      !expected.has(cellKey(p, t))
    ) {
      errors.push(
        `Unexpected target coordinate ${cell?.postNumber}:${cell?.targetNumber}.`,
      );
      continue;
    }
    const key = cellKey(p, t);
    if (seen.has(key)) {
      errors.push(`Duplicate target coordinate ${key}.`);
      continue;
    }
    seen.add(key);
    if (cell.result !== "hit" && cell.result !== "miss")
      errors.push(`Target ${key} must be reviewed as hit or miss.`);
    by.set(key, {
      postNumber: p,
      targetNumber: t,
      result: cell.result,
      rawMark: null,
      confidence: "high",
      warning: null,
      reviewed: true,
    });
  }
  for (const key of expected)
    if (!seen.has(key)) errors.push(`Missing target coordinate ${key}.`);
  const canonical: ScorecardCell[] = [];
  for (let p = 1; p <= setup.postCount; p++)
    for (let t = 1; t <= counts[p - 1]; t++) {
      const c = by.get(cellKey(p, t));
      if (c) canonical.push(c);
    }
  return errors.length
    ? { ok: false as const, errors, grid: canonical }
    : { ok: true as const, errors: [], grid: canonical };
}
