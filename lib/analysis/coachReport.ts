import type { AnalysisSession, ScorecardImportSummary, PostTargetAnalysisRow, AnalysisMiss, PrivateSessionAnalysisNote } from "./deterministicSessionAnalysis";
import { buildDeterministicSessionAnalysis } from "./deterministicSessionAnalysis";

export type CoachReportInput = {
  session: AnalysisSession & { location?: string | null; shooting_format?: string | null };
  misses: AnalysisMiss[];
  scorecardImport?: ScorecardImportSummary | null;
  postTargets?: PostTargetAnalysisRow[];
  history?: AnalysisSession[];
  privateNotes?: PrivateSessionAnalysisNote[];
  includeNotesContext?: boolean;
};

function clean(value: unknown) { return String(value ?? "").trim(); }
export function formatCoachReportDate(session: AnalysisSession) {
  const value = session.competition_date || session.created_at;
  if (!value) return "Date not recorded";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : String(value).slice(0, 10);
}

export function buildCoachReport(input: CoachReportInput) {
  const analysis = buildDeterministicSessionAnalysis({ ...input, includePrivateNotes: input.includeNotesContext });
  const title = clean(input.session.name) || "Untitled session";
  const discipline = clean(input.session.discipline) || "Discipline not recorded";
  const location = clean(input.session.location) || "Location not recorded";
  const date = formatCoachReportDate(input.session);
  const scoreLine = `Score: ${analysis.summary.score}/${analysis.summary.totalTargets ?? "total targets not recorded"}`;
  const sections = [
    { title: "Session", items: [`${title}`, `Date: ${date}`, `Location: ${location}`, `Discipline: ${discipline}`, scoreLine] },
    ...(analysis.winningScore ? [{ title: "Winning score gap", items: [`Observed data shows ${analysis.winningScore.message}`] }] : []),
    { title: "Key findings", items: analysis.findings.map((text) => `Observed data shows ${text}`) },
    { title: "Training focus", items: analysis.recommendations.map((item) => `The analysis suggests ${item.title} Evidence: ${item.evidence}`) },
    { title: "Recommended drills/priorities", items: analysis.recommendations.map((item) => item.title) },
    ...(input.includeNotesContext && analysis.notesBasedContext ? [{ title: "Notes-based context", items: [...analysis.notesBasedContext.summary.map((text) => `Private notes suggest ${text}`), "This should be treated as context, not a confirmed cause."] }] : []),
    { title: "Missing data / confidence notes", items: analysis.missingData.length ? analysis.missingData : ["No major missing-data notes were produced for this session."] },
    { title: "Disclaimer", items: ["This is a training-support summary, not a replacement for a coach watching you shoot."] },
  ].filter((section) => section.items.length > 0);
  const plainText = sections.map((section) => `${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`).join("\n\n");
  return { analysis, title, discipline, hasNotesContext: Boolean(input.includeNotesContext && analysis.notesBasedContext), sections, plainText };
}
