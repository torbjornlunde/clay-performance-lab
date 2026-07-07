export type ScorecardOutcome = "hit" | "miss" | "unknown";
export type ObservedMarkCategory = "diagonal_stroke" | "vertical_stroke" | "check_mark" | "circle" | "zero" | "horizontal_dash" | "cross" | "blank" | "other" | "unreadable";
export type ReconciliationStatus = "matched" | "safely_resolved" | "needs_review" | "conflict";
export type Confidence = "high" | "medium" | "low";
export type ScorecardCell = {
  postNumber: number;
  targetNumber: number;
  result: ScorecardOutcome;
  rawMark: string | null;
  observedMarkCategory?: ObservedMarkCategory | null;
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
    reconciledPostScore?: number | null;
    reconciliationStatus?: ReconciliationStatus;
    reconciliationWarning?: string | null;
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
                      "observedMarkCategory",
                      "confidence",
                      "warning",
                    ],
                    properties: {
                      targetNumber: { type: "integer" },
                      result: { enum: ["hit", "miss", "unknown"] },
                      rawMark: { type: ["string", "null"] },
                      observedMarkCategory: { enum: ["diagonal_stroke", "vertical_stroke", "check_mark", "circle", "zero", "horizontal_dash", "cross", "blank", "other", "unreadable", null] },
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
function cleanObservedMarkCategory(v: any): ObservedMarkCategory | null {
  return ["diagonal_stroke", "vertical_stroke", "check_mark", "circle", "zero", "horizontal_dash", "cross", "blank", "other", "unreadable"].includes(v) ? v : null;
}
export function classifyObservedMark(rawMark: string | null | undefined, category?: ObservedMarkCategory | null): { result: ScorecardOutcome; confidence: Confidence; observedMarkCategory: ObservedMarkCategory | null } {
  const cat = cleanObservedMarkCategory(category);
  const raw = String(rawMark || "").trim().toLowerCase();
  const mark = cat || (/^[\/⧸╱]+$|diagonal|slash|stroke/.test(raw) ? "diagonal_stroke" : /^\|+$|vertical/.test(raw) ? "vertical_stroke" : /✓|check/.test(raw) ? "check_mark" : /^(o|○|◯|oval|circle)$/.test(raw) ? "circle" : /^(0|zero)$/.test(raw) ? "zero" : /^[-–—−]+$|dash|minus/.test(raw) ? "horizontal_dash" : /^(x|×|cross)$/.test(raw) ? "cross" : raw === "" || raw === "blank" ? "blank" : /unread|overwrite|ambiguous|unclear/.test(raw) ? "unreadable" : "other");
  if (["diagonal_stroke", "vertical_stroke", "check_mark"].includes(mark)) return { result: "hit", confidence: cat ? "high" : "medium", observedMarkCategory: mark as ObservedMarkCategory };
  if (["circle", "zero", "horizontal_dash", "cross"].includes(mark)) return { result: "miss", confidence: cat ? "high" : "medium", observedMarkCategory: mark as ObservedMarkCategory };
  return { result: "unknown", confidence: mark === "blank" ? "low" : "low", observedMarkCategory: mark as ObservedMarkCategory };
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
            observedMarkCategory: cleanObservedMarkCategory(target.observedMarkCategory),
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
      const reconciledPosts = [] as ScorecardShooter["posts"];
      let reconciledGrid = grid;
      for (let p = 1; p <= postCount; p++) {
        const postInput = (Array.isArray(row.posts) ? row.posts : []).find((x: any) => Number(x.postNumber) === p);
        const detectedPostScore = Number.isInteger(postInput?.detectedPostScore) ? Number(postInput.detectedPostScore) : null;
        const rec = reconcileScorecardPost({ cells: reconciledGrid.filter((c) => c.postNumber === p), detectedPostScore, expectedTargetCount: targetsPerPostByPost[p - 1] });
        reconciledGrid = reconciledGrid.map((c) => c.postNumber === p ? rec.cells.find((x) => x.targetNumber === c.targetNumber) || c : c);
        if (rec.reconciliationWarning) warnings.push(`Post ${p}: ${rec.reconciliationWarning}`);
        reconciledPosts.push({ postNumber: p, detectedPostScore, reconciledPostScore: rec.reconciledPostScore, reconciliationStatus: rec.reconciliationStatus, reconciliationWarning: rec.reconciliationWarning, targets: rec.cells });
      }
      grid.splice(0, grid.length, ...reconciledGrid);
      const s = summarizeGrid(grid);
      const detectedScore = Number.isInteger(row.detectedScore)
        ? Number(row.detectedScore)
        : null;
      if (detectedScore !== null && detectedScore !== s.score)
        warnings.push(
          `Detected total ${detectedScore} differs from reconciled target score ${s.score}. Review unresolved targets.`,
        );
      return {
        candidateId: `shooter-${idx + 1}`,
        displayName: cleanString(row.displayName, 80),
        rowLabel: cleanString(row.rowLabel, 80),
        confidence: cleanConfidence(row.confidence),
        detectedScore,
        posts: reconciledPosts,
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

export function reconcileScorecardPost({ cells, detectedPostScore, expectedTargetCount }: { cells: ScorecardCell[]; detectedPostScore: number | null; expectedTargetCount: number }) {
  const normalized = cells.slice(0, expectedTargetCount).map((cell) => ({ ...cell }));
  const detected = Number.isInteger(detectedPostScore) ? Number(detectedPostScore) : null;
  if (detected === null || detected < 0 || detected > expectedTargetCount) return { cells: normalized, detectedPostScore: detected, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: detected === null ? null : "Detected post total is outside the expected target count." };
  const highHits = normalized.filter((c) => c.result === "hit" && c.confidence === "high").length;
  const highMisses = normalized.filter((c) => c.result === "miss" && c.confidence === "high").length;
  const requiredMisses = expectedTargetCount - detected;
  if (highHits > detected || highMisses > requiredMisses) return { cells: normalized, detectedPostScore: detected, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "conflict" as ReconciliationStatus, reconciliationWarning: `High-confidence marks conflict with detected post total ${detected}/${expectedTargetCount}.` };
  const current = summarizeGrid(normalized);
  if (current.unknowns === 0 && current.score === detected) return { cells: normalized, detectedPostScore: detected, reconciledPostScore: detected, reconciliationStatus: "matched" as ReconciliationStatus, reconciliationWarning: null };
  const missEvidence = (c: ScorecardCell) => ["circle", "zero", "horizontal_dash", "cross"].includes(String(c.observedMarkCategory)) || /^(0|o|x|[-–—−])$/i.test(String(c.rawMark || "").trim());
  const hitEvidence = (c: ScorecardCell) => ["diagonal_stroke", "vertical_stroke", "check_mark"].includes(String(c.observedMarkCategory)) || /^[\/|✓]$/.test(String(c.rawMark || "").trim());
  const resolved = normalized.map((c) => ({ ...c }));
  let hits = resolved.filter((c) => c.result === "hit").length;
  let misses = resolved.filter((c) => c.result === "miss").length;
  let unknown = resolved.filter((c) => c.result === "unknown");
  if (detected === expectedTargetCount && !resolved.some(missEvidence)) { unknown.forEach((c) => { c.result = "hit"; c.reviewed = false; c.warning = c.warning || "Resolved from high-confidence post total."; }); return { cells: resolved, detectedPostScore: detected, reconciledPostScore: detected, reconciliationStatus: "safely_resolved" as ReconciliationStatus, reconciliationWarning: null }; }
  if (detected === 0 && !resolved.some(hitEvidence)) { unknown.forEach((c) => { c.result = "miss"; c.reviewed = false; c.warning = c.warning || "Resolved from high-confidence post total."; }); return { cells: resolved, detectedPostScore: detected, reconciledPostScore: detected, reconciliationStatus: "safely_resolved" as ReconciliationStatus, reconciliationWarning: null }; }
  const needHits = detected - hits, needMisses = requiredMisses - misses;
  if (needHits < 0 || needMisses < 0) return { cells: resolved, detectedPostScore: detected, reconciledPostScore: summarizeGrid(resolved).score, reconciliationStatus: "conflict" as ReconciliationStatus, reconciliationWarning: `Detected post total ${detected}/${expectedTargetCount} conflicts with detected cells.` };
  const unknownMissEvidence = unknown.filter(missEvidence), unknownHitEvidence = unknown.filter(hitEvidence);
  if (unknown.length && (unknownMissEvidence.length === needMisses || unknownHitEvidence.length === needHits)) {
    unknown.forEach((c) => { if (unknownMissEvidence.includes(c)) c.result = "miss"; else if (unknownHitEvidence.includes(c)) c.result = "hit"; else if (unknownMissEvidence.length === needMisses) c.result = "hit"; else if (unknownHitEvidence.length === needHits) c.result = "miss"; c.warning = c.warning || "Resolved from post total and mark evidence."; });
    return { cells: resolved, detectedPostScore: detected, reconciledPostScore: detected, reconciliationStatus: "safely_resolved" as ReconciliationStatus, reconciliationWarning: null };
  }
  return { cells: resolved, detectedPostScore: detected, reconciledPostScore: summarizeGrid(resolved).score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: `Post total ${detected}/${expectedTargetCount} needs manual review for ambiguous targets.` };
}
export function bulkResolveUnknownsForPost(grid: ScorecardCell[], postNumber: number, result: Exclude<ScorecardOutcome, "unknown">, confirmed: boolean) {
  if (!confirmed) return { grid, changed: 0 };
  let changed = 0;
  return { grid: grid.map((c) => c.postNumber === postNumber && c.result === "unknown" ? (changed++, { ...c, result, reviewed: true }) : c), changed };
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
      observedMarkCategory: null,
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
