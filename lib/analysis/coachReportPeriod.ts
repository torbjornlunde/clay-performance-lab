import type { AnalysisMiss, PrivateSessionAnalysisNote } from "./deterministicSessionAnalysis";
import { scoreFromMisses, totalMisses } from "../misses/scoring";

export type CoachReportPeriodSession = { id: string; name?: string | null; discipline?: string | null; session_type?: string | null; own_score?: number | null; total_targets?: number | null; created_at?: string | null; competition_date?: string | null; shooting_ground?: string | null };
export type CoachReportPeriodInput = { fromDate: string; toDate: string; sessions: CoachReportPeriodSession[]; missesBySession?: Record<string, AnalysisMiss[]>; privateNotesBySession?: Record<string, PrivateSessionAnalysisNote[]>; includeNotesContext?: boolean };
export type CoachReportDataQuality = "Good" | "Limited" | "Weak";

function clean(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return clean(value).toLowerCase(); }
function typeOf(session: CoachReportPeriodSession) { return lower(session.session_type) === "competition" ? "Competition" : "Training"; }
function dateOf(session: CoachReportPeriodSession) { return String(session.competition_date || session.created_at || "").slice(0, 10); }
function venueFor(session: CoachReportPeriodSession) { return clean(session.shooting_ground) || "venue not recorded"; }
function scoreFor(session: CoachReportPeriodSession, misses: AnalysisMiss[]) { const total = typeof session.total_targets === "number" ? session.total_targets : null; const score = typeof session.own_score === "number" ? session.own_score : total !== null ? scoreFromMisses(total, totalMisses(misses)) : null; return { score, total, pct: typeof score === "number" && total ? (score / total) * 100 : null }; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function fmtPct(value: number) { return `${value.toFixed(1).replace(/\.0$/, "")}%`; }
function periodDays(fromDate: string, toDate: string) { const from = Date.parse(`${fromDate}T00:00:00`); const to = Date.parse(`${toDate}T00:00:00`); return Number.isFinite(from) && Number.isFinite(to) ? Math.max(1, Math.round((to - from) / 86400000) + 1) : 0; }
function isUseful(value: unknown) { const normalized = lower(value); return Boolean(normalized) && !["unknown", "not sure", "n/a", "na", "none", "null", "-", "details not added"].includes(normalized); }
function reasonLabel(miss: AnalysisMiss) { return clean(miss.main_reason || miss.where_miss || miss.missed_target); }
function detailLabel(miss: AnalysisMiss) { return [miss.target_type, miss.direction, miss.target_label, miss.where_miss].map(clean).filter(Boolean).slice(0, 2).join("/"); }
function sessionName(session: CoachReportPeriodSession) { return clean(session.name) || "Untitled session"; }
function summarizeNotes(notes: PrivateSessionAnalysisNote[]) { const text = notes.map((note) => lower(note.body)).join(" "); const themes = [[/tired|fatigue|energy|exhaust/i, "fatigue or low energy"], [/rush|rushed|fast|hurry/i, "rushing or tempo control"], [/focus|concentrat|mental/i, "focus or concentration"], [/wind|weather|rain|light|sun|visibility/i, "weather or visibility"], [/hold|gun|mount|feet|stance|line|lead|timing/i, "setup, line, lead, hold point, or movement timing"]].filter(([pattern]) => (pattern as RegExp).test(text)).map(([, label]) => String(label)); return themes; }
function compactSessionList(sessions: CoachReportPeriodSession[]) { return sessions.slice(0, 4).map((session) => `${dateOf(session)} ${sessionName(session)} (${venueFor(session)})`).join("; ") + (sessions.length > 4 ? `; plus ${sessions.length - 4} more` : ""); }
function numberedPriorities(items: string[]) { return items.map((item, index) => `Priority ${index + 1}: ${item}`); }

export function buildPeriodCoachReport(input: CoachReportPeriodInput) {
  const sessions = [...input.sessions].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const missesBySession = input.missesBySession || {};
  const privateNotesBySession = input.privateNotesBySession || {};
  const training = sessions.filter((session) => typeOf(session) === "Training");
  const competition = sessions.filter((session) => typeOf(session) === "Competition");
  const scored = sessions.map((session) => ({ session, ...scoreFor(session, missesBySession[session.id] || []) })).filter((item): item is ReturnType<typeof scoreFor> & { session: CoachReportPeriodSession; score: number; total: number; pct: number } => typeof item.score === "number" && typeof item.total === "number" && typeof item.pct === "number");
  const allMisses = sessions.flatMap((session) => (missesBySession[session.id] || []).map((miss) => ({ miss, session })));
  const detailedMisses = allMisses.filter(({ miss }) => isUseful(miss.main_reason) && !/^(technical|tactical|target difficulty|other)$/i.test(clean(miss.main_reason)));
  const broadMisses = allMisses.filter(({ miss }) => !isUseful(miss.main_reason) || /^(technical|tactical|target difficulty|other)$/i.test(clean(miss.main_reason)));
  const notes = sessions.flatMap((session) => privateNotesBySession[session.id] || []).filter((note) => clean(note.body));
  const noteThemes = input.includeNotesContext ? summarizeNotes(notes) : [];
  const dataPoints = (scored.length / Math.max(1, sessions.length)) + (allMisses.length ? 1 : 0) + (detailedMisses.length ? 1 : 0) + (notes.length ? 0.5 : 0);
  const dataQuality: CoachReportDataQuality = dataPoints >= 3 ? "Good" : dataPoints >= 1.5 ? "Limited" : "Weak";
  const missReasons = new Map<string, { count: number; sessions: Set<string>; examples: Set<string> }>();
  for (const { miss, session } of allMisses) { const label = reasonLabel(miss); if (!isUseful(label)) continue; const current = missReasons.get(label) || { count: 0, sessions: new Set<string>(), examples: new Set<string>() }; current.count += 1; current.sessions.add(`${dateOf(session)} ${sessionName(session)} (${venueFor(session)})`); const detail = detailLabel(miss); if (detail) current.examples.add(detail); missReasons.set(label, current); }
  const repeated = [...missReasons.entries()].filter(([, value]) => value.count > 1).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
  const avgPct = average(scored.map((item) => item.pct));
  const best = scored.length ? [...scored].sort((a, b) => b.pct - a.pct)[0] : null;
  const weakest = scored.length ? [...scored].sort((a, b) => a.pct - b.pct)[0] : null;
  const repeatedItems = repeated.length ? repeated.map(([label, value], index) => { const examples = [...value.sessions].slice(0, 2).join("; "); const details = [...value.examples].slice(0, 2).join(", "); const broad = /^(technical|tactical|target difficulty|other)$/i.test(label); const test = broad ? "Miss reason data is too broad to identify the exact cause. Use future notes/miss details to separate lead, line, hold point, visual pickup, decision, and timing." : `Use a short verification drill: recreate this presentation, shoot 10 deliberate pairs, and log whether the miss is line, lead, hold point, visual pickup, or movement timing.`; return `${label} misses are ${index === 0 ? "the strongest" : "a repeated"} pattern, with ${value.count} misses across selected sessions${examples ? ` (${examples})` : ""}${details ? `, especially ${details}` : ""}. This suggests the next training block should test the specific cause rather than only counting misses. ${test}`; }) : ["No repeated miss pattern was strong enough from the selected sessions. Keep logging miss reason plus target type so the next report can separate technical, tactical, and presentation problems."];
  const priorityBodies = repeated.length ? repeated.map(([label, value]) => `${/technical/i.test(label) ? "Technical verification" : /tactical/i.test(label) ? "Decision/routine" : /difficulty|target/i.test(label) ? "Target presentation control" : `${label} verification`}. ${value.count} misses point to this as a useful training focus; recreate the affected presentations and write down the exact cause after each stand.`) : ["Data quality. Log score, total targets, miss reason, and short private context after each stand so future reports can identify patterns with confidence."];
  const trainingPriorities = numberedPriorities([...priorityBodies, "Data quality checkpoint. After each stand, record the missed target type and whether the likely cause was line, lead, hold point, movement timing, visual pickup, routine, or conditions."]);
  const sections = [
    { title: "Basic coach report", items: ["This version is based on saved scores, miss data, and summarized notes. AI interpretation will become more detailed as more structured miss and target data is added."] },
    { title: "Coach summary", items: [`${sessions.length} selected sessions from ${input.fromDate} to ${input.toDate}: ${training.length} training and ${competition.length} competition. Notes context included: ${input.includeNotesContext && notes.length ? "yes" : "no"}. Data quality: ${dataQuality}.`, scored.length ? `Average hit rate is ${avgPct !== null ? fmtPct(avgPct) : "not available"}${best ? `; best was ${sessionName(best.session)} at ${best.score}/${best.total}` : ""}${weakest ? `; weakest was ${sessionName(weakest.session)} at ${weakest.score}/${weakest.total}` : ""}.` : "Score trend is limited because selected sessions are missing score or total target data."] },
    { title: "What the data shows", items: [`Included sessions: ${compactSessionList(sessions) || "none"}.`, allMisses.length ? `${allMisses.length} miss rows were available. ${detailedMisses.length} had detailed reasons and ${broadMisses.length} were broad, unknown, or not specific enough for precise diagnosis.` : "No miss rows were available, so the report can summarize attendance and scores but cannot diagnose miss patterns.", repeatedItems[0]] },
    { title: "Main focus areas", items: repeatedItems },
    { title: "Recommended training", items: trainingPriorities },
    { title: "Session notes/context", items: input.includeNotesContext && notes.length ? [`Private notes suggest ${noteThemes.length ? noteThemes.join(", ") : "context may have affected parts of the period"}. Treat this as context, not confirmed cause.`, "Only summarized note themes are included. Raw private notes are not shown."] : [notes.length ? "Notes context is available but turned off for this report." : "No private note context was available for the selected sessions."] },
    { title: "Data quality and missing information", items: [`${scored.length} of ${sessions.length} selected sessions have score and total target data.`, `${detailedMisses.length} miss rows have detailed reasons; ${broadMisses.length} are broad, unknown, or missing reasons.`, dataQuality === "Good" ? "Coach confidence is good for high-level priorities, but exact technique still needs field verification." : dataQuality === "Limited" ? "Coach confidence is limited: use this report to choose what to test next, not as proof of the root cause." : "Coach confidence is weak because the report lacks enough score, miss, or context detail.", "To improve future reports, log score/total targets, target presentation, miss reason, and a short private note when conditions or focus affected the session."] },
  ];
  const plainText = sections.map((section) => `${section.title}\n${section.items.map((item) => `- ${item}`).join("\n")}`).join("\n\n");
  return { sections, plainText, hasNotesContext: input.includeNotesContext === true && notes.length > 0, trainingCount: training.length, competitionCount: competition.length, selectedSessionCount: sessions.length, periodDays: periodDays(input.fromDate, input.toDate), dataQuality };
}
