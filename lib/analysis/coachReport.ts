import type { AnalysisSession, ScorecardImportSummary, PostTargetAnalysisRow, AnalysisMiss, PrivateSessionAnalysisNote } from "./deterministicSessionAnalysis";
import { acceptedEvidenceSentence } from "../ai/reflectionEvidence";
import { currentAcceptedReflectionEvidence, type ReviewableReflectionEvidence } from "../ai/currentReflectionEvidence";
import { buildDeterministicSessionAnalysis } from "./deterministicSessionAnalysis";

export type CoachReportInput = {
  session: AnalysisSession & { shooting_ground?: string | null; shooting_format?: string | null };
  misses: AnalysisMiss[];
  scorecardImport?: ScorecardImportSummary | null;
  postTargets?: PostTargetAnalysisRow[];
  history?: AnalysisSession[];
  privateNotes?: PrivateSessionAnalysisNote[];
  acceptedEvidence?: ReviewableReflectionEvidence[];
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
  const noteSources = (input.privateNotes || []).filter((note): note is PrivateSessionAnalysisNote & { id: string; updated_at: string } => Boolean(note.id && note.updated_at));
  const acceptedEvidence = currentAcceptedReflectionEvidence(input.acceptedEvidence || [], noteSources);
  const analysis = buildDeterministicSessionAnalysis({ ...input, reflectionEvidence: acceptedEvidence, reflectionEvidenceSources: noteSources, includePrivateNotes: input.includeNotesContext });
  const title = clean(input.session.name) || "Untitled session";
  const discipline = clean(input.session.discipline) || "Discipline not recorded";
  const venue = clean(input.session.shooting_ground) || "Venue/ground not recorded";
  const date = formatCoachReportDate(input.session);
  const scoreLine = `Score: ${analysis.summary.score}/${analysis.summary.totalTargets ?? "total targets not recorded"}`;
  const sections = [
    { title: "Session", items: [`${title}`, `Date: ${date}`, `Venue/ground: ${venue}`, `Discipline: ${discipline}`, scoreLine] },
    ...(analysis.winningScore ? [{ title: "Winning score gap", items: [`Observed data shows ${analysis.winningScore.message}`] }] : []),
    { title: "Key findings", items: analysis.findings.map((text) => `Observed data shows ${text}`) },
    { title: "Training focus", items: analysis.recommendations.map((item) => `The analysis suggests ${item.title} Evidence: ${item.evidence}`) },
    { title: "Recommended drills/priorities", items: analysis.recommendations.map((item) => item.title) },
    ...(input.includeNotesContext && analysis.notesBasedContext ? [{ title: "Reviewed context", items: analysis.notesBasedContext.summary }] : []),
    ...(input.includeNotesContext && acceptedEvidence.length ? [{ title: "Reviewed reflection evidence", items: acceptedEvidence.map(acceptedEvidenceSentence) }] : []),
    { title: "Missing data / confidence notes", items: analysis.missingData.length ? analysis.missingData : ["No major missing-data notes were produced for this session."] },
    { title: "Disclaimer", items: ["This is a training-support summary, not a replacement for a coach watching you shoot."] },
  ].filter((section) => section.items.length > 0);
  const plainText = sections.map((section) => `${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`).join("\n\n");
  return { analysis, title, discipline, hasNotesContext: Boolean(input.includeNotesContext && analysis.notesBasedContext), sections, plainText };
}
