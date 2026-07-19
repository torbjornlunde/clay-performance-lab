export type ScorecardOutcome = "hit" | "miss" | "unknown";
export type ScorecardCellState = "active" | "inactive" | "active_blank" | "uncertain";
export type ObservedMarkCategory = "diagonal_stroke" | "vertical_stroke" | "check_mark" | "circle" | "zero" | "horizontal_dash" | "cross" | "blank" | "other" | "unreadable";
export type ReconciliationStatus = "matched" | "safely_resolved" | "needs_review" | "conflict";
export type Confidence = "high" | "medium" | "low";
export type ScorecardCell = {
  postNumber: number;
  targetNumber: number;
  result: ScorecardOutcome;
  cellState?: ScorecardCellState | null;
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
    detectedPostScoreConfidence: Confidence | null;
    detectedPostScoreRawText?: string | null;
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
  detectedPostCount: number;
  expectedTargetsByPost: number[];
  detectedTotalTargets: number;
  setupMode: "known" | "discovery";
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
              required: ["postNumber", "expectedTargets", "detectedPostScore", "detectedPostScoreConfidence", "detectedPostScoreRawText", "targets"],
              properties: {
                postNumber: { type: "integer" },
                expectedTargets: { type: ["integer", "null"] },
                detectedPostScore: { type: ["integer", "null"] },
                detectedPostScoreConfidence: { enum: ["high", "medium", "low", null] },
                detectedPostScoreRawText: { type: ["string", "null"] },
                targets: {
                  type: "array",
                  maxItems: 100,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "targetNumber",
                      "cellState",
                      "result",
                      "rawMark",
                      "observedMarkCategory",
                      "confidence",
                      "warning",
                    ],
                    properties: {
                      targetNumber: { type: "integer" },
                      cellState: { enum: ["active", "inactive", "active_blank", "uncertain", null] },
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
function rowLooksLikePhysicalPost(row: any, idx: number, postCount: number, targetsPerPostByPost: number[]) {
  const posts = Array.isArray(row?.posts) ? row.posts : [];
  if (posts.length !== 1) return false;
  const label = cleanString(row.rowLabel, 20);
  const labelNumber = label && /^\s*(post\s*)?\d+\s*$/i.test(label) ? Number(label.replace(/\D/g, "")) : null;
  const postNumber = Number(posts[0]?.postNumber);
  const score = Number.isInteger(posts[0]?.detectedPostScore)
    ? Number(posts[0].detectedPostScore)
    : Number.isInteger(row?.detectedScore)
      ? Number(row.detectedScore)
      : null;
  const expected = targetsPerPostByPost[idx] || targetsPerPostByPost[0] || 0;
  const plausibleScore = score === null || (score >= 0 && score <= expected);
  return plausibleScore && (labelNumber === idx + 1 || postNumber === 1);
}
function repairPhysicalPostRows(input: any, postCount: number, targetsPerPostByPost: number[]) {
  const shooterRows: any[] = Array.isArray(input?.shooterRows) ? input.shooterRows : [];
  if (shooterRows.length !== postCount || postCount < 2) return input;
  if (!shooterRows.every((row, idx) => rowLooksLikePhysicalPost(row, idx, postCount, targetsPerPostByPost))) return input;
  const labels = shooterRows.map((row: any) => cleanString(row.rowLabel, 20));
  const hasSequentialLabels = labels.every((label: string | null, idx: number) => label && Number(label.replace(/\D/g, "")) === idx + 1);
  const allUsePostOne = shooterRows.every((row) => Number(row.posts?.[0]?.postNumber) === 1);
  if (!hasSequentialLabels && !allUsePostOne) return input;
  const posts = shooterRows.map((row, idx) => {
    const post = row.posts[0] || {};
    return {
      ...post,
      postNumber: idx + 1,
      detectedPostScore: Number.isInteger(post.detectedPostScore)
        ? Number(post.detectedPostScore)
        : Number.isInteger(row.detectedScore)
          ? Number(row.detectedScore)
          : null,
      detectedPostScoreConfidence: post.detectedPostScoreConfidence || row.confidence || null,
      detectedPostScoreRawText: post.detectedPostScoreRawText ?? (Number.isInteger(row.detectedScore) ? String(row.detectedScore) : null),
      targets: (Array.isArray(post.targets) ? post.targets : []).map((target: any) => ({
        ...target,
        postNumber: idx + 1,
      })),
    };
  });
  const detectedScores = posts.map((post: any) => post.detectedPostScore).filter((score: any) => Number.isInteger(score)) as number[];
  return {
    ...input,
    warnings: [
      ...(Array.isArray(input.warnings) ? input.warnings : []),
      "Collapsed post table rows that were returned as shooter rows.",
    ],
    shooterRows: [{
      candidateId: "detected-scorecard",
      displayName: "Detected scorecard",
      rowLabel: null,
      confidence: shooterRows.some((row) => cleanConfidence(row.confidence) === "low") ? "medium" : "high",
      detectedScore: detectedScores.length === postCount ? detectedScores.reduce((sum, score) => sum + score, 0) : null,
      posts,
    }],
  };
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
  setup: { postCount?: number | null; targetsPerPost?: number | null; targetsPerPostByPost?: number[]; totalTargets?: number | null; allowStructureDiscovery?: boolean },
): NormalizedScorecardAnalysis {
  if (!input || typeof input !== "object")
    throw new Error("Malformed scorecard analysis.");
  const rawRows = Array.isArray(input.shooterRows) ? input.shooterRows : [];
  const setupPostCount = Number(setup.postCount || 0);
  const setupTargetsPerPost = Number(setup.targetsPerPost || 0);
  const setupMode: "known" | "discovery" = setup.allowStructureDiscovery || !Number.isInteger(setupPostCount) || setupPostCount < 1 || !Number.isInteger(setupTargetsPerPost) || setupTargetsPerPost < 1 ? "discovery" : "known";
  const detectedPostCount = Math.max(0, ...rawRows.flatMap((row: any) => (Array.isArray(row?.posts) ? row.posts : []).map((post: any) => Number(post?.postNumber)).filter((n: number) => Number.isInteger(n) && n > 0)));
  const postCount = setupMode === "known" ? setupPostCount : detectedPostCount;
  const detectedCounts = Array.from({ length: postCount }, (_, index) => {
    const postNumber = index + 1;
    const matchingPosts = rawRows.flatMap((row: any) => Array.isArray(row?.posts) ? row.posts.filter((post: any) => Number(post?.postNumber) === postNumber) : []);
    const declared = matchingPosts.map((post: any) => Number(post?.expectedTargets)).find((count: number) => Number.isInteger(count) && count > 0);
    const activeMax = Math.max(0, ...matchingPosts.flatMap((post: any) => Array.isArray(post?.targets) ? post.targets.filter((target: any) => target?.cellState !== "inactive").map((target: any) => Number(target?.targetNumber)).filter((n: number) => Number.isInteger(n) && n > 0) : []));
    return declared || activeMax || setupTargetsPerPost || 0;
  });
  const targetsPerPost = setupMode === "known" ? setupTargetsPerPost : Math.max(1, ...detectedCounts);
  const targetsPerPostByPost = setupMode === "known"
    ? (Array.isArray(setup.targetsPerPostByPost) && setup.targetsPerPostByPost.length === postCount ? setup.targetsPerPostByPost.map(Number) : Array.from({ length: postCount }, () => targetsPerPost))
    : detectedCounts;
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
  const repairedInput = setupMode === "known" ? repairPhysicalPostRows(input, postCount, targetsPerPostByPost) : input;
  const repairedWarnings = repairedInput === input ? globalWarnings : (Array.isArray(repairedInput.warnings) ? repairedInput.warnings : [])
    .slice(0, 20)
    .map((w: any) => cleanString(w, 180))
    .filter(Boolean) as string[];
  const rows = (Array.isArray(repairedInput.shooterRows) ? repairedInput.shooterRows : [])
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
        const expectedForPost = Number.isInteger(post.expectedTargets) && Number(post.expectedTargets) > 0 ? Math.min(Number(post.expectedTargets), targetsPerPostByPost[p - 1] || targetsPerPost) : (targetsPerPostByPost[p - 1] || targetsPerPost);
        for (const target of (Array.isArray(post.targets)
          ? post.targets
          : []
        ).slice(0, expectedForPost + 20)) {
          const t = Number(target.targetNumber);
          if (target.cellState === "inactive") continue;
          if (setupMode === "known" && Number.isInteger(post.expectedTargets) && Number(post.expectedTargets) !== targetsPerPostByPost[p - 1]) warnings.push(`Detected Post ${p} has ${post.expectedTargets} active targets, but saved setup expects ${targetsPerPostByPost[p - 1]}. Review setup before applying.`);
          if (!Number.isInteger(t) || t < 1 || t > expectedForPost) {
            warnings.push(
              `Ignored out-of-range target ${target.targetNumber} on post ${p}.`,
            );
            continue;
          }
          const rawMark = cleanString(target.rawMark, 24);
          const observedMarkCategory = cleanObservedMarkCategory(target.observedMarkCategory);
          const aiConfidence = cleanConfidence(target.confidence);
          const aiResult: ScorecardOutcome = target.result === "hit" || target.result === "miss" ? target.result : "unknown";
          const deterministic = classifyObservedMark(rawMark, observedMarkCategory);
          let result = aiResult;
          let confidence = aiConfidence;
          let warning = cleanString(target.warning, 120);
          if (aiResult === "unknown" && deterministic.result !== "unknown") {
            result = deterministic.result;
            confidence = deterministic.confidence === "high" && aiConfidence === "low" ? "medium" : deterministic.confidence;
            warning = warning || "Result inferred from recognizable mark shape.";
          } else if (aiConfidence === "low" && deterministic.result !== "unknown" && deterministic.result !== aiResult) {
            result = deterministic.result;
            confidence = "medium";
            warning = warning || "Low-confidence AI result adjusted from mark shape.";
          } else if (aiConfidence === "high" && deterministic.result !== "unknown" && deterministic.result !== aiResult) {
            result = "unknown";
            confidence = "low";
            warning = warning || "High-confidence AI result conflicts with recognizable mark shape.";
          }
          const next: ScorecardCell = {
            postNumber: p,
            targetNumber: t,
            result: target.cellState === "active_blank" || target.cellState === "uncertain" ? "unknown" : result,
            cellState: target.cellState || "active",
            rawMark,
            observedMarkCategory,
            confidence,
            warning,
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
              cellState: "active_blank",
              rawMark: null,
              observedMarkCategory: "blank",
              confidence: "low",
              warning: "No mark detected.",
            },
          );
      const reconciledPosts = [] as ScorecardShooter["posts"];
      let reconciledGrid = grid;
      for (let p = 1; p <= postCount; p++) {
        const postInput = (Array.isArray(row.posts) ? row.posts : []).find((x: any) => Number(x.postNumber) === p);
        const detectedPostScore = Number.isInteger(postInput?.detectedPostScore) ? Number(postInput.detectedPostScore) : null;
        const detectedPostScoreConfidence = cleanConfidence(postInput?.detectedPostScoreConfidence) && postInput?.detectedPostScoreConfidence ? cleanConfidence(postInput.detectedPostScoreConfidence) : null;
        const detectedPostScoreRawText = cleanString(postInput?.detectedPostScoreRawText, 40);
        const rec = reconcileScorecardPost({ cells: reconciledGrid.filter((c) => c.postNumber === p), detectedPostScore, detectedPostScoreConfidence, expectedTargetCount: targetsPerPostByPost[p - 1] });
        reconciledGrid = reconciledGrid.map((c) => c.postNumber === p ? rec.cells.find((x) => x.targetNumber === c.targetNumber) || c : c);
        if (rec.reconciliationWarning) warnings.push(`Post ${p}: ${rec.reconciliationWarning}`);
        reconciledPosts.push({ postNumber: p, detectedPostScore, detectedPostScoreConfidence, detectedPostScoreRawText, reconciledPostScore: rec.reconciledPostScore, reconciliationStatus: rec.reconciliationStatus, reconciliationWarning: rec.reconciliationWarning, targets: rec.cells });
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
    detectedTitle: cleanString(repairedInput.detectedTitle, 120),
    detectedDate: cleanString(repairedInput.detectedDate, 40),
    scorecardConfidence: cleanConfidence(repairedInput.scorecardConfidence),
    shooterRows: rows,
    rawText: cleanString(repairedInput.rawText, 1200) || "",
    warnings: repairedWarnings,
    postCount,
    targetsPerPost,
    targetsPerPostByPost,
    detectedPostCount: postCount,
    expectedTargetsByPost: targetsPerPostByPost,
    detectedTotalTargets: totalTargets,
    setupMode,
    totalTargets,
  };
}

function isProtectedAiUncertain(cell: ScorecardCell) { return cell.cellState === "uncertain" && !cell.reviewed; }
export function markEvidenceResult(cell: ScorecardCell): Exclude<ScorecardOutcome, "unknown"> | null {
  if (isProtectedAiUncertain(cell)) return null;
  const deterministic = classifyObservedMark(cell.rawMark, cell.observedMarkCategory);
  return deterministic.result === "hit" || deterministic.result === "miss" ? deterministic.result : null;
}
function evidenceScore(cell: ScorecardCell, result: Exclude<ScorecardOutcome, "unknown">) {
  const mark = markEvidenceResult(cell);
  let score = 0;
  if (mark === result) score += cell.confidence === "high" ? 8 : cell.confidence === "medium" ? 5 : 3;
  else if (mark && mark !== result) score -= cell.confidence === "high" ? 8 : cell.confidence === "medium" ? 5 : 3;
  if (cell.result === result) score += cell.confidence === "high" ? 4 : cell.confidence === "medium" ? 2 : 1;
  else if (cell.result !== "unknown") score -= cell.confidence === "high" ? 4 : cell.confidence === "medium" ? 2 : 1;
  return score;
}
export function reconcileScorecardPost({ cells, detectedPostScore, detectedPostScoreConfidence, expectedTargetCount }: { cells: ScorecardCell[]; detectedPostScore: number | null; detectedPostScoreConfidence?: Confidence | null; expectedTargetCount: number }): { cells: ScorecardCell[]; detectedPostScore: number | null; detectedPostScoreConfidence: Confidence | null; reconciledPostScore: number; reconciliationStatus: ReconciliationStatus; reconciliationWarning: string | null } {
  const normalized = cells.slice(0, expectedTargetCount).map((cell) => ({ ...cell }));
  const detected = Number.isInteger(detectedPostScore) ? Number(detectedPostScore) : null;
  const totalConfidence: Confidence | null = detectedPostScoreConfidence === "high" || detectedPostScoreConfidence === "medium" || detectedPostScoreConfidence === "low" ? detectedPostScoreConfidence : null;
  if (detected === null || detected < 0 || detected > expectedTargetCount) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: detected === null ? null : "Detected post total is outside the expected target count." };
  const requiredMisses = expectedTargetCount - detected;
  const fixed = normalized.filter((c) => (c.reviewed || c.confidence === "high") && (c.result === "hit" || c.result === "miss"));
  const fixedHits = fixed.filter((c) => c.result === "hit").length;
  const fixedMisses = fixed.filter((c) => c.result === "miss").length;
  if (fixedHits > detected || fixedMisses > requiredMisses) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "conflict" as ReconciliationStatus, reconciliationWarning: `Fixed high-confidence or reviewed marks conflict with detected post total ${detected}/${expectedTargetCount}.` };
  const current = summarizeGrid(normalized);
  const protectedUncertain = normalized.filter((cell) => isProtectedAiUncertain(cell) && cell.result === "unknown");
  if (current.unknowns === 0 && current.score === detected) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: detected, reconciliationStatus: "matched" as ReconciliationStatus, reconciliationWarning: null };
  if (protectedUncertain.length) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: current.score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: `${protectedUncertain.length} AI-uncertain target${protectedUncertain.length === 1 ? "" : "s"} must be reviewed manually.` };
  const fixedKeys = new Set(fixed.map((c) => cellKey(c.postNumber, c.targetNumber)));
  const flexible = normalized.filter((c) => !fixedKeys.has(cellKey(c.postNumber, c.targetNumber)));
  const needHits = detected - fixedHits, needMisses = requiredMisses - fixedMisses;
  if (needHits < 0 || needMisses < 0 || needHits + needMisses !== flexible.length) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "conflict" as ReconciliationStatus, reconciliationWarning: `Detected post total ${detected}/${expectedTargetCount} conflicts with fixed evidence.` };
  const hasCredibleMiss = normalized.some((c) => markEvidenceResult(c) === "miss" || (c.result === "miss" && c.confidence === "high"));
  const hasCredibleHit = normalized.some((c) => markEvidenceResult(c) === "hit" || (c.result === "hit" && c.confidence === "high"));
  if (detected === expectedTargetCount && hasCredibleMiss) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: `Post total ${detected}/${expectedTargetCount} conflicts with credible miss evidence and needs review.` };
  if (detected === 0 && hasCredibleHit) return { cells: normalized, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: summarizeGrid(normalized).score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: `Post total ${detected}/${expectedTargetCount} conflicts with credible hit evidence and needs review.` };
  if (totalConfidence === "high" && detected === expectedTargetCount && !hasCredibleMiss) {
    const cellsOut = normalized.map((c) => fixedKeys.has(cellKey(c.postNumber, c.targetNumber)) ? c : { ...c, result: "hit" as ScorecardOutcome, warning: c.warning || "Resolved from high-confidence post total." });
    return { cells: cellsOut, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: detected, reconciliationStatus: "safely_resolved" as ReconciliationStatus, reconciliationWarning: null };
  }
  if (totalConfidence === "high" && detected === 0 && !hasCredibleHit) {
    const cellsOut = normalized.map((c) => fixedKeys.has(cellKey(c.postNumber, c.targetNumber)) ? c : { ...c, result: "miss" as ScorecardOutcome, warning: c.warning || "Resolved from high-confidence post total." });
    return { cells: cellsOut, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: detected, reconciliationStatus: "safely_resolved" as ReconciliationStatus, reconciliationWarning: null };
  }
  const ranked = flexible.map((cell) => ({ cell, swing: evidenceScore(cell, "hit") - evidenceScore(cell, "miss") })).sort((a, b) => b.swing - a.swing || a.cell.targetNumber - b.cell.targetNumber);
  const boundaryClear = needHits === 0 || needHits === ranked.length || (ranked[needHits - 1] && ranked[needHits] && ranked[needHits - 1].swing > ranked[needHits].swing);
  const hasMeaningfulEvidence = ranked.some((r) => Math.abs(r.swing) > 0);
  if (boundaryClear && hasMeaningfulEvidence) {
    const hitSet = new Set(ranked.slice(0, needHits).map((r) => cellKey(r.cell.postNumber, r.cell.targetNumber)));
    const cellsOut = normalized.map((c) => fixedKeys.has(cellKey(c.postNumber, c.targetNumber)) ? c : { ...c, result: (hitSet.has(cellKey(c.postNumber, c.targetNumber)) ? "hit" : "miss") as ScorecardOutcome, warning: c.warning || "Resolved from post total and mark evidence." });
    return { cells: cellsOut, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: detected, reconciliationStatus: "safely_resolved" as ReconciliationStatus, reconciliationWarning: null };
  }
  const cellsOut = normalized.map((c) => fixedKeys.has(cellKey(c.postNumber, c.targetNumber)) ? c : { ...c, result: ((markEvidenceResult(c) || c.result === "hit" || c.result === "miss") ? c.result : "unknown") as ScorecardOutcome });
  return { cells: cellsOut, detectedPostScore: detected, detectedPostScoreConfidence: totalConfidence, reconciledPostScore: summarizeGrid(cellsOut).score, reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: `Post total ${detected}/${expectedTargetCount} needs manual review for ambiguous targets.` };
}

