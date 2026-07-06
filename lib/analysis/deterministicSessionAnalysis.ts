import { postTargetUnitLabel } from "../disciplines";
import { normalizeLeirdueDisciplineLabel } from "../leirdue/normalize";
import { scoreFromMisses, totalMisses } from "../misses/scoring";

export type AnalysisSession = {
  id: string;
  name?: string | null;
  discipline?: string | null;
  session_type?: string | null;
  own_score?: number | null;
  winning_score?: number | null;
  total_targets?: number | null;
  post_count?: number | null;
  targets_per_post?: number | null;
  created_at?: string | null;
  competition_date?: string | null;
  leirdue_result_url?: string | null;
};

export type AnalysisMiss = {
  id?: string;
  course_number: number | null;
  target_position?: number | null;
  target_number: number | null;
  target_label?: string | null;
  target_type?: string | null;
  direction?: string | null;
  where_miss?: string | null;
  main_reason?: string | null;
  target_read?: string | null;
  missed_target?: string | null;
  created_at?: string | null;
};

export type PostTargetAnalysisRow = {
  post_number: number | null;
  target_position: number | null;
  presentation_number?: number | null;
  presentation_type?: string | null;
  position_in_presentation?: number | null;
  target_label?: string | null;
  target_type?: string | null;
  direction?: string | null;
  angle?: string | null;
  speed?: string | null;
  distance?: string | null;
  difficulty?: string | null;
  notes?: string | null;
};

export type ScorecardImportSummary = {
  reviewed_total_targets: number;
  reviewed_hits: number;
  reviewed_misses: number;
  inserted_misses?: number | null;
  skipped_duplicates?: number | null;
  created_at?: string | null;
};

export const ANALYSIS_THRESHOLDS = {
  dominantShare: 0.4,
  repeatedCount: 3,
  concentrationShare: 0.5,
  closePercentagePoints: 3,
  recentHistoryLimit: 10,
  smallSample: 3,
};

const PLACEHOLDERS = new Set([
  "",
  "unknown",
  "not sure",
  "notsure",
  "details not added",
  "detail not added",
  "not added",
  "n/a",
  "na",
  "none",
  "null",
  "-",
]);

export function isMissingAnalyticalValue(value: unknown) {
  if (value === null || value === undefined) return true;
  return PLACEHOLDERS.has(String(value).trim().toLowerCase());
}

function pct(n: number) { return `${n.toFixed(1).replace(/\.0$/, "")}%`; }
function hitPct(score: number, total: number) { return total > 0 ? (score / total) * 100 : null; }
function key(value: unknown) { return isMissingAnalyticalValue(value) ? null : String(value).trim(); }
function count<T extends string | number>(values: Array<T | null | undefined>) {
  const out = new Map<string, number>();
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const k = String(value);
    out.set(k, (out.get(k) || 0) + 1);
  }
  return [...out.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
}
function topSupported(entries: [string, number][], total: number, min = ANALYSIS_THRESHOLDS.repeatedCount) {
  const first = entries[0];
  if (!first) return null;
  if (first[1] >= min || first[1] / Math.max(1,total) >= ANALYSIS_THRESHOLDS.dominantShare) return first;
  return null;
}
function normalizeDiscipline(value?: string | null) { return normalizeLeirdueDisciplineLabel(value).discipline; }
function sessionDateValue(s: AnalysisSession) { return Date.parse(`${s.competition_date || s.created_at || "1970-01-01"}T00:00:00Z`.replace(/T.*T/, "T")) || 0; }
function average(nums: number[]) { return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null; }
function median(nums: number[]) { if(!nums.length) return null; const s=[...nums].sort((a,b)=>a-b); const mid=Math.floor(s.length/2); return s.length%2?s[mid]:(s[mid-1]+s[mid])/2; }
function compare(current: number, avg: number | null) { if(avg === null) return null; const diff=current-avg; const close=ANALYSIS_THRESHOLDS.closePercentagePoints; return diff > close ? "above" : diff < -close ? "below" : "close to"; }