export function deriveCurrentPostReconciliation({ currentCells, detectedPostScore, detectedPostScoreConfidence, expectedTargetCount, originalStatus, originalWarning, explicitlyReviewed = false }: { currentCells: ScorecardCell[]; detectedPostScore: number | null; detectedPostScoreConfidence?: Confidence | null; expectedTargetCount: number; originalStatus?: ReconciliationStatus | null; originalWarning?: string | null; explicitlyReviewed?: boolean }) {
  const summary = summarizeGrid(currentCells);
  if (summary.unknowns > 0) return { reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: originalWarning || null, reviewedScore: summary.score };
  const detected = Number.isInteger(detectedPostScore) ? Number(detectedPostScore) : null;
  if (detected !== null && summary.score === detected) return { reconciliationStatus: "matched" as ReconciliationStatus, reconciliationWarning: originalWarning || null, reviewedScore: summary.score };
  if (detected !== null && summary.score !== detected && detectedPostScoreConfidence === "high" && !explicitlyReviewed) return { reconciliationStatus: "conflict" as ReconciliationStatus, reconciliationWarning: `Reviewed score ${summary.score}/${expectedTargetCount} conflicts with high-confidence AI-detected total ${detected}/${expectedTargetCount}. Confirm this post after checking the photo to use the reviewed cells.`, reviewedScore: summary.score };
  if (detected !== null && summary.score !== detected) return { reconciliationStatus: "needs_review" as ReconciliationStatus, reconciliationWarning: `Reviewed score ${summary.score}/${expectedTargetCount} differs from AI-detected total ${detected}/${expectedTargetCount}. The reviewed cells are authoritative because this post was explicitly reviewed.`, reviewedScore: summary.score };
  return { reconciliationStatus: originalStatus === "conflict" ? "needs_review" as ReconciliationStatus : (originalStatus || "needs_review" as ReconciliationStatus), reconciliationWarning: originalWarning || null, reviewedScore: summary.score };
}
export type PostReviewStatus = "Conflict" | "Needs review" | "Reviewed" | "Ready";
export function getPostReviewStatus({ cells, reconciliationStatus, explicitlyReviewed }: { cells: ScorecardCell[]; reconciliationStatus?: ReconciliationStatus | null; explicitlyReviewed: boolean }): PostReviewStatus {
  if (reconciliationStatus === "conflict") return "Conflict";
  if (cells.some((c) => c.result === "unknown")) return "Needs review";
  return explicitlyReviewed ? "Reviewed" : "Ready";
}
export function unresolvedTargetsForPost(grid: ScorecardCell[], postNumber: number) {
  return grid.filter((c) => c.postNumber === postNumber && c.result === "unknown").map((c) => c.targetNumber).sort((a, b) => a - b);
}
export function normalizeReviewProgress({ grid, postCount, currentReviewPost, reviewedPostNumbers, postStatuses }: { grid: ScorecardCell[]; postCount: number; currentReviewPost?: number | null; reviewedPostNumbers?: number[] | null; postStatuses?: Record<number, ReconciliationStatus | null | undefined> }) {
  const safePostCount = Math.max(1, Math.floor(postCount || 1));
  const reviewed = Array.from(new Set((Array.isArray(reviewedPostNumbers) ? reviewedPostNumbers : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= safePostCount))).sort((a, b) => a - b).filter((post) => getPostReviewStatus({ cells: grid.filter((c) => c.postNumber === post), reconciliationStatus: postStatuses?.[post], explicitlyReviewed: true }) === "Reviewed");
  const invalidCurrent = !Number.isInteger(currentReviewPost) || Number(currentReviewPost) < 1 || Number(currentReviewPost) > safePostCount;
  const firstUnresolved = Array.from({ length: safePostCount }, (_, i) => i + 1).find((post) => getPostReviewStatus({ cells: grid.filter((c) => c.postNumber === post), reconciliationStatus: postStatuses?.[post], explicitlyReviewed: reviewed.includes(post) }) !== "Reviewed");
  return { currentReviewPost: invalidCurrent ? (firstUnresolved || 1) : Number(currentReviewPost), reviewedPostNumbers: reviewed };
}
export function findNextReviewPost({ currentPost, postCount, grid, reviewedPostNumbers, postStatuses }: { currentPost: number; postCount: number; grid: ScorecardCell[]; reviewedPostNumbers: number[]; postStatuses?: Record<number, ReconciliationStatus | null | undefined> }) {
  const posts = Array.from({ length: postCount }, (_, i) => i + 1);
  const ordered = [...posts.filter((p) => p > currentPost), ...posts.filter((p) => p <= currentPost)];
  return ordered.find((post) => getPostReviewStatus({ cells: grid.filter((c) => c.postNumber === post), reconciliationStatus: postStatuses?.[post], explicitlyReviewed: reviewedPostNumbers.includes(post) }) !== "Reviewed") || currentPost;
}
export function confirmCurrentPostReview({ grid, currentPost, postCount, reviewedPostNumbers, postStatuses }: { grid: ScorecardCell[]; currentPost: number; postCount: number; reviewedPostNumbers: number[]; postStatuses?: Record<number, ReconciliationStatus | null | undefined> }) {
  const status = getPostReviewStatus({ cells: grid.filter((c) => c.postNumber === currentPost), reconciliationStatus: postStatuses?.[currentPost], explicitlyReviewed: false });
  if (status !== "Ready") return { ok: false as const, currentReviewPost: currentPost, reviewedPostNumbers, message: unresolvedTargetsForPost(grid, currentPost).length ? `Resolve ${unresolvedTargetsForPost(grid, currentPost).length} unknown target${unresolvedTargetsForPost(grid, currentPost).length === 1 ? "" : "s"} in Post ${currentPost} before marking it reviewed.` : `Post ${currentPost} cannot be marked reviewed while it has a reconciliation conflict.` };
  const reviewed = Array.from(new Set([...reviewedPostNumbers, currentPost])).sort((a, b) => a - b);
  return { ok: true as const, currentReviewPost: findNextReviewPost({ currentPost, postCount, grid, reviewedPostNumbers: reviewed, postStatuses }), reviewedPostNumbers: reviewed, message: "Saved on this device." };
}
export function resetReviewProgress(nextGrid: ScorecardCell[], selectedShooterCandidateId: string | null) {
  return { selectedShooterCandidateId, reviewedGrid: nextGrid, currentReviewPost: 1, reviewedPostNumbers: [] as number[], acknowledgeAmbiguousExisting: false };
}
export function createReviewPersistenceSnapshot<T extends { reviewedGrid?: ScorecardCell[]; selectedShooterCandidateId?: string | null; currentReviewPost?: number; reviewedPostNumbers?: number[]; scoreChoice?: "use_scorecard" | "keep_existing"; acknowledgeAmbiguousExisting?: boolean; reviewedGridFingerprint?: string | null; localReviewRevision?: number }>(base: T, next: Partial<T>, revision: number): T {
  return { ...base, ...next, localReviewRevision: revision };
}
export function chooseLatestReviewRevision<T extends { localReviewRevision?: number }>(a: T | null | undefined, b: T | null | undefined) {
  if (!a) return b || null;
  if (!b) return a;
  return (b.localReviewRevision || 0) >= (a.localReviewRevision || 0) ? b : a;
}
export function bulkResolveUnknownsForPost(grid: ScorecardCell[], postNumber: number, result: Exclude<ScorecardOutcome, "unknown">, confirmed: boolean) {
  if (!confirmed) return { grid, changed: 0 };
  let changed = 0;
  return { grid: grid.map((c) => c.postNumber === postNumber && c.result === "unknown" ? (changed++, { ...c, result, cellState: "active" as const, warning: c.cellState === "uncertain" ? null : c.warning, reviewed: true }) : c), changed };
}

export function applyUserCorrection(
  grid: ScorecardCell[],
  postNumber: number,
  targetNumber: number,
  result: ScorecardOutcome,
): ScorecardCell[] {
  return grid.map((c) =>
    c.postNumber === postNumber && c.targetNumber === targetNumber
      ? { ...c, result, cellState: (result === "unknown" ? "active_blank" : "active") as ScorecardCellState, warning: c.cellState === "uncertain" ? null : c.warning, reviewed: true }
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
        ? (changed++, { ...c, result, cellState: "active" as const, warning: c.cellState === "uncertain" ? null : c.warning, reviewed: true })
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

export type OrderedPendingOperation<T extends { clientImportId: string; localReviewRevision?: number }> =
  | { kind: "write"; generation: number; snapshot: T }
  | { kind: "delete"; generation: number; sessionId: string; clientImportId: string };
export type OrderedPendingState<T extends { clientImportId: string; localReviewRevision?: number }> = { generation: number; record: T | null; deletedClientImportIds: string[] };
export function applyOrderedPendingOperation<T extends { clientImportId: string; localReviewRevision?: number }>(state: OrderedPendingState<T>, op: OrderedPendingOperation<T>): OrderedPendingState<T> {
  if (op.generation < state.generation) return state;
  if (op.kind === "delete") return { generation: op.generation, record: state.record?.clientImportId === op.clientImportId ? null : state.record, deletedClientImportIds: Array.from(new Set([...state.deletedClientImportIds, op.clientImportId])) };
  if (state.deletedClientImportIds.includes(op.snapshot.clientImportId)) return state;
  if (state.record && state.record.clientImportId !== op.snapshot.clientImportId && op.generation <= state.generation) return state;
  if (state.record?.clientImportId === op.snapshot.clientImportId && (op.snapshot.localReviewRevision || 0) < (state.record.localReviewRevision || 0)) return state;
  return { generation: op.generation, record: op.snapshot, deletedClientImportIds: state.deletedClientImportIds };
}