export type ClayAtom = {
  postNumber: number;
  targetPosition: number;
  presentationNumber: number | null;
  positionInPresentation: number | null;
  setup?: PostTargetAnalysisRow;
  source: "target_position" | "presentation";
};

function targetRowsForPresentation(targets: PostTargetAnalysisRow[], post: number, presentation: number | null | undefined) {
  return targets
    .filter(t => Number(t.post_number) === post && Number(t.presentation_number) === Number(presentation))
    .sort((a,b)=>Number(a.target_position)-Number(b.target_position));
}

function atomFromRow(row: PostTargetAnalysisRow | undefined, source: ClayAtom["source"]): ClayAtom | null {
  if (!row || !row.post_number || !row.target_position) return null;
  return { postNumber: Number(row.post_number), targetPosition: Number(row.target_position), presentationNumber: row.presentation_number ?? null, positionInPresentation: row.position_in_presentation ?? null, setup: row, source };
}

export function expandMissToClayAtoms(miss: AnalysisMiss, targets: PostTargetAnalysisRow[]) {
  const post = Number(miss.course_number || 0);
  if (!post) return { atoms: [] as ClayAtom[], ambiguous: true };
  if (miss.target_position) {
    const setup = targets.find(t => Number(t.post_number) === post && Number(t.target_position) === Number(miss.target_position));
    return {
      atoms: [{ postNumber: post, targetPosition: Number(miss.target_position), presentationNumber: setup?.presentation_number ?? miss.target_number ?? null, positionInPresentation: setup?.position_in_presentation ?? null, setup, source: "target_position" as const }],
      ambiguous: false,
    };
  }
  const rows = targetRowsForPresentation(targets, post, miss.target_number);
  const missed = String(miss.missed_target || "").toLowerCase();
  if (missed.includes("both")) {
    const first = rows.find(r => r.position_in_presentation === 1);
    const second = rows.find(r => r.position_in_presentation === 2);
    const atoms = [first && atomFromRow(first, "presentation"), second && atomFromRow(second, "presentation")].filter(Boolean) as ClayAtom[];
    return { atoms, ambiguous: atoms.length !== 2 };
  }
  if (missed.includes("first")) {
    const atom = atomFromRow(rows.find(r => r.position_in_presentation === 1) as PostTargetAnalysisRow, "presentation");
    return { atoms: atom ? [atom] : [], ambiguous: !atom };
  }
  if (missed.includes("second")) {
    const atom = atomFromRow(rows.find(r => r.position_in_presentation === 2) as PostTargetAnalysisRow, "presentation");
    return { atoms: atom ? [atom] : [], ambiguous: !atom };
  }
  if (missed.includes("single")) {
    const row = rows.length === 1 ? rows[0] : rows.find(r => r.presentation_type === "single");
    const atom = atomFromRow(row as PostTargetAnalysisRow, "presentation");
    return { atoms: atom ? [atom] : [], ambiguous: !atom };
  }
  return { atoms: [] as ClayAtom[], ambiguous: true };
}

export function buildDeterministicSessionAnalysis(input: {
  session: AnalysisSession;
  misses: AnalysisMiss[];
  scorecardImport?: ScorecardImportSummary | null;
  postTargets?: PostTargetAnalysisRow[];
  history?: AnalysisSession[];
}) {
  const postTargets = input.postTargets || [];
  const weightedMisses = totalMisses(input.misses);
  const totalTargets = input.scorecardImport?.reviewed_total_targets ?? input.session.total_targets ?? null;
  const missTotal = input.scorecardImport?.reviewed_misses ?? weightedMisses;
  const score = input.scorecardImport?.reviewed_hits ?? input.session.own_score ?? (typeof totalTargets === "number" ? scoreFromMisses(totalTargets, weightedMisses) : 0);
  const currentPct = hitPct(score, totalTargets || 0);
  const findings: string[] = [];
  const missingData: string[] = [];
  const recommendations: Array<{title:string;evidence:string}> = [];
  const unitLabel = postTargetUnitLabel(input.session.discipline).toLowerCase();

  findings.push(`Score: ${score}/${totalTargets}${currentPct === null ? "" : ` (${pct(currentPct)})`}.`);
  findings.push(`Total misses: ${missTotal}.`);

  const expanded = input.misses.map(m => expandMissToClayAtoms(m, postTargets));
  const atoms = expanded.flatMap(x => x.atoms).slice(0, missTotal);
  const ambiguousClayCount = Math.max(0, missTotal - atoms.length);
  const mappedCount = atoms.length;
  const byPost = count(atoms.map(a => a.postNumber));
  const topPost = topSupported(byPost, mappedCount, 2);
  if (topPost) findings.push(`${topPost[1]} mapped misses came on ${unitLabel} ${topPost[0]} (${mappedCount} of ${missTotal} reviewed misses mapped).`);
  if (byPost.length >= 2 && byPost[0][1] + byPost[1][1] >= Math.max(3, Math.ceil(mappedCount * ANALYSIS_THRESHOLDS.concentrationShare))) {
    findings.push(`Most mapped misses came on ${unitLabel}s ${byPost[0][0]} and ${byPost[1][0]} (${byPost[0][1] + byPost[1][1]} of ${mappedCount} mapped misses).`);
  }
  const postCount = Number(input.session.post_count || 0);
  const targetsPerPost = Number(input.session.targets_per_post || 0);
  if (postCount > 0 && targetsPerPost > 0 && typeof totalTargets === "number" && postCount * targetsPerPost === totalTargets) {
    const postStats = Array.from({length: postCount}, (_,i)=>{ const post=i+1; const misses=atoms.filter(a=>a.postNumber===post).length; return {post, misses, hits: targetsPerPost-misses, missRate: misses/targetsPerPost}; });
    const best = Math.min(...postStats.map(p=>p.missRate));
    const worst = Math.max(...postStats.map(p=>p.missRate));
    const strongest = postStats.filter(p=>p.missRate===best).map(p=>p.post);
    const weakest = postStats.filter(p=>p.missRate===worst).map(p=>p.post);
    findings.push(`Strongest ${strongest.length === 1 ? unitLabel : `${unitLabel}s`}: ${strongest.join(", ")} (${Math.round(best * targetsPerPost)} misses each).`);
    findings.push(`Weakest ${weakest.length === 1 ? unitLabel : `${unitLabel}s`}: ${weakest.join(", ")} (${Math.round(worst * targetsPerPost)} misses each).`);
  }
  if (input.misses.length && ambiguousClayCount > 0) missingData.push(`${ambiguousClayCount} reviewed misses could not be mapped to exact target positions from the available target setup.`);
  if (input.misses.length && mappedCount < missTotal) missingData.push("Target descriptions are missing for some imported misses, so target type, direction and pair-position patterns are limited.");
  const posEntries = count(atoms.map(x => x.positionInPresentation === 1 ? "first target" : x.positionInPresentation === 2 ? "second target" : null));
  const topPos = topSupported(posEntries, mappedCount);
  if (topPos) findings.push(`${topPos[1]} mapped misses were on the ${topPos[0]} of a presentation.`);
  const label = topSupported(count(atoms.map(x => key(x.setup?.target_label))), mappedCount);
  if (label) findings.push(`Target ${label[0]} was missed ${label[1]} times in mapped misses.`);
  const direction = topSupported(count(atoms.map(x => key(x.setup?.direction))), mappedCount);
  if (direction) findings.push(`${direction[1]} mapped misses involved ${direction[0]} targets.`);
  const targetType = topSupported(count(atoms.map(x => key(x.setup?.target_type))), mappedCount);
  if (targetType) findings.push(`${targetType[1]} mapped misses involved ${targetType[0]} targets.`);

  const reasonEntries = count(input.misses.map(m => key(m.main_reason)));
  const whereEntries = count(input.misses.map(m => key(m.where_miss)));
  const reason = topSupported(reasonEntries, input.misses.length);
  if (reason) findings.push(`Manual miss reason pattern: ${reason[0]} (${reason[1]} misses).`);
  const where = topSupported(whereEntries, input.misses.length);
  if (where) findings.push(`Manual miss location pattern: ${where[0]} (${where[1]} misses).`);
  if (!reasonEntries.length && !whereEntries.length && input.misses.length) missingData.push("Manual miss reasons have not been added; imported placeholder values are ignored instead of treated as findings.");

  if (topPost) recommendations.push({ title: `Recreate ${unitLabel} ${topPost[0]} first.`, evidence: `It contained ${topPost[1]} mapped misses from the reviewed scorecard.` });
  if (topPos) recommendations.push({ title: `Practise transitions into the ${topPos[0]}.`, evidence: `${topPos[1]} mapped misses occurred in that proven presentation position.` });
  if (!postTargets.length && input.misses.length) recommendations.push({ title: "Add target descriptions for the mapped scorecard positions.", evidence: "Without available target setup, direction, speed and target-type repeats cannot be proven." });
  if (!recommendations.length && input.misses.length) recommendations.push({ title: "Repeat the most common mapped presentations from this reviewed scorecard.", evidence: "The scorecard gives missed target positions, while incomplete manual miss details are treated as missing evidence." });

  const normalized = normalizeDiscipline(input.session.discipline);
  const history = (input.history || [])
    .filter(s => s.id !== input.session.id && normalizeDiscipline(s.discipline) === normalized && typeof s.own_score === "number" && typeof s.total_targets === "number" && s.total_targets > 0);
  function comparison(type: "Competition" | "Training") {
    const rows = history.filter(s => s.session_type === type).sort((a,b)=>sessionDateValue(b)-sessionDateValue(a)).slice(0, ANALYSIS_THRESHOLDS.recentHistoryLimit);
    const pcts = rows.map(s => (Number(s.own_score) / Number(s.total_targets)) * 100);
    const avg = average(pcts), med = median(pcts);
    return { sessionType:type, sampleSize:rows.length, averagePercentage:avg, medianPercentage:med, result: currentPct === null ? null : compare(currentPct, avg), message: rows.length ? `${type}: current result is ${compare(currentPct || 0, avg)} your recent average of ${pct(avg || 0)} (${rows.length} sessions).` : `${type}: no earlier comparable sessions found.` };
  }
  const competitionComparison = comparison("Competition");
  const trainingComparison = comparison("Training");
  if (competitionComparison.sampleSize < ANALYSIS_THRESHOLDS.smallSample) missingData.push("Too few earlier Competition sessions for a high-confidence comparison.");
  if (trainingComparison.sampleSize < ANALYSIS_THRESHOLDS.smallSample) missingData.push("Too few earlier Training sessions for a high-confidence comparison.");

  let winningScore = null as null | { pointsBehind: number; percentageOfWinning: number; message: string };
  if (typeof input.session.winning_score === "number" && input.session.winning_score > 0) {
    const pointsBehind = input.session.winning_score - score;
    const percentageOfWinning = (score / input.session.winning_score) * 100;
    winningScore = { pointsBehind, percentageOfWinning, message: `${pointsBehind} points behind winning score; ${pct(percentageOfWinning)} of winning score.` };
  } else missingData.push("Winning score is missing, so points behind the winner cannot be shown.");

  return {
    summary: { score, totalTargets, hitPercentage: currentPct, misses: missTotal, mappedMisses: mappedCount, ambiguousMisses: ambiguousClayCount },
    findings,
    competitionComparison,
    trainingComparison,
    winningScore,
    recommendations: recommendations.slice(0,3),
    missingData: [...new Set(missingData)],
    confidence: { smallSample: competitionComparison.sampleSize < ANALYSIS_THRESHOLDS.smallSample || trainingComparison.sampleSize < ANALYSIS_THRESHOLDS.smallSample, thresholds: ANALYSIS_THRESHOLDS },
  };
}
